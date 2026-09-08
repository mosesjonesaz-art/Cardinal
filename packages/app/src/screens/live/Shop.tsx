import React, { useState } from "react";
import { partyWealthBand, type SettlementSize } from "@cardinal/core";
import { finalizeShop, shopGenerator, type ShopResult } from "@cardinal/ai";
import { Button, Card, Field, Issues, Pills, SourceTag, Spinner, Stepper, Tag } from "../../components/ui.js";
import { useCampaign } from "../../state/store.js";

export function ShopView({ sessionId }: { sessionId?: string }) {
  const { campaign, rules, ai, dispatch, toast } = useCampaign();
  const here = campaign.party.currentLocationId ? campaign.world.locations.find((l) => l.id === campaign.party.currentLocationId) : undefined;
  const settlementFromPath = (() => {
    let cur = here;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      if (cur.settlementSize) return cur.settlementSize;
      seen.add(cur.id);
      cur = cur.parentId ? campaign.world.locations.find((l) => l.id === cur!.parentId) : undefined;
    }
    return "town" as SettlementSize;
  })();
  const kinds = Object.keys(rules.economy.shopKinds);
  const [kind, setKind] = useState(kinds[0] ?? "general");
  const [settlement, setSettlement] = useState<SettlementSize>(settlementFromPath);
  const [ownerId, setOwnerId] = useState<string>("");
  const [shop, setShop] = useState<(ShopResult & { source: "llm" | "fallback"; issues: string[] }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [buyer, setBuyer] = useState<string>(campaign.party.members[0]?.id ?? "shared");
  const wealth = partyWealthBand(rules, campaign.party);
  const owner = campaign.world.npcs.find((n) => n.id === ownerId);
  const reputation = owner ? owner.relationshipToParty : 0;

  const generate = async () => {
    setBusy(true);
    const input = { campaign, rules, shopKind: kind, settlementSize: settlement, seed: `${here?.id ?? "x"}:${kind}:${Date.now()}`, reputation, ownerNpcId: ownerId || undefined };
    const r = await ai.run(shopGenerator, input);
    setShop({ ...finalizeShop(r.output, input), source: r.source, issues: r.issues });
    setBusy(false);
  };
  const buy = (itemId: string) => {
    if (!shop) return;
    const item = shop.items.find((i) => i.id === itemId);
    if (!item || item.stock <= 0) return;
    const target = buyer === "shared" ? { shared: true as const } : { pcId: buyer };
    const gold = buyer === "shared" ? campaign.party.sharedGold : campaign.party.members.find((m) => m.id === buyer)?.gold ?? 0;
    if (gold < item.priceGp) return toast(`Not enough gold (${gold} gp).`, "warn");
    dispatch({ type: "adjustGold", target, delta: -item.priceGp, reason: `bought ${item.name}` });
    dispatch({ type: "giveItem", target, item: { name: item.name, category: item.category, quantity: 1, valueGp: item.basePriceGp, notes: "" } });
    if (sessionId) dispatch({ type: "logEvent", sessionId, event: { kind: "transaction", text: `${buyer === "shared" ? "The party" : campaign.party.members.find((m) => m.id === buyer)?.name} bought ${item.name} for ${item.priceGp} gp at ${shop.shopName}.`, pcIds: buyer === "shared" ? [] : [buyer], npcIds: ownerId ? [ownerId] : [], tags: ["loot"] } });
    setShop({ ...shop, items: shop.items.map((i) => (i.id === itemId ? { ...i, stock: i.stock - 1 } : i)) });
  };

  return (
    <div className="grid wide">
      <Card title="Set up the shop">
        <div className="muted small">Party: {Math.round(wealth.liquidGold)} gp liquid · wealth band “{wealth.label}” (price ×{wealth.multiplier}) · {here?.name ?? "no location"}</div>
        <Field label="Kind"><Pills options={kinds.map((k) => ({ value: k, label: k }))} value={kind} onChange={setKind} /></Field>
        <Field label="Settlement"><Pills options={(["hamlet", "village", "town", "city", "metropolis"] as const).map((s) => ({ value: s, label: s }))} value={settlement} onChange={setSettlement} /></Field>
        <Field label="Shopkeeper (reputation sets the markup)">
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">(unnamed keeper, neutral)</option>
            {campaign.world.npcs.filter((n) => n.status === "alive").map((n) => <option key={n.id} value={n.id}>{n.name} ({n.relationshipToParty})</option>)}
          </select>
        </Field>
        <Button variant="primary" onClick={() => void generate()} disabled={busy}>{busy ? "Stocking…" : "Generate inventory"}</Button>
      </Card>
      <Card title={shop?.shopName ?? "Inventory"} right={shop && <SourceTag source={shop.source} issues={shop.issues} />}>
        {busy && <Spinner label="Balancing prices against the party's purse…" />}
        {shop && (
          <div className="stack">
            <p className="small">{shop.description}</p>
            <div className="readaloud small">“{shop.keeperLine}”</div>
            <Field label="Buyer">
              <Pills options={[...campaign.party.members.map((m) => ({ value: m.id, label: `${m.name} (${m.gold} gp)` })), { value: "shared", label: `Party purse (${campaign.party.sharedGold} gp)` }]} value={buyer} onChange={setBuyer} />
            </Field>
            <ul className="list">
              {shop.items.map((i) => (
                <li key={i.id} className="row between">
                  <span>
                    <strong>{i.name}</strong> <Tag>{i.category}</Tag>{i.rarity !== "common" && <Tag kind="warn">{i.rarity}</Tag>}
                    <div className="muted small">{i.description}</div>
                  </span>
                  <span className="row">
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{i.priceGp} gp</span>
                    <span className="muted small">×{i.stock}</span>
                    <Stepper value={i.priceGp} min={0} onChange={(v) => setShop({ ...shop, items: shop.items.map((x) => (x.id === i.id ? { ...x, priceGp: v } : x)) })} />
                    <Button small variant="primary" disabled={i.stock <= 0} onClick={() => buy(i.id)}>Sell</Button>
                  </span>
                </li>
              ))}
            </ul>
            <details><summary className="muted small">How prices were set</summary><pre className="raw">{shop.explanation.join("\n")}</pre></details>
            <Issues issues={shop.issues} />
          </div>
        )}
        {!shop && !busy && <p className="muted">Inventory and prices come from the rules data and the party's actual gold. Edit any price with the stepper.</p>}
      </Card>
    </div>
  );
}
