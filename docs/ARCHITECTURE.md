# UnlikelyLand — Architecture

This document covers the stack decision, the system design, the server-authoritative model, and the folder structure. For tunable game numbers see [GAME-DESIGN.md](GAME-DESIGN.md); for shipping it see [DEPLOYMENT.md](DEPLOYMENT.md).

## 1. Recommended stack (and why)

The brief's preferred stack was adopted essentially as-is, because it is the right fit:

- **NestJS (API).** The game has many cooperating domains (auth, characters, expeditions, encounters, death, economy, AI, admin). Nest's module/provider/DI model keeps those boundaries explicit and the transactional core testable. Chosen over Fastify-bare because the structure pays off as systems multiply.
- **Next.js (web).** App Router + React gives a mobile-first SPA-like client with a built-in server we use purely as a same-origin **proxy** to the API (`/api/* → api:4000`). That removes CORS for browser traffic and keeps the API URL out of client bundles. It also gives us the PWA manifest path and an easy future Capacitor target.
- **PostgreSQL + Prisma.** Relational data (characters, economy ledger, market, guilds, social graph) wants a relational DB and transactions. Prisma gives typed access + migrations.
- **Zod, shared.** One `@unlikelyland/contracts` package holds every enum, the `encounter.v1` schema, and request/response DTOs. The API validates with it; the web imports the exact response types. The contract can't drift between client and server.
- **Redis.** Wired into Compose now, reserved for chat pub/sub + BullMQ background jobs in Milestone 3+. Not on the MVP critical path.
- **Ollama-compatible AI** behind a provider adapter, so the backend is swappable (local Ollama → VPS Ollama → hosted API) without touching game logic.

TypeScript everywhere; one language across the stack and the shared contract.

## 2. System design

```
                 ┌──────────── Browser / PWA / (future) Capacitor ────────────┐
                 │  Next.js client — localStorage JWT, same-origin /api/* only │
                 └───────────────────────────┬────────────────────────────────┘
                                             │  HTTPS
                                   ┌─────────▼─────────┐
                                   │   Caddy (prod)    │  auto-HTTPS reverse proxy
                                   └─────────┬─────────┘
                                   ┌─────────▼─────────┐   /api/* rewrite
                                   │  web (Next.js)    │───────────────┐
                                   └───────────────────┘               │
                                                                       ▼
   ┌────────────┐   ┌─────────┐                              ┌───────────────────┐
   │ PostgreSQL │◄──│  api    │  NestJS — authoritative      │  api (NestJS)     │
   └────────────┘   │ engine  │  rules, transactions, JWT    └─────────┬─────────┘
   ┌────────────┐   │ gateway │                                        │ proposal only
   │   Redis    │◄──│         │                              ┌─────────▼─────────┐
   └────────────┘   └─────────┘                              │ Ollama (local/VPS)│
                                                             └───────────────────┘
```

### Request/auth flow
Client stores a JWT in `localStorage` and sends it as a Bearer token. A **global `AuthGuard`** verifies it and attaches `{ userId, username, role, characterId }` to the request; routes opt out with `@Public()` (login/register/health). A **global `RolesGuard`** enforces `@Roles('admin')` on the admin surface. Identity is never taken from the client body.

### The core game loop (server-authoritative)
1. `POST /expeditions/start` — in a transaction, regenerate + spend stamina, create the expedition, then (outside the transaction) ask the AI gateway for the opening encounter.
2. The gateway tries the LLM, **validates** the JSON against `encounter.v1`, **moderates** it, **logs** the attempt, and on any failure/timeout returns **seeded fallback** content. The validated encounter is persisted; only the narrative + choices are ever sent to the client (no reward numbers live in the payload).
3. `POST /encounters/resolve` — the heart. See below.

### Resolution (`ResolutionService`) — atomic and idempotent
- Looks up the encounter, guards **idempotency**: a repeat submit with the same `clientRequestId` replays the stored outcome snapshot; an already-resolved encounter without that key is a `409`.
- Computes everything with a **seeded RNG** (`rngFor(encounterId, choiceId)`) so an outcome is reproducible/auditable: stat check → optional turn-based combat → death determination → reward (capped) → personality drift → item drop against the seeded catalog → narrative.
- Opens a single DB transaction that **claims** the encounter with a conditional `updateMany(resolved:false → true)` (a second concurrent resolve sees `count: 0` and aborts — race-safe), then applies rewards via the economy ledger, stat nudges, item grant, death state, story-memory writes, and expedition step advancement.
- **External AI calls are never inside the DB transaction.** Generating the *next* encounter happens after commit (it charges stamina in its own small transaction, then calls the provider).

