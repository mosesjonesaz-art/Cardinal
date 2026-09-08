# Changelog

All notable changes to Cardinal. Each entry: what changed, why, and anything a DM needs to know (schema migrations, rule-data edits).

## 0.1.0 — 2026-09-08

Initial build from the AI Co-DM Assistant specification.

- **Schema v2** (`@cardinal/core`): campaign, party, world (locations, factions, NPCs, stat blocks, plot threads, facts, shops, encounters, flags), fog of knowledge, sessions/events, consequences, override records, safety tools, feature flags. Migration framework with a v1→v2 step.
- **Reducer**: single `reduceCampaign` entry point; quick-edit actions record overrides as ground truth.
- **Encounter math** for 5e 2024 (per-character XP budgets, no group multiplier) plus a current-state read that scales the budget by remaining HP/slots/resources; balance flags; narrative difficulty levers with costs.
- **Economy**: config-driven pricing (settlement, reputation, wealth band, category markup), deterministic seeded inventories balanced to the party's liquid gold, AI-boundary price clamping.
- **Progression, spotlight balancing, canon checks, player-safe view and leak detection, consequences, combat tracker, recaps, session brief data, bonus timeline / faction map / loot log.**
- **Rules data package** `@cardinal/rules-5e-2024`: JSON tables validated at load; 27 sample stat blocks, 15 spells, 15 conditions, 68 price-table rows.
- **AI layer** `@cardinal/ai`: provider interface, Anthropic adapter (structured outputs via `messages.parse`, effort per call, refusal/timeout handling), mock provider with default handlers, `GenerationService` (timeout, schema + post validation, fail-soft fallback, generation log), ten generators (location scene, off-script, NPC card, shop, encounter proposal, difficulty levers, session brief, player recap, tactics, canon check), NPC asset cache with mood directives.
- **App** `@cardinal/app`: iPad-first PWA with Campaigns, Setup (session zero), Prep, Live (Navigate, NPCs, Shop, Combat, Lookup, Quick edit), Recap, Settings and a hidden Inspector (tap the title five times). IndexedDB persistence with versioned snapshots, JSON export/import with migration, offline detection.
- **Docs**: architecture, glossary, principles map, rules-data editing guide.
- **Tooling**: GitHub Actions CI (typecheck, tests, build) and `scripts/smoke.mjs`, a Playwright end-to-end smoke test of the built app.
