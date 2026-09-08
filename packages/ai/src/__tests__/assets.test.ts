import { describe, expect, it } from "vitest";
import { makeTestCampaign } from "@cardinal/core/testing";
import { MemoryAssetCache, NpcAssetService, StubAssetGenerator, moodVoiceDirective, voiceAssetKey, type AssetBlob, type AssetGenerator } from "../index.js";

const campaign = makeTestCampaign();
const mara = campaign.world.npcs[0]!;

class CountingGenerator implements AssetGenerator {
  readonly id = "counting";
  calls = 0;
  async generateVoiceSample(): Promise<AssetBlob> {
    this.calls++;
    return { bytes: new Uint8Array([1, 2, 3]), mimeType: "audio/mpeg", createdAt: "now" };
  }
  async generatePortrait(): Promise<AssetBlob> {
    this.calls++;
    return { bytes: new Uint8Array([9]), mimeType: "image/png", createdAt: "now" };
  }
}

describe("NPC assets", () => {
  it("generates once and serves from cache afterwards", async () => {
    const gen = new CountingGenerator();
    const svc = new NpcAssetService(new MemoryAssetCache(), gen);
    const a = await svc.getVoiceSample(mara);
    const b = await svc.getVoiceSample(mara);
    expect(a.source).toBe("generated");
    expect(b.source).toBe("cache");
    expect(gen.calls).toBe(1);
    const p = await svc.getPortrait(mara);
    expect(p.source).toBe("generated");
    expect(gen.calls).toBe(2);
  });
  it("regenerates only when the voice profile changes", () => {
    const k1 = voiceAssetKey(mara);
    const k2 = voiceAssetKey({ ...mara, mood: "hostile" });
    const k3 = voiceAssetKey({ ...mara, voice: { ...mara.voice, pitch: "high" } });
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });
  it("degrades to unavailable with the stub generator", async () => {
    const svc = new NpcAssetService(new MemoryAssetCache(), new StubAssetGenerator());
    expect((await svc.getVoiceSample(mara)).source).toBe("unavailable");
  });
  it("layers mood on top of the base voice", () => {
    const d = moodVoiceDirective(mara.voice, "afraid");
    expect(d).toContain("low pitch");
    expect(d).toContain("Mood (afraid)");
  });
});