This is why the AI cannot grant XP/money/items, change stats, or kill/revive: it only ever produces text + choice metadata that the engine then adjudicates.

## 3. What is server-authoritative vs. proposed

| The AI proposes | The server decides |
|---|---|
| Encounter title/description | All XP, currency, item grants (with per-encounter caps) |
| 2–4 choices (stat focus, risk, reward *profile*) | Stat-check success, combat outcome, death/revive |
| NPC + memory + item *concepts* | Stamina spend, level, reputation |
| Narrative flavour | What is persisted, after validation + moderation |

Reward *profiles* (`safe/balanced/risky/strange`) are hints; the actual numbers come from `engine/rewards.ts` and are clamped to `REWARDS.MAX_*`.

## 4. Security model (MVP)

- Passwords bcrypt-hashed; JWT signed with `JWT_SECRET` (env only).
- Global auth + role guards; admin routes role-gated.
- Every request body validated by zod at the controller boundary (`ZodBody`).
- All AI text validated against a strict schema + run through a moderation blocklist before storage/display; even R-rated content hard-blocks sexual/hate/graphic material.
- Economy mutations are centralized and **ledgered** (`EconomyTransaction`), and reward channels are capped — exploit-resistant and auditable.
- Resolution is idempotent + race-safe (no double rewards from a double tap).
- Story Memory is hidden from players (admin-only debug view).
- Secrets from env; Postgres/Redis never published publicly in prod (only Caddy is).

## 5. Folder structure

```
packages/contracts/src/
  enums.ts            # every enum (stats, rarities, currencies, ...) — single source
  stats.ts            # stat categories, labels, default block
  encounter.ts        # encounter.v1 zod schema + parse helpers
  api.ts              # request DTOs + response view types (shared with web)

apps/api/src/
  engine/             # PURE, framework-free, unit-tested game rules:
    rng, rules, stamina, leveling, checks, combat, rewards, outcome-text
  common/             # config, PrismaService, guards, ZodBody, decorators, CommonModule
  ai/                 # gateway, providers/ollama, prompt, moderation, fallback service
  content/fallback/   # 48 seeded encounters (5 JSON pools) + validation test
  auth/ characters/ expeditions/ encounters/ death/ economy/ story-memory/ admin/
  health.controller.ts  app.module.ts  main.ts
  prisma/             # schema.prisma, migrations/, seed.ts

apps/web/src/
  app/                # routes: / login register play death settings profile admin
  components/         # bars, top-nav, stat-grid, encounter-card, outcome-panel, picker
  lib/api.ts          # typed fetch client (Bearer token, /api proxy)
```

## 6. Key API routes

```
Auth        POST /auth/register  POST /auth/login  GET /auth/me  POST /auth/logout
Character   GET  /characters/me  PATCH /characters/me  GET /characters/me/inventory
Expedition  GET  /expeditions/types  GET /expeditions/active
            POST /expeditions/start  POST /expeditions/go-home
Encounter   GET  /encounters/current  POST /encounters/resolve
Death       GET  /death/status  POST /death/revive
Admin       GET/POST /admin/ai/settings   GET /admin/ai/logs
            GET  /admin/players  GET /admin/players/:id/story-memory
            GET  /admin/economy  GET /admin/item-concepts
            POST /admin/item-concepts/:id/approve|reject
Health      GET  /health (public)
```

## 7. Testing

Game rules are isolated in `engine/` and tested without Nest or a DB (vitest): stamina regen, leveling curve, stat checks (incl. nat-20/nat-1), deterministic combat, reward caps + failure scaling, RNG determinism. Plus moderation rules and validation of all 48 fallback encounters against `encounter.v1`. `npm run test` runs the contracts + API suites (49 tests at time of writing).

## 8. Deliberate MVP simplifications

- Outcome **narrative** uses the deterministic engine text generator; per-resolution AI narration is a later enhancement (the gateway pattern already supports it).
- Market, social graph, guilds, prestige/escape, and AI item-concept *intake* have **schema + (partial) service boundaries** but are not fully wired into gameplay yet — see [ROADMAP.md](ROADMAP.md).
- Chat is schema-only for MVP (admin can already read `ChatMessage`).
- Single character per user.
