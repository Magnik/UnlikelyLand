# UnlikelyLand MVP Architecture

## Package boundaries

UnlikelyLand is a TypeScript pnpm monorepo:

| Location | Responsibility |
| --- | --- |
| `apps/web` | React browser application and the source packaged by Capacitor for Android |
| `apps/api` | Authoritative Fastify REST API and authentication/authorization |
| `apps/worker` | Durable asynchronous job consumers; the only process allowed to invoke AI providers |
| `packages/contracts` | Versioned runtime request, response, error, job, and generated-content schemas |
| `packages/gameplay` | Server-only deterministic stamina, eligibility, event, reward, and item rules |
| `packages/database` | PostgreSQL migrations, schema, and transaction-aware repositories |
| `packages/ai` | Vendor-neutral provider interface and hostile-output validation pipeline |

The browser and Capacitor Android builds use the same UI and API client. Capacitor adds platform capabilities and secure token storage, but contains no authoritative gameplay logic. Clients submit intents only. Client-provided stamina, timestamps, rewards, outcomes, ownership, item effects, currencies, or progression changes are ignored and must never appear in mutation request contracts.

## Delivery and authentication

The web build is the primary artifact. Capacitor packages that artifact for Android. Access tokens are short-lived and held in memory. Refresh tokens rotate on every use, have replay detection and server-side revocation, and are stored in an Android Keystore-backed secure-storage plugin on Android. Browser refresh tokens use `Secure`, `HttpOnly`, `SameSite` cookies. Logout and detected replay revoke the token family.

All identifiers are treated as enumerable. Every resource lookup is scoped to the authenticated player. Rate limits cover authentication, gameplay mutations, generation requests, and job polling. Narrative text is rendered as text, never executable HTML.

## Authoritative gameplay loop

1. The player submits an authenticated exploration intent with an idempotency key.
2. In one PostgreSQL transaction, the API claims the idempotency key, locks player state and relevant cooldown rows, regenerates stamina using server time, and validates action eligibility, cooldown, and stamina.
3. The API atomically assigns an existing approved event, spends stamina, updates cooldown/state projections, appends ledger entries, and stores the response against the idempotency record.
4. If no approved event can be assigned, the API commits an outbox record and job-status row, returns HTTP `202` with `generation_pending`, and spends no stamina.
5. A worker generates and approves content asynchronously. Gameplay requests never wait for AI.
6. To resolve an event, the API locks player state and the player-owned event instance. It validates ownership, availability, expiration against server time, selected choice, and idempotency before applying server-owned effects, rewards, inventory/progression changes, ledger entries, and the stored response in one transaction.
7. Item usage similarly locks player state and the player-owned inventory row, then validates item state, eligibility, approved content version, allowed effects, and idempotency before applying effects and consuming or modifying the item.

Random outcomes and reward calculations run only on the server. Purchases, rate limits, timestamps, stamina, cooldowns, event state, currency, inventory, item use, character stats, progression, and generated-content approval are always server validated.

## Stamina contract

Stamina regenerates lazily from `stamina_updated_at` using server time and whole elapsed intervals. Exact interval boundaries grant one unit. Regeneration is capped at capacity; spending can never produce a negative value. If the stored timestamp is in the future or the server clock moves backward, elapsed time is clamped to zero. Clients may estimate stamina for display but server responses remain authoritative.

Read requests need not write unless a persisted projection is required. Mutations lock the player-state row and persist the regenerated state before validation and mutation.

## Idempotency contract

Every mutation requires `Idempotency-Key`. Records are uniquely scoped by authenticated player, operation, and key, and bind to a canonical request hash. An identical retry returns the original HTTP status and response body. Reusing the key with a different payload returns `IDEMPOTENCY_PAYLOAD_MISMATCH`. In-progress duplicates wait briefly or return `IDEMPOTENCY_IN_PROGRESS`; they never execute concurrently.

## Persistence and transaction model

PostgreSQL is the source of truth. Normalized mutable projections support reads; an append-only gameplay ledger explains every mutation. Approved content versions are immutable. Player event instances and inventory items reference the exact approved content version used, even after retirement or a newer version.

