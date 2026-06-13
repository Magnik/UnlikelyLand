# UnlikelyLand — Game Design & Formulas

All numbers below live in `apps/api/src/engine/rules.ts` — the single balance surface. Change them there, not in scattered code.

## Currencies (final names for MVP)

| Category | Name | Column | Earned from |
|---|---|---|---|
| Normal money | **Clams** | `normalMoney` | most encounters; used for pay-to-revive |
| Premium money | **Escape Tokens** | `premiumMoney` | structural only — **never** granted by gameplay in MVP (no pay-to-win) |
| Crafting resources | **Oddments** | `craftingResources` | scavenging/work successes |
| Reputation | **Notoriety** | `reputation` | social/mystery successes |

New characters start with 25 Clams.

## Character identity

No class at registration — identity **emerges** from choices. 16 stats in three categories:

- **Combat:** strength, agility, toughness, accuracy, defense
- **Social:** charisma, intimidation, deception, empathy, negotiation
- **Personality:** weirdness, bravery, caution, curiosity, mischief, honor

All start at 5. A choice's `statFocus` decides which stat is checked. When the focus is a **personality** stat, resolving that choice **nudges** it (+1, or +2 for `ridiculous` risk, clamped 0–100). So helping NPCs (empathy/honor), reckless heroics (bravery), sneaky play (mischief), prudent retreats (caution), and bizarre questions (weirdness/curiosity) gradually shape who you are — and feed future AI prompts via the personality summary.

## Stamina (the only limiter)

- Max 100; regenerates **1 point / 5 minutes**, server-side.
- Recomputed live on every read from `staminaCurrent` + `staminaLastUpdatedAt`; **never trusted from the client**.
- Partial progress is preserved: the anchor advances by whole points consumed, not to "now".
- Each expedition step costs its type's `staminaPerStep` (8–14). If you can't afford the next step, the expedition ends early (no completion bonus). If you have stamina, you can keep playing.

## Expeditions

A short chain (3 steps) of encounters. Types map to a fallback content pool:

| Type | Encounter | Stamina/step |
|---|---|---|
| Explore | exploration | 12 |
| Pick a Fight | combat | 14 |
| Scavenge | scavenging | 8 |
| Socialize | social | 10 |
| Investigate | mystery→exploration | 12 |
| Train | training | 10 |
| Work a Shift | work→scavenging | 10 |

Completing all steps grants a flat completion bonus (`20×steps` XP, `18×steps` Clams). **Go Home** is offered only when the current encounter allows it (the server has final say); it ends the expedition as *abandoned* with progress preserved.

## Stat checks

```
roll  = d20 (seeded)
total = roll + statFocusValue + floor(level/2) + floor(weirdness/25)   // weirdness = luck
success = (roll == 20) OR (roll != 1 AND total >= difficulty)
difficulty by risk: low 10 · medium 14 · high 18 · ridiculous 23
```
Natural 20 always succeeds (crit); natural 1 always fails (fumble).

## Combat (turn-based, deterministic)

Triggered by a choice with `mayStartCombat`. Player swings first each round; loop until someone hits 0 HP or 24 rounds (then higher HP-fraction wins).

```
playerMaxHp = 30 + toughness*3 + level*5
enemy power = level + riskTier (low 0 / med 1 / high 3 / ridiculous 5)
hitChance   = clamp(0.6 + (attackerAccuracy - defenderAgility)*0.03, 0.10, 0.95)
damage      = max(1, attackerAttack - floor(defenderDefense/2) + variance[-2..2]) * (crit ? 2 : 1)
```
Losing a fight **downs** you. The combat log is returned for display.

## Rewards (server-only, capped)

```
performanceMult = success ? 1 + min(0.6, margin*0.03) : 0.35
xp     = round(baseXp[risk] * mult)                       // base 8/14/22/34
clams  = round(baseNormal[profile] * mult * variance±40%) // base 6/10/16/12
oddments  (success only)  ~ encounterType bias
notoriety (success only)  ~ social/mystery bias
itemDrop  (success only)  chance by profile 8–22%, rarity-weighted (common→rare; no legendary/absurd auto)
```
Hard per-encounter caps: 80 XP · 60 Clams · 12 Oddments · 8 Notoriety. **Premium currency is always 0** from gameplay. On death, rewards for that step are zero.

## Death (inconvenient, not catastrophic)

On death: `isDead`, `deathStartedAt`, `reviveAvailableAt = now + wait`, `deathReason`, `deathCount++`, and a coin-flip `freeReviveAvailable` (15% chance). Expedition fails.

```
wait = min(60min, 10min * (1 + deathCount*0.5))
payToReviveCost (Clams) = 25 + deathCount*15
```
Revive by waiting out the timer, paying Clams, or — if it rolled — a free weird event ("a confused bird lawyer argues you were only mostly dead"). Revival restores half stamina and never wipes progression.

## encounter.v1 (the AI/fallback contract)

```jsonc
{
  "schemaVersion": "encounter.v1",
  "title": "string (<=120)",
  "description": "string (<=1200)",
  "encounterType": "combat|social|exploration|mystery|work|training|scavenging",
  "allowGoHome": false,
  "goHomeLabel": "optional",
  "choices": [ {                         // 2–4, unique snake_case ids
    "id": "wrestle",
    "label": "Wrestle it shut",
    "description": "…",
    "statFocus": "<one of the 16 stats>",
    "riskLevel": "low|medium|high|ridiculous",
    "rewardProfile": "safe|balanced|risky|strange",
    "mayStartCombat": false,
    "isHiddenConsequence": false,
    "visibleHint": "optional vague hint"
  } ],
  "npcSuggestions": [], "memorySuggestions": [], "itemConceptSuggestions": []
}
```
Validation is strict (unknown fields rejected) and the schema **cannot** express rewards, stat changes, inventory grants, or death — by construction the AI can't grant power.

## Content rating

`family | pg13 | r` (default pg13). Passed into AI prompts to steer tone and into moderation. **All tiers** hard-block sexual content, hate/slurs, and graphic/app-store-hostile material; `family` additionally blocks mild-violence words. Stored per character, editable in Settings.

## Items & rarity

Slots: weapon, armor, tool, trinket, consumable, companion. Rarity tiers: common, uncommon, rare, epic, legendary, **absurd** (absurd reserved for prestige/events/admin). Drops auto-grant only low-power common/uncommon/rare from the seeded catalog. AI item *concepts* go to a pending-review table; admin approval mints an `ItemDefinition` with a rarity-capped power budget (common/uncommon auto-approvable).

## Prestige / escape (designed, not built)

Schema present (`EscapeRecord`: escapeCount, legacyLevel, summary) and service boundaries anticipate it. The intended loop: reach milestones → special escape expedition chain → on success, run ends and restarts with legacy bonuses/titles/unlocked region sets. Not implemented in MVP.
