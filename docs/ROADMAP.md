# UnlikelyLand — Roadmap

## Update (post-MVP iteration)

Shipped beyond the original slice: **equip/unequip + use consumables** (equipped
modifiers now apply in combat/checks), **leaderboards** (level/wealth/reputation),
**guilds** (create/join/leave/view), and **global chat** (moderated, rate-limited,
respects blocking). Plus CI that builds & publishes Docker images to GHCR and a
self-contained Hostinger compose-URL deploy (see [DEPLOY-HOSTINGER.md](DEPLOY-HOSTINGER.md)).
Then completed in a second wave: **market** (list/buy/cancel with escrow + Clams
ledger), **friends + blocking**, **private mail**, **achievement awarding**
(surfaced on profile), **prestige/escape** (level-gated run reset with permanent
legacy stats), **AI item-concept intake**, **admin NPC promotion**, **story-memory
compaction**, **regions seeded + used in prompts**, and a **background worker
container** that injects ambient async "while you were away" events.

Genuinely remaining (need external tooling or are upgrades over a brief-approved
choice): a **signed Android APK** (requires Android Studio + a keystore + Play
Console — see [ANDROID.md](ANDROID.md); the web is Capacitor-ready) and **WebSocket
real-time** chat (polling is implemented and the brief explicitly allows it). Some
listed tests remain integration-level rather than unit (the engine + DTO schemas
are unit-tested).

## Status: first playable vertical slice — COMPLETE

The acceptance criteria from the brief are met by the current build:

- [x] Run locally with Docker Compose
- [x] Register / log in (username + password, JWT, bcrypt)
- [x] Get a character with starter stats, assigned a random region set
- [x] Dashboard with live, **server-side** stamina regen
- [x] Choose an expedition type and start it
- [x] Receive an AI **or** fallback encounter with 2–4 choices
- [x] Pick an option; the server resolves it
- [x] Combat can happen; you can win or lose
- [x] Receive validated XP / Clams / Notoriety / Oddments / item drops
- [x] You can die → death/revival screen (wait, pay, or free weird revive)
- [x] Story Memory updates on resolution
- [x] An encounter **cannot be resolved twice** (idempotent + race-safe)
- [x] Works with Ollama offline (mandatory fallback content)
- [x] UI works on mobile + desktop widths
- [x] Admin user reaches the admin dashboard
- [x] AI can be toggled off to force fallback mode

Foundational coverage beyond the minimum slice: 48 hand-curated fallback encounters, an economy ledger, hidden Story Memory + NPC records, a Prisma schema that already anticipates market/social/guild/prestige, an item catalog + AI item-concept review, and an admin surface (AI logs/toggle, players, economy, story-memory debug, concept approve/reject).

## Milestone 2 — Inventory, items & profile depth — COMPLETE

- [x] Inventory system: dedicated page, six slots, six rarities, equip/unequip (one per non-consumable slot), use consumables, ownership-verified, transactional.
- [x] Equipment & a single centralized **effective-stat** service (base + equipped modifiers) used by combat/checks and shown in the UI.
- [x] Server-controlled **approved item drops** via a centralized loot service (expedition-type / level / rarity-weighted), awarded inside the resolution transaction, logged to the reward/economy audit, idempotent (no double-grants).
- [x] 38-item seeded catalog across all slots and rarities (rare+ kept scarce as drops).
- [x] **AI item-concept review pipeline**: schema → moderation (family floor) → rule validator (slot/rarity/length/power-budget/prohibited) → server-generated balanced stats → auto-approve low-power common/uncommon, else admin queue. The AI never supplies stat numbers.
- [x] **+54 fallback encounters** (130+ total) across seven pools, now including dedicated **mystery** and **work** pools; modular file-per-pool loading; rating-tagged and preference-biased.
- [x] Editable, server-moderated **bio**; public **profile** (public-only fields); **content rating** setting; **structured** story-style preferences wired into both AI generation and fallback selection (no free-form prompt injection).
- [x] Richer progression feedback (level-up celebration, stat/reward deltas).
- [x] Admin item-review tools (validation status, auto-approval, approve/reject), item catalog browser, character-inventory inspection.
- [x] Security hardening: rate limiting (auth/resolve/start), prod JWT-secret guard, prestige inventory cleanup, Zod-validated admin inputs.
- [x] Expanded test suite (72 unit tests: loot, effective-stats, item-validator, fallback selection, content, rewards).

Deferred from M2 (intentionally): consumables restore stamina only (effect model is extensible); per-region flavour beyond the prompt blurb; an integration suite against a test Postgres for the service layer.

## Milestone 3 — Social & moderation — COMPLETE

A persistent shared world that protects private story content and protects players
from abuse. Migration `0004_milestone3_social` (additive) backs all of it.

- [x] **Global chat**: moderated + rate-limited + duplicate-protected, paginated
      ("load older"), timestamps, guild tags, **bidirectional** block filtering,
      in-line reporting. Channel routing (`channelType`/`regionSetId`/`guildId`)
      scaffolded for region/guild channels; structured so WebSockets can be added
      later without touching the business rules.
