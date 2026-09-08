import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, migrateCampaign, MigrationError, safeParseCampaign, createCampaign } from "../index.js";
import { makeTestCampaign } from "../testing.js";

describe("schema & migrations", () => {
  it("parses the test campaign and applies defaults", () => {
    const c = makeTestCampaign();
    expect(c.schemaVersion).toBe(SCHEMA_VERSION);
    expect(c.party.members[0]?.tempHp).toBe(0);
    expect(c.world.npcs[0]?.assets).toEqual({});
  });

  it("createCampaign yields a valid campaign with ids and timestamps", () => {
    const c = createCampaign({ name: "New" });
    expect(safeParseCampaign(c).ok).toBe(true);
    expect(c.id.startsWith("cmp_")).toBe(true);
  });

  it("migrates a v1 save file (questFlags → world.flags, adds safety/featureFlags/consequences)", () => {
    const v1 = { ...makeTestCampaign(), schemaVersion: 1, questFlags: { "old.flag": 3 } } as Record<string, unknown>;
    delete v1.safety;
    delete v1.featureFlags;
    delete v1.consequences;
    const r = migrateCampaign(v1);
    expect(r.fromVersion).toBe(1);
    expect(r.appliedSteps).toHaveLength(1);
    expect(r.campaign.schemaVersion).toBe(SCHEMA_VERSION);
    expect(r.campaign.world.flags["old.flag"]).toBe(3);
    expect(r.campaign.world.flags["quest.tower.started"]).toBe(true);
    expect(r.campaign.safety.lines).toEqual([]);
    expect(r.campaign.consequences).toEqual([]);
  });

  it("is a no-op for a current-version file", () => {
    const r = migrateCampaign(makeTestCampaign());
    expect(r.appliedSteps).toEqual([]);
  });

  it("refuses save files from a newer app", () => {
    expect(() => migrateCampaign({ ...makeTestCampaign(), schemaVersion: SCHEMA_VERSION + 1 })).toThrow(MigrationError);
  });

  it("reports validation problems readably", () => {
    const r = safeParseCampaign({ ...makeTestCampaign(), name: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("name");
  });
});
