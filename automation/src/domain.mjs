export const COLUMNS = [
  "date", "code", "name", "market", "sector", "closePrice", "marketCapWon",
  "foreignWon", "foreignQty", "institutionWon", "institutionQty",
  "pensionWon", "pensionQty", "tradingVolume", "dailyChangePct"
];

export const IDX = Object.freeze(Object.fromEntries(COLUMNS.map((name, index) => [name, index])));
export const MAX_HISTORY_DAYS = 120;
export const MAX_ETF_DAYS = 23;

export function keyOf(row) {
  return `${row[IDX.date]}:${String(row[IDX.code]).padStart(6, "0")}`;
}

export function asNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const normalized = String(value).replaceAll(",", "").replaceAll("+", "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeRow(row) {
  const next = Array.isArray(row) ? [...row] : COLUMNS.map((column) => row[column]);
  next[IDX.date] = String(next[IDX.date] ?? "").replaceAll("-", "").slice(0, 8);
  next[IDX.code] = String(next[IDX.code] ?? "").padStart(6, "0");
  next[IDX.name] = String(next[IDX.name] ?? "").trim();
  next[IDX.market] = next[IDX.market] === "코스닥" ? "코스닥" : "유가";
  next[IDX.sector] = String(next[IDX.sector] || "미분류");
  for (const index of [IDX.closePrice, IDX.marketCapWon, IDX.foreignWon, IDX.foreignQty, IDX.institutionWon, IDX.institutionQty, IDX.pensionWon, IDX.pensionQty, IDX.tradingVolume, IDX.dailyChangePct]) {
    next[index] = asNumber(next[index]);
  }
  return next;
}

export function mergeRows(existing = [], incoming = [], maxDates = MAX_HISTORY_DAYS) {
  const merged = new Map();
  for (const row of existing) {
    const normalized = normalizeRow(row);
    if (normalized[IDX.date] && normalized[IDX.code]) merged.set(keyOf(normalized), normalized);
  }
  for (const row of incoming) {
    const normalized = normalizeRow(row);
    if (normalized[IDX.date] && normalized[IDX.code]) merged.set(keyOf(normalized), normalized);
  }
  const dates = [...new Set([...merged.values()].map((row) => row[IDX.date]))].sort().slice(-maxDates);
  const permitted = new Set(dates);
  return [...merged.values()]
    .filter((row) => permitted.has(row[IDX.date]))
    .sort((a, b) => b[IDX.date].localeCompare(a[IDX.date]) || a[IDX.code].localeCompare(b[IDX.code]));
}

export function mergeEtfRows(existing = [], incoming = [], maxDates = MAX_ETF_DAYS) {
  const rows = new Map();
  for (const row of [...existing, ...incoming]) {
    if (!Array.isArray(row) || !row[0] || !row[1]) continue;
    rows.set(`${row[0]}:${row[1]}`, [...row]);
  }
  const dates = [...new Set([...rows.values()].map((row) => String(row[0])))].sort().slice(-maxDates);
  const permitted = new Set(dates);
  return [...rows.values()].filter((row) => permitted.has(String(row[0]))).sort((a, b) => String(b[0]).localeCompare(String(a[0])));
}

export function streak(list, index) {
  let sign = 0;
  let count = 0;
  let total = 0;
  const records = [];
  for (const row of list) {
    const value = row[index];
    if (value == null) continue;
    const nextSign = value > 0 ? 1 : value < 0 ? -1 : 0;
    if (!nextSign || (sign && nextSign !== sign)) break;
    if (!sign) sign = nextSign;
    count += 1;
    total += value;
    records.push(row);
  }
  return { sign, count, total, records };
}

export function latestByCode(rows) {
  const byCode = new Map();
  for (const row of rows) {
    const old = byCode.get(row[IDX.code]);
    if (!old || row[IDX.date] > old[IDX.date]) byCode.set(row[IDX.code], row);
  }
  return byCode;
}

export function validateDashboard(data) {
  if (!data || !Array.isArray(data.dates) || !Array.isArray(data.rows)) throw new Error("대시보드 데이터에 dates 또는 rows 배열이 없습니다.");
  if (data.rows.some((row) => !Array.isArray(row) || row.length < COLUMNS.length)) throw new Error("대시보드 row 스키마가 올바르지 않습니다.");
  return true;
}

export function isValidCloseBatch(rows, minimum = 1000) {
  const valid = rows.filter((row) => row[IDX.closePrice] > 0 && row[IDX.code] && row[IDX.date]);
  return valid.length >= minimum;
}