- [x] **Reporting + moderation**: player reports (categorised, deduped, reporter
      hidden); a `@Roles('moderator')` console — review reports, hide/delete/restore
      messages, mute/warn; **every** action written to an append-only
      `ModerationAction` audit trail. Admin-only: ban/unban, grant/revoke moderator,
      disband guild. Privilege separation: moderators never reach AI logs / raw
      Story Memory / economy ledger.
- [x] **Friends + blocking** via a centralized `RelationshipService`
      (`isBlockedEitherWay`/`blockedIdsForFeed`/`relationshipStatus`) consumed by
      chat, mail, search and profile so block semantics can't drift per feature.
- [x] **Private mail** (inbox/outbox/unread/mark-read/per-side delete), addressed by
      id or an unambiguous unique name (fixes the display-name misdelivery bug),
      rate-limited, moderated, block-respecting.
- [x] **Public player profiles** (`/u/[id]`): display name + optional title, level,
      region, guild + tag, public achievements, coarse stat summary, equipment,
      combat victories, recent activity, and in-context friend/block/report
      controls — block-enforced (blocked → 404). No private data exposed.
- [x] **Public achievements** via a central evaluation service (`evaluateEncounter`
      + named `on*` hooks), 13 seeded achievements, **idempotent** awarding, and a
      public **activity feed**.
- [x] **Leaderboards**: level / wealth (normal currency only) / reputation / combat
      victories / public-achievement count — paginated, with the viewer's own rank
      even when off-page, deterministic tie-breaking, index-backed, opt-out flag.
- [x] **Guilds**: tag, moderated name/description, owner/officer/member roles with
      server-side enforcement (promote/demote/kick/transfer), founder-can't-abandon,
      search, transactional everywhere.
- [x] **Region-set social identity** surfaced on dashboard + profile; region/guild
      chat channels scaffolded in the schema.
- [x] **Security**: DB-authoritative role re-check + ban enforcement in `AuthGuard`
      (a demoted/banned token stops working immediately), JWT algorithm pinning,
      hardened moderation (leetspeak normalization + display-name moderation),
      rate-limited social write endpoints, optimistic name uniqueness.
- [x] **Tests**: +31 unit tests (relationship/block, achievement idempotency +
      evaluator, friends/blocking, guild role enforcement, moderation hardening) —
      103 total, all passing.

## Post-Milestone 3 — recommended-next follow-ups — COMPLETE

The "next priorities" from the M3 wrap-up, now shipped (migrations `0005`–`0006`):

- [x] **Region & guild chat channels live** — chat send/list now scope by
      `channelType` (global / region = your region set / guild = your guild); UI tabs.
- [x] **Guild progression** — an Oddments **bank** (deposit any member, withdraw
      owner/officer, audited via the economy ledger) + guild **XP/level** from
      contributions, on the guild profile. Migration `0005_guild_progression`.
- [x] **Region-filtered leaderboards** — a "My region" toggle scopes every board to
      one region set (self-rank respects it). Time *periods* (weekly/monthly) are
      deferred — windowing cumulative stats needs periodic snapshots.
- [x] **Short-lived access + refresh tokens** — 30m access + 30d refresh, transparent
      client refresh on 401, and a per-user `tokenVersion` (migration
      `0006_token_version`) so logout/ban revokes outstanding tokens at once.
- [x] **Realtime chat via SSE** — `GET /chat/stream` pulses on new messages (no body;
      client re-fetches through the filtered endpoint), polling as fallback. Plus a
      **Postgres integration-test scaffold** (`npm run test:integration`, skips without
      `TEST_DATABASE_URL`) with a real bidirectional-block test.

## Milestone 4 — Market & economy ops
- Player-to-player listings (schema exists): create / buy / cancel with ownership + price + quantity validation in a transaction; normal currency only
- AI item-concept intake → review queue → approval (validation layer exists)
- Admin economy dashboards + better moderation tooling

## Milestone 5 — Depth & platform
- Longer / multi-day expeditions and story arcs; unresolved-thread payoffs
- Popular-NPC promotion (private → shared → global)
- Region events; async "while you were away" events
- Per-resolution AI narration (gateway already supports it)
- Prestige / escape loop (schema + boundaries exist)
- PWA polish (offline shell, install prompts) + Android via Capacitor (see ANDROID.md)
- PvP is explicitly **not** planned for these milestones, but nothing is designed to preclude it.

## Risks & deliberate simplifications

| Area | Decision / risk | Mitigation |
|---|---|---|
| Image size | Runtime images copy the full `node_modules` for reliability | Optimize later (prune/`next standalone`); fine for an MVP VPS |
| Outcome text | Engine-generated, not per-resolution AI | Gateway pattern already supports adding AI narration |
| Local LLM quality | Small models drift from `encounter.v1` | Strict validation + moderation + retry + guaranteed fallback |
| Single character/user | Simplifies MVP | Prestige/multi-run anticipated in schema |
| Chat safety | Blocklist is a blunt regex (leet-normalized) | Paired with player reporting + a moderator review queue + audit trail; swap `moderateText` for a model/API later without changing callers |
| Token revocation | No denylist; bans rely on a per-request DB role/ban re-check | `AuthGuard` re-reads role + `bannedAt` every request so bans take effect within the token lifetime; a short-lived-access + refresh model is the upgrade path |
| Prisma `String` enums | Chosen over DB enums for evolvability | Validated by zod at the boundary |
