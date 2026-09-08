/**
 * End-to-end smoke test for the built app. Drives every screen with the mock provider.
 *
 *   pnpm build && pnpm --filter @cardinal/app exec vite preview --port 4173 &
 *   node scripts/smoke.mjs            # needs `playwright` installed (pnpm add -Dw playwright && npx playwright install chromium)
 *
 * Set CHROMIUM_PATH to use a pre-installed Chromium. Exits non-zero on any failed step or console/page error.
 */
import { chromium } from "playwright";
const errors = [];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
const step = async (name, fn) => { try { await fn(); console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "-", e.message.split("\n")[0]); errors.push(name + ": " + e.message.split("\n")[0]); } };
await page.goto(process.env.APP_URL ?? "http://localhost:4173/");
await step("home renders", async () => { await page.getByText("Your campaigns").waitFor({ timeout: 10000 }); });
await step("load sample", async () => { await page.getByRole("button", { name: "Load sample campaign" }).click(); await page.getByText("Cardinal · Greywater Sample").waitFor(); });
await step("prep shows brief text + encounters", async () => { await page.getByText("Per-PC debrief").first().waitFor(); await page.getByText("Goblins at the outer wall").first().waitFor(); });
await step("generate brief (mock)", async () => { await page.getByRole("button", { name: "Generate session brief" }).click(); await page.getByText("Opening scene:").waitFor({ timeout: 10000 }); });
await step("propose encounter", async () => { await page.getByRole("button", { name: "Propose", exact: true }).click(); await page.getByRole("button", { name: "Keep" }).waitFor({ timeout: 10000 }); await page.getByRole("button", { name: "Keep" }).click(); });
await step("create session", async () => { await page.getByRole("button", { name: /Create session 2/ }).click(); });
await step("live navigate: describe here", async () => { await page.getByRole("button", { name: "Live", exact: true }).click(); await page.getByRole("button", { name: "Describe here" }).click(); await page.locator(".readaloud").first().waitFor({ timeout: 10000 }); });
await step("live navigate: move into inn", async () => { await page.getByRole("button", { name: /^The Drowned Rat/ }).click(); await page.getByText("Greywater Valley › Millbrook › The Drowned Rat").waitFor({ timeout: 10000 }); });
await step("off-script", async () => { await page.getByPlaceholder("they follow the smugglers' trail into the marsh").fill("the flooded cellar"); await page.getByRole("button", { name: "Generate from canon" }).click(); await page.getByRole("button", { name: "Use it (provisional)" }).click(); await page.getByText("provisional").first().waitFor({ timeout: 10000 }); });
await step("npc card", async () => { await page.getByRole("button", { name: "NPCs", exact: true }).click(); await page.getByRole("button", { name: /^Mara Tell/ }).click(); await page.getByRole("button", { name: "Embodiment card" }).click(); await page.getByText("Voice cue:").waitFor({ timeout: 10000 }); await page.getByText("Launders coin").waitFor(); });
await step("npc mood one tap", async () => { await page.locator(".pill-row button", { hasText: "hostile" }).first().click(); await page.getByText("Mood (hostile)").waitFor(); });
await step("shop", async () => { await page.getByRole("button", { name: "Shop", exact: true }).click(); await page.getByRole("button", { name: "Generate inventory" }).click(); await page.getByRole("button", { name: "Sell" }).first().waitFor({ timeout: 10000 }); await page.getByRole("button", { name: "Sell" }).first().click(); });
await step("combat", async () => { await page.getByRole("button", { name: /^Combat/ }).click(); await page.getByRole("button", { name: "Roll in" }).click(); await page.getByText("Difficulty right now").waitFor(); await page.getByRole("button", { name: "Difficulty levers" }).click(); await page.getByText("Narrative difficulty levers").waitFor({ timeout: 10000 }); await page.getByRole("button", { name: "Next turn →" }).click(); await page.getByRole("button", { name: "Enemy tactics" }).click(); await page.getByText("What the enemies do").waitFor(); });
await step("lookup", async () => { await page.getByRole("button", { name: "Lookup" }).click(); await page.getByPlaceholder("search…").fill("troll"); await page.getByText("Regeneration").waitFor(); });
await step("quick edit", async () => { await page.getByRole("button", { name: "Quick edit" }).click(); await page.getByPlaceholder("Ava spared the goblin boss and let him run").fill("Dov stole the mayor's seal"); await page.getByRole("button", { name: "Log", exact: true }).click(); await page.getByText(/Logged/).waitFor(); const inc = page.locator(".stepper button[aria-label=increase]").first(); await inc.click(); });
await step("recap", async () => { await page.getByRole("button", { name: "Recap" }).click(); await page.getByRole("button", { name: "Generate with AI" }).click(); await page.waitForFunction(() => (document.querySelector("textarea")?.value ?? "").includes("Session 2"), null, { timeout: 10000 }); });
await step("inspector via 5 taps", async () => { for (let i = 0; i < 5; i++) await page.locator("h1").click(); await page.getByText("Last generations").waitFor(); await page.getByRole("button", { name: /Overrides \(/ }).click(); await page.getByText("party.members").first().waitFor(); });
const count = async (label) => console.log(label, await page.evaluate(async () => { const req = indexedDB.open("cardinal"); const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); const out = {}; for (const n of [...db.objectStoreNames]) out[n] = await new Promise((res) => { const r = db.transaction(n).objectStore(n).count(); r.onsuccess = () => res(r.result); }); db.close(); return JSON.stringify(out); }));
await step("undo available + persisted", async () => { await page.getByRole("button", { name: "Undo" }).waitFor(); await page.locator(".status", { hasText: /· saved$/ }).waitFor({ timeout: 5000 }); await count("before reload:"); await page.reload(); await count("after reload:"); await page.getByText("Your campaigns").waitFor(); await page.getByText("Greywater Sample").first().waitFor(); await page.getByRole("button", { name: "Open" }).first().click(); await page.getByText("Cardinal · Greywater Sample").waitFor(); });
if (process.argv[2]) await page.screenshot({ path: process.argv[2] + "/smoke.png", fullPage: false });
await browser.close();
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "NO ERRORS");
process.exit(errors.length ? 1 : 0);
