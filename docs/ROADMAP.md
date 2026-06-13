# UnlikelyLand — Roadmap

## Update (post-MVP iteration)

Shipped beyond the original slice: **equip/unequip + use consumables** (equipped
modifiers now apply in combat/checks), **leaderboards** (level/wealth/reputation),
**guilds** (create/join/leave/view), and **global chat** (moderated, rate-limited,
respects blocking). Plus CI that builds & publishes Docker images to GHCR and a
self-contained Hostinger compose-URL deploy (see [DEPLOY-HOSTINGER.md](DEPLOY-HOSTINGER.md)).
Still pending: friends/blocking endpoints, market listings, achievement awarding,
mail, prestige.

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

## Milestone 2 — Inventory & items depth
- Equip/unequip with stat modifiers applied in combat/checks
- Consumables (e.g. stamina/heal)
- More fallback encounters per pool; per-region flavour
- Profile polish; richer settings (story style already plumbed into prompts)

## Milestone 3 — Social
- Global chat (schema exists) — polling first, WebSocket later (Redis pub/sub)
- Friends / friend requests / blocking (blocking hides messages, DMs, requests)
- Basic leaderboards (level / Notoriety / wealth — indexes already in schema)
- Public achievements surfaced (achievement catalog seeded)
- Guild create / join / leave / profile (schema exists)

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
| Chat safety | Schema-only in MVP | Moderation blocklist already exists to reuse; add rate limits in M3 |
| Prisma `String` enums | Chosen over DB enums for evolvability | Validated by zod at the boundary |
