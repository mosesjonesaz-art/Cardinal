import { describe, expect, it } from "vitest";
import { z } from "zod";
import { makeTestCampaign, makeTestRuleset } from "@cardinal/core/testing";
import { GenerationLog, GenerationService, MockProvider, ProviderError, defaultMockHandlers, defineGenerator } from "../index.js";

const echo = defineGenerator<{ n: number }, { doubled: number; note: string }>({
  name: "echo",
  schema: z.object({ doubled: z.number(), note: z.string() }),
  buildPrompt: (i) => ({ system: "sys", user: `n=${i.n}` }),
  postValidate: (o) => (o.doubled > 100 ? { output: { ...o, doubled: 100 }, issues: ["clamped to 100"] } : { output: o, issues: [] }),
  fallback: (i) => ({ doubled: i.n * 2, note: "fallback" }),
});

describe("GenerationService", () => {
  it("validates, post-validates and logs a successful generation", async () => {
    const provider = new MockProvider().on("echo", (ctx) => ({ doubled: (ctx as { n: number }).n * 2, note: "llm" }));
    const svc = new GenerationService({ provider, timeoutMs: 1000 });
    const r = await svc.run(echo, { n: 4 });
    expect(r).toMatchObject({ output: { doubled: 8, note: "llm" }, source: "llm", issues: [] });
    const entry = svc.log.get(r.logId)!;
    expect(entry.generator).toBe("echo");
    expect(entry.prompt.user).toBe("n=4");
    expect(entry.rawOutput).toEqual({ doubled: 8, note: "llm" });
  });
  it("applies post-validation clamps and records the issue", async () => {
    const provider = new MockProvider().on("echo", () => ({ doubled: 9999, note: "wild" }));
    const svc = new GenerationService({ provider });
    const r = await svc.run(echo, { n: 1 });
    expect(r.output.doubled).toBe(100);
    expect(r.issues).toEqual(["clamped to 100"]);
    expect(r.source).toBe("llm");
  });
  it("falls back on malformed output", async () => {
    const provider = new MockProvider().on("echo", () => ({ doubled: "nope" }));
    const svc = new GenerationService({ provider });
    const r = await svc.run(echo, { n: 3 });
    expect(r.source).toBe("fallback");
    expect(r.output).toEqual({ doubled: 6, note: "fallback" });
    expect(r.error).toContain("schema validation");
    expect(svc.log.list()[0]?.source).toBe("fallback");
  });
  it("falls back on provider errors (refusal, network)", async () => {
    const provider = new MockProvider().on("echo", () => ({ doubled: 1, note: "" })).failOnce("refusal");
    const svc = new GenerationService({ provider });
    const r = await svc.run(echo, { n: 5 });
    expect(r.source).toBe("fallback");
    expect(r.error).toContain("refusal");
    const again = await svc.run(echo, { n: 5 });
    expect(again.source).toBe("llm");
  });
  it("times out and degrades instead of blocking", async () => {
    const provider = new MockProvider().on("echo", () => ({ doubled: 1, note: "" })).setDelay(200);
    const svc = new GenerationService({ provider, timeoutMs: 20 });
    const started = Date.now();
    const r = await svc.run(echo, { n: 2 });
    expect(r.source).toBe("fallback");
    expect(r.error).toContain("Timed out");
    expect(Date.now() - started).toBeLessThan(150);
  });
  it("supports swapping providers at runtime", async () => {
    const svc = new GenerationService({ provider: new MockProvider() });
    expect((await svc.run(echo, { n: 1 })).source).toBe("fallback");
    svc.setProvider(new MockProvider().on("echo", () => ({ doubled: 2, note: "x" })));
    expect((await svc.run(echo, { n: 1 })).source).toBe("llm");
  });
  it("keeps a bounded log with a sink", () => {
    const seen: string[] = [];
    const log = new GenerationLog(2, { append: (e) => void seen.push(e.id) });
    for (let i = 0; i < 3; i++) log.append({ id: `g${i}`, at: "", generator: "x", provider: "m", source: "llm", durationMs: 0, input: null, prompt: { system: "", user: "" }, output: null, issues: [] });
    expect(log.size).toBe(2);
    expect(log.list().map((e) => e.id)).toEqual(["g2", "g1"]);
    expect(seen).toEqual(["g0", "g1", "g2"]);
  });
  it("ProviderError carries a kind", () => {
    const e = new ProviderError("x", "timeout");
    expect(e.kind).toBe("timeout");
  });
});

describe("default mock handlers", () => {
  it("cover every generator name", () => {
    expect(Object.keys(defaultMockHandlers).sort()).toEqual(["canonCheck", "difficultyLevers", "encounterProposal", "locationScene", "npcCard", "offScript", "playerRecap", "sessionBrief", "shopInventory", "tacticalAdvice"]);
  });
  it("produce schema-valid outputs for the test campaign", async () => {
    const campaign = makeTestCampaign();
    const rules = makeTestRuleset();
    const { locationSceneGenerator, npcCardGenerator, shopGenerator, encounterGenerator, briefGenerator, playerRecapGenerator, offScriptGenerator, canonCheckGenerator } = await import("../index.js");
    const svc = new GenerationService({ provider: new MockProvider({ handlers: defaultMockHandlers }) });
    const results = await Promise.all([
      svc.run(locationSceneGenerator, { campaign, locationId: "loc_inn" }),
      svc.run(npcCardGenerator, { campaign, npcId: "npc_mara" }),
      svc.run(shopGenerator, { campaign, rules, shopKind: "general", settlementSize: "town", seed: "s" }),
      svc.run(encounterGenerator, { campaign, rules, difficulty: "moderate" }),
      svc.run(briefGenerator, { campaign, rules }),
      svc.run(playerRecapGenerator, { campaign, sessionId: "ses_1" }),
      svc.run(offScriptGenerator, { campaign, dmPrompt: "the old mill", parentLocationId: "loc_town" }),
      svc.run(canonCheckGenerator, { campaign, proposedText: "Old Wick greets them." }),
    ]);
    for (const r of results) expect(r.source, r.logId).toBe("llm");
    expect((results[7]!.output as { contradictions: unknown[] }).contradictions).toHaveLength(1);
  });
});
