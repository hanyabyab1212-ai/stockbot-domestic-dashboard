import assert from "node:assert/strict";
import test from "node:test";
import { TRADE_PRODUCTS, collectTradeSnapshot, comtradeExportUrl, monthRange, previousMonth, sumPrimaryValue } from "../src/tradeService.mjs";

test("trade periods cross a year boundary in chronological order", () => {
  assert.equal(previousMonth("202601"), "202512");
  assert.deepEqual(monthRange("202601", 3), ["202511", "202512", "202601"]);
});

test("UN Comtrade export URL uses Korean worldwide HS exports", () => {
  const url = new URL(comtradeExportUrl("202508", TRADE_PRODUCTS[1].hsCodes));
  assert.equal(url.searchParams.get("reporterCode"), "410");
  assert.equal(url.searchParams.get("flowCode"), "X");
  assert.equal(url.searchParams.get("cmdCode"), "3303,3304,3305,3306,3307");
});

test("cosmetics product rows aggregate to one monthly export amount", () => {
  assert.equal(sumPrimaryValue([{ primaryValue: 12 }, { primaryValue: "30" }]), 42);
  assert.equal(sumPrimaryValue([]), null);
});

test("trade snapshot saves a monthly series and preserves unavailable old data", async () => {
  const fetchImpl = async (url) => {
    const code = new URL(url).searchParams.get("cmdCode");
    if (code === "8542") return { ok: true, status: 200, json: async () => ({ data: [{ primaryValue: 100 }] }) };
    return { ok: true, status: 200, json: async () => ({ data: [{ primaryValue: 40 }, { primaryValue: 2 }] }) };
  };
  const snapshot = await collectTradeSnapshot({ fetchImpl, now: new Date("2026-03-02T00:00:00Z"), historyMonths: 2, delayMs: 0, retries: 0 });
  assert.equal(snapshot.asOf, "202602");
  assert.deepEqual(snapshot.categories[0].rows, [{ period: "202601", value: 100 }, { period: "202602", value: 100 }]);
  assert.equal(snapshot.categories[1].rows.at(-1).value, 42);
});
