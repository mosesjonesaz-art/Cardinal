/** A small ready-to-play sample campaign so a DM can explore every screen in a minute. */
import { createCampaign, type Campaign } from "@cardinal/core";

export function createSampleCampaign(): Campaign {
  const now = new Date().toISOString();
  return createCampaign(
    {
      name: "Greywater Sample",
      setting: "A mill town on a flooding river, at the edge of a haunted valley.",
      tone: "Grim but hopeful; small kindnesses matter.",
      houseRules: ["Potions are a bonus action to drink."],
      safety: { lines: ["harm to children"], veils: ["torture"], notes: "Agreed at session zero." },
      featureFlags: { timeline: true, factionMap: true, lootLog: true },
      party: {
        currentLocationId: "loc_town",
        sharedGold: 40,
        members: [
          { id: "pc_ava", name: "Ava", playerName: "Sam", className: "Fighter", species: "Human", level: 3, xp: 950, maxHp: 28, currentHp: 28, armorClass: 17, gold: 60, resources: [{ name: "Second Wind", max: 1, used: 0, recharge: "short-rest" }, { name: "Action Surge", max: 1, used: 0, recharge: "short-rest" }], goals: [{ id: "g1", text: "Find her missing brother, Tomas" }] },
          { id: "pc_bram", name: "Bram", playerName: "Jo", className: "Wizard", species: "Halfling", level: 3, xp: 950, maxHp: 17, currentHp: 17, armorClass: 12, gold: 35, spellSlots: [{ level: 1, max: 4, used: 0 }, { level: 2, max: 2, used: 0 }], goals: [{ id: "g2", text: "Recover the stolen grimoire" }], privateKnowledge: ["fact_grimoire"] },
          { id: "pc_cass", name: "Cass", playerName: "Ren", className: "Cleric", species: "Dwarf", level: 3, xp: 950, maxHp: 24, currentHp: 24, armorClass: 16, gold: 20, spellSlots: [{ level: 1, max: 4, used: 0 }, { level: 2, max: 2, used: 0 }], resources: [{ name: "Channel Divinity", max: 1, used: 0, recharge: "short-rest" }], goals: [{ id: "g3", text: "Consecrate the drowned shrine" }] },
          { id: "pc_dov", name: "Dov", playerName: "Kit", className: "Rogue", species: "Elf", level: 3, xp: 950, maxHp: 21, currentHp: 21, armorClass: 15, gold: 15, goals: [{ id: "g4", text: "Pay off the debt to the Ashen Hand", secret: true }] },
        ],
      },
      world: {
        locations: [
          { id: "loc_valley", name: "Greywater Valley", kind: "region", description: "Fog, mills, and drowned fields.", discoveredByParty: true },
          { id: "loc_town", name: "Millbrook", kind: "town", parentId: "loc_valley", settlementSize: "town", description: "A mill town on the river; waterwheels turn day and night.", secretNotes: "The mayor is in debt to the Ashen Hand.", discoveredByParty: true, hooks: ["A wanted poster for 'the Cinder Priest' with no face drawn."] },
          { id: "loc_inn", name: "The Drowned Rat", kind: "building", parentId: "loc_town", description: "A damp riverside inn with a leaning chimney and very good stew.", discoveredByParty: true },
          { id: "loc_market", name: "Market Square", kind: "district", parentId: "loc_town", description: "Stalls under sailcloth; the smell of fish and iron.", discoveredByParty: true },
          { id: "loc_ruins", name: "Old Watchtower", kind: "dungeon", parentId: "loc_valley", description: "A crumbling tower on the ridge above the mist.", secretNotes: "The Cinder Priest's cult uses the cellar. Something older sleeps beneath.", hooks: ["Lights seen at night", "Goblins have moved into the outer wall"] },
        ],
        factions: [
          { id: "fac_hand", name: "Ashen Hand", description: "Smugglers with a taste for old relics.", reputation: -20, secret: true, goals: ["Control the river trade", "Wake what sleeps under the tower"] },
          { id: "fac_militia", name: "Millbrook Militia", description: "Overworked, underpaid.", reputation: 15, relationships: [{ factionId: "fac_hand", stance: "hostile", note: "Knows they exist, can't prove it." }] },
        ],
        npcs: [
          { id: "npc_mara", name: "Mara Tell", role: "innkeeper", locationId: "loc_inn", appearance: "Broad, grey braid, burn scar on one forearm.", personality: "Warm, watchful, never forgets a tab.", motive: "Keep the inn afloat", secretMotive: "Launders coin for the Ashen Hand", mood: "warm", relationshipToParty: 20, voice: { pitch: "low", pace: "brisk", texture: "smoky", accent: "riverfolk drawl", catchphrases: ["Mind the step."] }, mannerisms: ["wipes the same glass", "taps the bar twice before bad news"], memories: [{ summary: "The party paid for the chair Ava broke.", sentiment: 0.4, createdAt: now }] },
          { id: "npc_orrin", name: "Captain Orrin", role: "militia captain", locationId: "loc_town", factionId: "fac_militia", appearance: "Lean, limping, immaculate coat.", personality: "Formal; thaws slowly.", motive: "Keep order without bloodshed", mood: "wary", relationshipToParty: 5, voice: { pitch: "medium", pace: "measured", texture: "clipped", catchphrases: ["We do this properly."] }, mannerisms: ["straightens things on desks"] },
          { id: "npc_hesk", name: "Hesk", role: "smith", locationId: "loc_market", appearance: "Soot to the elbows.", personality: "Cheerful haggler.", motive: "Sell the good steel to people who'll use it", mood: "elated", relationshipToParty: 0, voice: { pitch: "high", pace: "rapid", catchphrases: ["Touch it, you've bought it."] } },
          { id: "npc_wick", name: "Old Wick", role: "hermit", locationId: "loc_ruins", status: "dead", appearance: "Was: bird-thin, robed in sacking.", motive: "Was: warn travellers off the tower" },
          { id: "npc_villain", name: "The Cinder Priest", role: "cult leader", factionId: "fac_hand", secret: true, appearance: "Never seen unmasked.", secretMotive: "Wake the thing under the tower", mood: "scheming", relationshipToParty: -40, voice: { pitch: "very-low", pace: "slow", texture: "ash-dry" } },
        ],
        statBlocks: [],
        plotThreads: [
          { id: "thr_tower", title: "Lights in the Watchtower", summary: "Someone is using the ruins at night.", status: "active", hooks: ["Orrin will pay 50 gp for proof", "A goblin deserter knows the cellar door"], involvedNpcIds: ["npc_villain", "npc_orrin"], involvedFactionIds: ["fac_hand"], secret: false },
          { id: "thr_tomas", title: "Ava's brother", summary: "Tomas joined the Ashen Hand willingly.", status: "active", involvedPcIds: ["pc_ava"], involvedFactionIds: ["fac_hand"], secret: true },
        ],
        facts: [
          { id: "fact_flood", statement: "The river floods every spring.", secret: false },
          { id: "fact_grimoire", statement: "The grimoire was sold to the Cinder Priest.", secret: true, relatedNpcIds: ["npc_villain"] },
          { id: "fact_mayor", statement: "The mayor owes the Ashen Hand 500 gp.", secret: true },
          { id: "fact_tomas", statement: "Tomas is alive and serves the Cinder Priest.", secret: true, relatedNpcIds: ["npc_villain"] },
        ],
        shops: [],
        encounters: [
          { id: "enc_goblins", name: "Goblins at the outer wall", locationId: "loc_ruins", monsters: [{ statBlockId: "mon_goblin", count: 4 }, { statBlockId: "mon_goblin_boss", count: 1 }], status: "planned", narrative: "Deserters from the cult's hired muscle." },
          { id: "enc_cellar", name: "The cellar rite", locationId: "loc_ruins", monsters: [{ statBlockId: "mon_cult_fanatic", count: 1 }, { statBlockId: "mon_cultist", count: 4 }], status: "planned", narrative: "If interrupted, the fanatic flees with the grimoire." },
        ],
        flags: { "quest.tower.started": true },
      },
      knowledge: { partyKnown: ["fact_flood"] },
      sessions: [
        {
          id: "ses_1",
          number: 1,
          title: "Arrival",
          status: "complete",
          events: [
            { id: "evt_1", at: now, kind: "narrative", text: "The party arrived in Millbrook at dusk and took rooms at the Drowned Rat.", pcIds: ["pc_ava", "pc_bram", "pc_cass", "pc_dov"], locationId: "loc_inn" },
            { id: "evt_2", at: now, kind: "npc-interaction", text: "Mara Tell mentioned lights on the ridge.", npcIds: ["npc_mara"], pcIds: ["pc_ava"], locationId: "loc_inn" },
            { id: "evt_3", at: now, kind: "choice", text: "Ava threatened a drunk militia reservist who insulted Cass.", pcIds: ["pc_ava", "pc_cass"], tags: ["insult"] },
            { id: "evt_4", at: now, kind: "note", text: "The Cinder Priest watched from the rafters.", secret: true, npcIds: ["npc_villain"] },
          ],
          playerRecap: "",
          dmRecap: "",
        },
      ],
      consequences: [
        { id: "csq_1", sessionId: "ses_1", eventId: "evt_3", description: "The reservist tells Captain Orrin the party is trouble; Orrin is cooler toward them.", severity: "minor", affectedNpcIds: ["npc_orrin"], affectedFactionIds: ["fac_militia"], affectedPcIds: ["pc_ava"], earliestSessionNumber: 2 },
      ],
    },
    now,
  );
}
