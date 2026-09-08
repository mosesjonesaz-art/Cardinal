# Principles → enforcement map

The specification's non-negotiables, and the concrete code that upholds each.

## 1. DM-only interface
- The app has no player mode, no sharing, no broadcast. All screens are DM screens.
- `playerSafeView(campaign)` (`core/knowledge.ts`) strips secret events, secret NPCs, undiscovered/provisional locations, secret threads, backstage facts and every `secretMotive` / `secretNotes` field. It is the **only** input to the player recap prompt (`ai/generators/recap.ts`).
- `findLeaks(text, campaign)` scans generated text for backstage terms; the recap generator removes leaking sentences and falls back to the deterministic recap if nothing survives. The Recap screen also shows a red banner if the DM's edited text mentions a backstage term.
- Voice/art assets are cached and played on the DM's device only (`ai/assets.ts`).

## 2. No invisible fudging
- `proposeDifficultyLevers` (`core/encounter.ts`) produces options that each carry `narrative`, `cost`, `mechanicalEffect`, `xpDelta`. The AI may only reword levers with known ids (`ai/generators/levers.ts` drops anything else, because there is no cost model for it).
- The Combat screen shows levers with **Approve / Reject** buttons. Approving logs an event and tags the cost as a `Consequence`. Only the "retreat" and "reinforcements" levers touch the tracker, and only by removing/adding whole combatants; stats are never edited by the AI.
- `readLiveCombat` recomputes difficulty from actual remaining HP so the DM sees the real state, not a target.

## 3. Manual override is first-class
- Quick Edit screen: every tracked value (HP, temp HP, gold, XP, level, spell slots, resources, flags, faction reputation) is a `Stepper` (tap ±, hold to repeat, tap number to type). No confirmation dialog, no reason required.
- Reducer actions `setPcHp`, `adjustPcHp`, `adjustGold`, `setGold`, `setPcXp`, `setPcLevel`, `setFlag`, `adjustReputation`, `setReputation`, `setNpcStatus` and the generic `override` each append an `OverrideRecord` (`core/state.ts`). The Inspector lists them.
- Prompts state "The state you are given is ground truth, including values the DM has overridden" (`ai/prompts.ts`) and the campaign passed to every generator is the post-override state.
- Generic `override` validates the resulting campaign against the schema so a bad path cannot corrupt the save.

## 4. Consequences persist
- `Consequence` records (`core/schema.ts`) with affected NPCs/factions/PCs and `earliestSessionNumber`.
- `dueConsequences` feeds the session brief; `consequencesForNpc` feeds NPC cards; `consequencesForLocation` feeds location scenes. NPC `memories` accumulate via `npcRemember`.
- `suggestConsequenceTags` auto-tags logged choices (death, theft, promise, insult, mercy, betrayal, destruction).

## 5. DM authority is absolute
- Every AI call returns a `GenerationResult` the UI renders as a proposal with Keep/Discard or inline editing. Nothing is written to the campaign without a tap.
- Off-script content becomes `provisional` records; the Setup and NPC screens offer "Approve into canon".
- Shop prices are editable per item before selling; encounter proposals can be discarded; the brief is a document, not a plan the app enforces.

## Player-facing recap
Passive text the DM copies and posts. Built from the player-safe view, leak-scanned, editable. See `packages/ai/src/generators/recap.ts`.

## Safety tools
Lines and veils are recorded at session zero, included in every prompt, and checked after generation with `scanSafety`. A read-aloud that hits a line is replaced with the canonical location description and flagged.
