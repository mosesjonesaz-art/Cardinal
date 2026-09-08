# Architecture

```
┌───────────────────────────── packages/app (React PWA, iPad, touch) ─────────────────────────────┐
│ screens: Home · Setup · Prep · Live(Navigate, NPCs, Shop, Combat, Lookup, QuickEdit) · Recap ·  │
│          Inspector (hidden) · Settings                                                          │
│ state/store.tsx: campaign + reduceCampaign + autosave/snapshots + undo + combat + settings      │
│ persistence/db.ts: IndexedDB (campaigns, snapshots, assets, genlog) + JSON export/import        │
└───────────────┬───────────────────────────────────────────┬────────────────────────────────────┘
                │ CampaignAction / Campaign                   │ GenerationService.run(generator, input)
┌───────────────▼──────────────────┐            ┌────────────▼───────────────────────────────────┐
│ packages/core (pure TS, no I/O)  │            │ packages/ai (LLM boundary)                     │
│ schema (zod, versioned) + migrate│  reads     │ Generator = prompt + zod schema + postValidate  │
│ state reducer + overrides        │◄───────────│              + fallback                        │
│ encounter · economy · progression│            │ GenerationService: timeout → provider → schema │
│ party/spotlight · canon · fog    │            │   validate → post-validate (core math) →       │
│ combat · recap · brief · bonus   │            │   fallback on any failure → GenerationLog      │
└───────────────▲──────────────────┘            │ providers: AnthropicProvider · MockProvider    │
                │ RulesetConfig                  │ assets: AssetCache · AssetGenerator · NpcAsset │
┌───────────────┴──────────────────┐            └────────────────────────────────────────────────┘
│ packages/rules-5e-2024 (JSON)    │
│ validated by core at load        │
└──────────────────────────────────┘
```

## Module boundaries

- **core** never imports from ai or app, never does I/O, never calls a model. Everything is a pure function over `Campaign` / `RulesetConfig`. This is what unit tests cover exhaustively.
- **rules-5e-2024** depends only on core (for the schema). Swap rulesets by providing another package that satisfies `RulesetConfig`.
- **ai** depends on core. Generators use core functions for pre-computation (budgets, baseline inventories, structured brief data) and for post-validation (price clamping, XP band checks, leak scanning). The UI never sees an unvalidated model output.
- **app** depends on all three but only through `reduceCampaign`, the generator objects, and `GenerationService`. Swapping models, prompts or providers does not touch a screen.

## The AI boundary contract

Every generator declares:
1. `schema` — zod shape of the output. The Anthropic adapter uses it for structured outputs; the service re-validates regardless of provider.
2. `postValidate` — semantic checks against ground truth (unknown NPC ids dropped, prices clamped to ±25 % of the rules price, encounter XP checked against the band, backstage leaks removed, safety lines enforced). Returns `issues[]` the UI shows as notes.
3. `fallback` — a deterministic, schema-valid result built from core alone. Used on timeout, refusal, network/auth error, malformed output. The DM always gets *something usable* mid-session.

Every run is logged (`GenerationLogEntry`: input summary, full prompt, raw output, validated output, issues, source, duration, model, token usage) in memory and IndexedDB; the Inspector reads it.

### Latency budget at the table
Live-table generators run at `effort: "low"` with ~1–2k max tokens and a 20 s default timeout (Settings). Prep generators (brief, encounter proposal) use higher effort and a 90 s timeout. The system prompt is stable and marked for prompt caching; per-call state goes in the user message.

### Model & provider
`AnthropicProvider` calls `client.messages.parse` with `zodOutputFormat(schema)` and `output_config.effort`; default model `claude-opus-5` (Sonnet 5 selectable). Refusals (`stop_reason: "refusal"`) and truncation surface as `ProviderError` and trigger the fallback. The PWA calls the API directly from the DM's device with `dangerouslyAllowBrowser: true` because the key never leaves that device; for a hosted multi-user deployment put a small proxy in front (set `baseURL`) so keys stay server-side.

### Voice & art
`NpcAssetService` generates once per NPC persona (`voice:<npcId>:<hash(voiceProfile)>`) and caches in IndexedDB; changing the voice profile changes the key; changing mood does not. Mood variation is a text directive (`moodVoiceDirective`) layered over the cached base so it costs nothing. `StubAssetGenerator` ships by default (no TTS/image provider bundled); implement `AssetGenerator` for ElevenLabs, OpenAI TTS, Stable Diffusion, etc.

## Persistence & offline
- IndexedDB via `idb`: latest campaign per id, up to 40 snapshots per campaign (labelled: session closed, combat ended, restore, undo...), asset cache, generation log (500 entries).
- Export/import as JSON; import runs `migrateCampaign` so old files upgrade.
- `vite-plugin-pwa` precaches the app shell; the app detects `navigator.onLine` and swaps to the mock provider with a banner. All non-AI features work offline.
- Undo: 50 in-memory states.

## Debuggability
- Inspector (tap title ×5): AI log with prompts and raw outputs, raw state, override history, structural canon issues, combat state.
- `checkCanon` codes are stable strings (`DEAD_NPC_ACTIVE`, `LOCATION_CYCLE`, ...).
- Fail-soft everywhere: reducer errors become toasts and leave state unchanged; generator failures become fallbacks with a visible "Fallback" tag.