Primary tables are `users`, `refresh_token_families`, `player_gameplay_state`, `action_cooldowns`, `event_content_versions`, `event_choices`, `player_event_instances`, `item_definition_versions`, `inventory_items`, `gameplay_ledger`, `idempotency_records`, `async_jobs`, and `outbox_messages`.

Required constraints include non-negative stamina/currency/experience, stamina not exceeding capacity, unique event-choice IDs per content version, unique idempotency scope, immutable approved versions, and valid status enums. Required indexes cover player event status/expiry, inventory owner/state, ledger player/time, job owner/status, outbox unpublished/time, and idempotency scope.

All gameplay mutations use transactions and `SELECT ... FOR UPDATE` on mutable player/resource rows. Ledger entries are append-only. The database package owns forward-applicable migrations and repositories require an explicit transaction handle for mutation methods.

The transactional outbox coordinates PostgreSQL and the durable Redis/BullMQ queue: API transactions create job and outbox rows together; a publisher retries unpublished rows until BullMQ accepts the deterministic job ID, then marks them published. Queue publication is idempotent. A committed job cannot be silently lost, and a worker may safely execute more than once.

Lifecycle cleanup runs as durable maintenance jobs. Idempotency records retain stored mutation results for 30 days, then may be deleted only after their replay window closes. Completed jobs retain player-visible status for 30 days; failed and dead-letter jobs retain diagnostics for 90 days. Published outbox rows are deleted after 7 days once publication is confirmed. Gameplay ledger entries and immutable approved-content versions are never removed by these cleanup jobs and follow separate archival policy.

## AI and worker boundary

AI output is hostile candidate content. Providers cannot access player records, persist approved content, select authoritative random outcomes, or mutate gameplay. Only workers invoke providers.

The worker pipeline is: generate with timeout, strictly parse the versioned schema, moderate, validate allowlisted identifiers and reward budgets, map proposals to server-owned effect templates, normalize, and persist a new immutable approved version. Unknown fields, invalid enums, duplicate choice IDs, excessive lengths, unsupported identifiers, non-finite numbers, and out-of-range values are rejected.

Jobs use deterministic idempotency keys and expose `queued`, `running`, `succeeded`, `failed`, or `dead_letter` status. Retries use bounded exponential backoff with jitter. Provider timeouts and crashes are retryable; schema/moderation failures are terminal or selectively regenerated. Persisting approved content and completing the job are idempotent. Job status endpoints authenticate and verify owner or privileged-role access.

AI-proposed outcomes and item effects are never applied directly. Approval maps them to allowlisted server-owned effect templates constrained by rarity and reward budgets.

## API contracts

- `GET /v1/gameplay/state`: server-calculated state, inventory summary, active event.
- `POST /v1/gameplay/explore`: authenticated intent; atomically spends stamina only when assigning an approved event.
- `POST /v1/gameplay/events/:eventInstanceId/resolve`: atomically validates and resolves a player-owned event.
- `POST /v1/gameplay/items/:itemInstanceId/use`: atomically validates and uses a player-owned item.
- `GET /v1/jobs/:jobId`: authorized asynchronous status lookup.

The shared runtime schemas in `packages/contracts` are the source of truth. API routes are versioned independently from immutable generated-content schema versions.

Each documented endpoint has shared schemas for its path parameters, mutation idempotency headers, request body, and response body. Assigned-event responses include only player-safe choice IDs and labels; authoritative effects remain server-side. Item rewards always identify the exact immutable definition version granted.

## Verification requirements

Unit tests cover stamina exact boundaries, capacity, insufficient stamina, future timestamps, and clock rollback. Schema/property tests cover strict parsing, duplicate IDs, size/range limits, finite numbers, effect allowlists, and reward budgets. PostgreSQL integration tests use concurrent requests to prove stamina cannot be overspent, events/items cannot resolve twice, and rewards cannot duplicate. Worker tests cover outbox publication failure, duplicate execution, crashes after persistence, timeouts, retries, moderation rejection, and dead-letter behavior. Contract and end-to-end tests cover successful exploration/resolution, generation pending without stamina cost, retries, expired events, and item use in both browser and Capacitor Android builds.

The API package owns the PostgreSQL concurrency integration suite. The web package owns browser end-to-end coverage and runs the same scenarios against the Capacitor Android build in CI. These suites are release gates and must execute against production-equivalent PostgreSQL, Redis, API, worker, and built client artifacts.
