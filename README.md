# Cardinal — AI Co-DM Assistant

A **backstage-only** AI assistant for tabletop RPG Dungeon Masters (D&D 5e, 2024 revision). Cardinal preps the world, story, NPCs and combat balance before each session, then feeds the DM everything needed to perform live: location descriptions, NPC embodiment cards, balanced shop inventories, encounter difficulty against the party's *current* resources, and narrative difficulty levers. The DM is the only interface to the players. Players never see or hear Cardinal.

Built for iPad, touch-only, and usable offline.

## Core principles (enforced in code, not just prose)

| Principle | Where it lives |
|---|---|
| **DM-only interface** | `playerSafeView` / `findLeaks` in `@cardinal/core` are the only path to player-facing text; the recap generator scans its own output for backstage terms before the DM sees it. |
| **No invisible fudging** | `proposeDifficultyLevers` returns options with a *cost*; the combat screen requires a tap to approve each one and tags the cost as a consequence. Nothing changes a stat silently. |
| **Manual override is first-class** | Every tracked number is a `Stepper` on the Quick Edit screen; the reducer records an `OverrideRecord` and that value is the ground truth passed to every prompt. |
| **Consequences persist** | `Consequence` records with `earliestSessionNumber`; the brief, location scenes and NPC cards resurface them. |
| **DM authority is absolute** | Every generation is a proposal (`GenerationResult`), editable or discardable. Off-script content lands as `provisional` canon until approved. |

See [`docs/PRINCIPLES.md`](docs/PRINCIPLES.md) for the full mapping.

## Repository layout

```
packages/
  core/            Pure, LLM-free domain logic: versioned schema, migrations, reducer, encounter
                   math, economy, progression, canon checks, fog of knowledge, combat tracker,
                   recaps, session brief data. 100% unit-testable without a network.
  rules-5e-2024/   Editable JSON data layer: XP budgets, CR→XP, level thresholds, price tables,
                   sample stat blocks, spells, conditions. Validated against core's schema at load.
  ai/              LLM boundary: provider interface, Anthropic adapter (structured outputs),
                   deterministic mock provider, validated generators, generation log, asset cache.
  app/             iPad-first React PWA: prep, live table, recap, hidden inspector, IndexedDB
                   persistence with versioned snapshots, export/import.
docs/              ARCHITECTURE, GLOSSARY, PRINCIPLES, RULES-DATA
CHANGELOG.md       Running history of changes
```

## Getting started

```bash
pnpm install
pnpm check        # typecheck + tests + build
pnpm dev          # http://localhost:5173 (open on the iPad via your LAN IP; add to Home Screen)
```

The app runs fully offline with a built-in mock provider. To use Claude, open **Settings**, choose Anthropic and paste an API key (stored only on the device). See `docs/ARCHITECTURE.md` for the proxy recommendation in shared deployments.

## Testing

```bash
pnpm test                  # all packages (vitest)
pnpm --filter @cardinal/core typecheck
```

Core math (encounter budgets, pricing, XP, spotlight, canon) is pure and tested without any LLM. The AI layer is tested against the mock provider, including malformed output, refusals and timeouts.

An end-to-end smoke test drives every screen of the built app in headless Chromium with the mock provider:

```bash
pnpm build && (pnpm --filter @cardinal/app exec vite preview --port 4173 &) && pnpm smoke
```
It needs `playwright` available (`pnpm add -Dw playwright && npx playwright install chromium`, or set `CHROMIUM_PATH`).

## Licensing of rules data

Monster, spell and equipment summaries in `packages/rules-5e-2024/data` are abridged from the System Reference Document 5.2 by Wizards of the Coast LLC, available under the Creative Commons Attribution 4.0 International License. Encounter budgets follow the 2024 Dungeon Master's Guide; verify them against your copy and edit the JSON if needed.
