# Glossary

Each term means exactly one thing in the data model (`packages/core/src/schema.ts`). Use these words in code, prompts, UI and issues.

| Term | Meaning | Type |
|---|---|---|
| **Campaign** | The whole save file: setting, tone, house rules, safety tools, feature flags, party, world, knowledge, sessions, consequences, overrides. Carries `schemaVersion`. | `Campaign` |
| **Party** | The player characters as a group, plus shared gold/inventory and the party's current location. | `Party` |
| **PC** (player character) | One character controlled by a player: stats, resources, goals, private knowledge, spotlight history. | `PlayerCharacter` |
| **World** | Everything objectively true about the setting: locations, factions, NPCs, stat blocks, plot threads, facts, shops, encounters, flags. | `World` |
| **Location** | A place in the hierarchy region › city › district › building › room (also wilderness, dungeon, landmark). `provisional` when generated live and not yet approved. | `Location` |
| **NPC** | A non-player character with persona, voice profile, motive, secret motive, mood, relationship to the party, memories and status. | `Npc` |
| **Stat block** | Combat statistics for a creature type. Campaign stat blocks override ruleset stat blocks with the same id. | `StatBlock` |
| **Encounter** | A planned or proposed fight: a list of (stat block id, count) plus DM-only narrative. Status: proposed → planned → running → complete / discarded. | `Encounter` |
| **Combat** | The live initiative tracker for one running encounter. Not persisted in the campaign (ephemeral app state). | `CombatState` |
| **Session** | One play session: number, title, status (planned / live / complete), event log, player recap, DM recap. | `Session` |
| **Event** | One logged thing that happened in a session. `secret` events never reach player-facing output. | `SessionEvent` |
| **Fact** | One objective truth about the world. `secret` facts are backstage until revealed. | `Fact` |
| **Knowledge / fog of knowledge** | Three layers: (a) facts = objective truth, (b) `knowledge.partyKnown` = what the party has discovered, (c) `pc.privateKnowledge` = what one PC knows that others do not. | `Knowledge` |
| **Player-safe view** | The projection of a campaign containing nothing backstage. The only source for player-facing text. | `PlayerSafeView` |
| **Consequence** | A tagged outcome of a player choice that the AI must resurface later (NPC reactions, faction shifts). | `Consequence` |
| **Override** | A DM-made change to a tracked value, recorded with previous/next values. Overridden values are ground truth. | `OverrideRecord` |
| **Spotlight** | Share of narrative focus a PC had in a session (0..1). Tracked across the campaign to forecast who is owed focus. | `SpotlightEntry` |
| **Safety tools** | `lines` (never generated) and `veils` (kept off-screen), recorded at session zero. | `SafetyTools` |
| **Feature flag** | Per-campaign toggle for bonus/experimental features. | `FeatureFlags` |
| **Ruleset config** | The editable data layer for one ruleset (budgets, CR XP, prices, stat blocks...). | `RulesetConfig` |
| **Read** (encounter read) | The computed difficulty of an encounter: XP, budgets at full rest and *now*, strength factor, flags, explanation. | `EncounterRead` |
| **Lever** (difficulty lever) | A narratively justified, costed option to change a running fight. Never auto-applied. | `DifficultyLever` |
| **Generator** | One AI task: prompt builder, output schema, post-validator, fallback. | `Generator<I, O>` |
| **Generation** | One run of a generator, logged with inputs, prompt, raw and validated output, and source (`llm` or `fallback`). | `GenerationLogEntry` |
| **Provisional** | Content the AI created live (off-script) that the DM has not yet approved into canon. | `provisional: true` |
| **Backstage** | Anything DM-only: secret motives, secret facts, secret NPCs/factions/threads, location secret notes. | — |
