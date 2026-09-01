import assert from "node:assert/strict";
import test from "node:test";
import { BOK_SERIES, bokStatisticUrl, collectMacroSnapshot, impliedFxSwapPoints, parseTreasuryRows } from "../src/macroService.mjs";

test("BOK endpoints use the documented daily market-rate series", () => {
  const url = bokStatisticUrl("key with spaces", BOK_SERIES.krGov10y, "20260801", "20260815");
  assert.match(url, /817Y002\/D\/20260801\/20260815\/010210000$/);
  assert.match(url, /key%20with%20spaces/);
});

test("Treasury XML parser returns 10-year and 3-month yields", () => {
  const xml = `<feed><entry><content><m:properties><d:NEW_DATE>2026-08-28T00:00:00</d:NEW_DATE><d:BC_3MONTH>4.10</d:BC_3MONTH><d:BC_10YEAR>4.25</d:BC_10YEAR></m:properties></content></entry></feed>`;
  assert.deepEqual(parseTreasuryRows(xml), [{ asOf: "2026-08-28T00:00:00", us10y: 4.25, us3m: 4.1 }]);
});

test("implied 3-month FX swap points follow covered interest parity", () => {
  const points = impliedFxSwapPoints({ spot: 1400, krwRate: 3.2, usdRate: 4.2, days: 91 });
  assert.ok(points < 0);
  assert.ok(Math.abs(points + 3.48) < 0.1);
});

test("macro snapshot combines official BOK, Treasury, and EIA values", async () => {
  const xml = `<feed><entry><d:NEW_DATE>2026-08-27T00:00:00</d:NEW_DATE><d:BC_3MONTH>4.10</d:BC_3MONTH><d:BC_10YEAR>4.25</d:BC_10YEAR></entry><entry><d:NEW_DATE>2026-08-28T00:00:00</d:NEW_DATE><d:BC_3MONTH>4.20</d:BC_3MONTH><d:BC_10YEAR>4.30</d:BC_10YEAR></entry></feed>`;
  const fetchImpl = async (url) => {
    if (url.includes("home.treasury.gov")) return { ok: true, text: async () => xml };
    if (url.includes("api.eia.gov")) return { ok: true, json: async () => ({ response: { data: [{ period: "2026-08-29", value: "70.00" }, { period: "2026-08-28", value: "69.00" }] } }) };
    if (url.includes("731Y003")) return { ok: true, json: async () => ({ StatisticSearch: { row: [{ TIME: "20260827", DATA_VALUE: "1400" }, { TIME: "20260828", DATA_VALUE: "1402" }] } }) };
    if (url.includes("010210000")) return { ok: true, json: async () => ({ StatisticSearch: { row: [{ TIME: "20260827", DATA_VALUE: "3.20" }, { TIME: "20260828", DATA_VALUE: "3.30" }] } }) };
    return { ok: true, json: async () => ({ StatisticSearch: { row: [{ TIME: "20260827", DATA_VALUE: "3.00" }, { TIME: "20260828", DATA_VALUE: "3.10" }] } }) };
  };
  const snapshot = await collectMacroSnapshot({ bokApiKey: "bok", eiaApiKey: "eia", fetchImpl, now: new Date("2026-08-31T00:00:00Z") });
  const values = Object.fromEntries(snapshot.items.map((item) => [item.id, item]));
  assert.equal(values["usd-krw"].price, 1402);
  assert.equal(values["kr-gov-10y"].price, 3.3);
  assert.equal(values["us-gov-10y"].price, 4.3);
  assert.equal(values.wti.price, 70);
  assert.ok(values["usd-krw-swap-3m"].price < 0);
});
