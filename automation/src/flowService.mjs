import { asNumber, IDX, normalizeRow } from "./domain.mjs";

const fromMillions = (value) => { const parsed = asNumber(value); return parsed == null ? null : parsed * 1_000_000; };
const value = (object, ...keys) => { for (const key of keys) if (object?.[key] != null && object[key] !== "") return object[key]; return null; };
const dateInKst = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date).replaceAll("-", "");

export function closeRow(payload, stock, date) {
  const output = payload.output2 || payload.output || [];
  const list = Array.isArray(output) ? output : [output];
  const item = list.find((entry) => String(value(entry, "stck_bsop_date", "date")).replaceAll("-", "") === date) || list[0];
  if (!item) throw new Error("마감 투자자 수급 행이 없습니다.");
  const closePrice = asNumber(value(item, "stck_clpr", "close_price", "stck_prpr"));
  if (!closePrice) throw new Error("마감 종가가 없습니다.");
  const foreignQty = asNumber(value(item, "frgn_ntby_qty"), 0), institutionQty = asNumber(value(item, "orgn_ntby_qty"), 0), pensionQty = asNumber(value(item, "fund_ntby_qty"), 0);
  const foreignWon = fromMillions(value(item, "frgn_ntby_tr_pbmn")) ?? foreignQty * closePrice;
  const institutionWon = fromMillions(value(item, "orgn_ntby_tr_pbmn")) ?? institutionQty * closePrice;
  const pensionWon = fromMillions(value(item, "fund_ntby_tr_pbmn")) ?? pensionQty * closePrice;
  const listedShares = asNumber(stock.listedShares); const marketCapWon = listedShares ? listedShares * closePrice : asNumber(stock.marketCapWon);
  const actualDate = String(value(item, "stck_bsop_date", "date") || date).replaceAll("-", "");
  return normalizeRow([actualDate, stock.code, stock.name, stock.market, stock.sector, closePrice, marketCapWon, foreignWon, foreignQty, institutionWon, institutionQty, pensionWon, pensionQty, asNumber(value(item, "acml_vol", "acml_volm", "volume"), 0), asNumber(value(item, "prdy_ctrt", "change_rate"), 0)]);
}

export function intradayRow(trendPayload, pricePayload, stock, date) {
  const output = trendPayload.output2 || trendPayload.output || [];
  const list = Array.isArray(output) ? output : [output];
  const item = [...list].sort((a, b) => String(value(b, "bsop_hour_gb", "hour") || "").localeCompare(String(value(a, "bsop_hour_gb", "hour") || "")))[0];
  const priceData = pricePayload.output || pricePayload;
  const closePrice = asNumber(value(priceData, "stck_prpr", "prpr", "current_price"));
  if (!item || !closePrice) throw new Error("장중 잠정 수급 또는 현재가가 없습니다.");
  const foreignQty = asNumber(value(item, "frgn_fake_ntby_qty"), 0), institutionQty = asNumber(value(item, "orgn_fake_ntby_qty"), 0);
  const listedShares = asNumber(value(priceData, "lstn_stcn")) || asNumber(stock.listedShares);
  return normalizeRow([date, stock.code, stock.name, stock.market, stock.sector, closePrice, listedShares ? listedShares * closePrice : asNumber(stock.marketCapWon), foreignQty * closePrice, foreignQty, institutionQty * closePrice, institutionQty, null, null, asNumber(value(priceData, "acml_vol", "acml_volm"), 0), asNumber(value(priceData, "prdy_ctrt", "change_rate"), 0)]);
}

async function pool(items, concurrency, worker) {
  const results = []; let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) { const current = items[index++]; results.push(await worker(current)); }
  });
  await Promise.all(runners); return results;
}

export async function collectCloseRows(kis, master, { date = dateInKst(), concurrency = 8, onProgress = () => {} } = {}) {
  const completed = [], failed = [];
  await pool(master, concurrency, async (stock) => {
    try { completed.push(await kis.withRetry(async () => closeRow(await kis.dailyInvestor(stock.code, date), stock, date))); }
    catch (error) { failed.push({ code: stock.code, message: error.message, retryable: error.retryable }); }
    finally { onProgress({ completed: completed.length, failed: failed.length, total: master.length }); }
  });
  const retryable = failed.filter((item) => item.retryable).map((item) => master.find((stock) => stock.code === item.code)).filter(Boolean);
  if (retryable.length) await pool(retryable, concurrency, async (stock) => { try { completed.push(await kis.withRetry(async () => closeRow(await kis.dailyInvestor(stock.code, date), stock, date), 3)); const i = failed.findIndex((item) => item.code === stock.code); if (i >= 0) failed.splice(i, 1); } catch { /* keep first failure */ } });
  return { rows: completed, failed };
}

export async function collectIntradayRows(kis, master, { date = dateInKst(), concurrency = 8, onProgress = () => {} } = {}) {
  const completed = [], failed = [];
  await pool(master, concurrency, async (stock) => {
    try { const [trend, current] = await Promise.all([kis.withRetry(() => kis.intradayInvestor(stock.code)), kis.withRetry(() => kis.price(stock.code))]); completed.push(intradayRow(trend, current, stock, date)); }
    catch (error) { failed.push({ code: stock.code, message: error.message, retryable: error.retryable }); }
    finally { onProgress({ completed: completed.length, failed: failed.length, total: master.length }); }
  });
  return { rows: completed, failed };
}

export async function isOpenDay(kis, date = dateInKst()) {
  const weekday = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T12:00:00+09:00`).getDay();
  if (weekday === 0 || weekday === 6) return false;
  const payload = await kis.holiday(date);
  const list = payload.output || [];
  const entry = (Array.isArray(list) ? list : [list]).find((item) => String(value(item, "bass_dt", "date")).replaceAll("-", "") === date);
  return !(entry && String(value(entry, "opnd_yn", "open_yn", "holiday_yn")).toUpperCase() === "N");
}

export function currentKstParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return { date: `${get("year")}${get("month")}${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}
