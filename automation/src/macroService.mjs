const DAY = 24 * 60 * 60 * 1000;

export const BOK_SERIES = Object.freeze({
  usdKrw: { statCode: "731Y003", itemCode: "0000003", name: "원/달러", symbol: "USD/KRW" },
  krGov10y: { statCode: "817Y002", itemCode: "010210000", name: "한국 국고채 10년", symbol: "KTB 10Y" },
  krCd91: { statCode: "817Y002", itemCode: "010502000", name: "CD 91일", symbol: "KR CD 91D" }
});

const number = (value) => {
  const parsed = Number(String(value ?? "").replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const compactDate = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return parts.filter((part) => part.type !== "literal").map((part) => part.value).join("");
};

const latestTwo = (rows) => rows
  .filter((row) => row && row.asOf && number(row.value) != null)
  .map((row) => ({ ...row, value: number(row.value) }))
  .sort((a, b) => String(a.asOf).localeCompare(String(b.asOf)))
  .slice(-2);

const quoted = ({ id, name, symbol, format, source, rows, note }) => {
  const values = latestTwo(rows);
  const current = values.at(-1);
  const previous = values.length > 1 ? values.at(-2) : null;
  if (!current) return { id, name, symbol, format, source, note, price: null, asOf: null, status: "새 데이터 대기" };
  const change = previous ? current.value - previous.value : null;
  const changePct = change != null && previous?.value ? change / previous.value * 100 : null;
  return { id, name, symbol, format, source, note, price: current.value, asOf: current.asOf, change, changePct };
};

export function bokStatisticUrl(apiKey, { statCode, itemCode }, startDate, endDate) {
  return `https://ecos.bok.or.kr/api/StatisticSearch/${encodeURIComponent(apiKey)}/json/kr/1/100/${statCode}/D/${startDate}/${endDate}/${itemCode}`;
}

export function parseTreasuryRows(xml) {
  const entries = String(xml ?? "").match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  const field = (entry, tag) => {
    const match = entry.match(new RegExp(`<d:${tag}[^>]*>([^<]+)<\\/d:${tag}>`, "i"));
    return match?.[1]?.trim() ?? null;
  };
  return entries.map((entry) => ({
    asOf: field(entry, "NEW_DATE"),
    us10y: number(field(entry, "BC_10YEAR")),
    us3m: number(field(entry, "BC_3MONTH"))
  })).filter((row) => row.asOf && (row.us10y != null || row.us3m != null));
}

export function impliedFxSwapPoints({ spot, krwRate, usdRate, days = 91 }) {
  const s = number(spot), kr = number(krwRate), us = number(usdRate);
  if (s == null || kr == null || us == null) return null;
  return s * ((1 + kr / 100 * days / 365) / (1 + us / 100 * days / 365) - 1);
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${response.status} ${new URL(url).hostname}`);
  return response.json();
}

async function bokRows(apiKey, series, fetchImpl, now) {
  const end = compactDate(now);
  const start = compactDate(new Date(now.getTime() - 14 * DAY));
  const payload = await fetchJson(bokStatisticUrl(apiKey, series, start, end), fetchImpl);
  return (payload.StatisticSearch?.row ?? []).map((row) => ({ asOf: row.TIME, value: row.DATA_VALUE }));
}

async function treasuryRows(fetchImpl, now) {
  const years = [now.getUTCFullYear(), now.getUTCFullYear() - 1];
  const responses = await Promise.all(years.map(async (year) => {
    const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${year}`;
    const response = await fetchImpl(url, { headers: { accept: "application/xml,text/xml" } });
    if (!response.ok) throw new Error(`${response.status} home.treasury.gov`);
    return parseTreasuryRows(await response.text());
  }));
  return responses.flat();
}

async function eiaWtiRows(apiKey, fetchImpl) {
  const params = new URLSearchParams({ api_key: apiKey, frequency: "daily", length: "2" });
  params.append("data[0]", "value");
  params.append("facets[series][]", "RWTC");
  params.append("sort[0][column]", "period");
  params.append("sort[0][direction]", "desc");
  const payload = await fetchJson(`https://api.eia.gov/v2/petroleum/pri/spt/data/?${params}`, fetchImpl);
  return (payload.response?.data ?? []).map((row) => ({ asOf: row.period, value: row.value }));
}

function fallbackItem(previousItems, item) {
  const old = previousItems.find((value) => value?.id === item.id);
  if (item.price == null && old?.price != null) return { ...old, status: item.status || "최신 데이터 확인 중" };
  return item;
}

/**
 * Collects daily macro indicators without making a stock-data refresh fail when
 * an upstream public data source is temporarily unavailable.
 */
export async function collectMacroSnapshot({ bokApiKey = "", eiaApiKey = "", previous = {}, fetchImpl = fetch, now = new Date() } = {}) {
  const oldItems = Array.isArray(previous.items) ? previous.items : [];
  const items = [];
  const bokEnabled = Boolean(bokApiKey);
  const eiaEnabled = Boolean(eiaApiKey);

  let usdKrw = null;
  let krGov10y = null;
  let krCd91 = null;
  if (bokEnabled) {
    const results = await Promise.allSettled([
      bokRows(bokApiKey, BOK_SERIES.usdKrw, fetchImpl, now),
      bokRows(bokApiKey, BOK_SERIES.krGov10y, fetchImpl, now),
      bokRows(bokApiKey, BOK_SERIES.krCd91, fetchImpl, now)
    ]);
    [usdKrw, krGov10y, krCd91] = results.map((result) => result.status === "fulfilled" ? result.value : null);
  }

  const usdItem = quoted({ id: "usd-krw", name: "원/달러", symbol: "USD/KRW", format: "krw", source: "한국은행 ECOS", note: "매매기준율", rows: usdKrw ?? [] });
  const kr10Item = quoted({ id: "kr-gov-10y", name: "한국 국고채 10년", symbol: "KTB 10Y", format: "yield", source: "한국은행 ECOS", note: "일별 수익률", rows: krGov10y ?? [] });
  if (!bokEnabled) {
    items.push(fallbackItem(oldItems, { ...usdItem, status: "BOK_ECOS_API_KEY 필요" }));
    items.push(fallbackItem(oldItems, { ...kr10Item, status: "BOK_ECOS_API_KEY 필요" }));
  } else {
    items.push(fallbackItem(oldItems, usdItem));
    items.push(fallbackItem(oldItems, kr10Item));
  }

  let treasury = null;
  try { treasury = await treasuryRows(fetchImpl, now); } catch { treasury = null; }
  const us10Item = quoted({ id: "us-gov-10y", name: "미국 국채 10년", symbol: "UST 10Y", format: "yield", source: "U.S. Treasury", note: "일별 만기수익률", rows: (treasury ?? []).map((row) => ({ asOf: row.asOf, value: row.us10y })) });
  items.push(fallbackItem(oldItems, us10Item));

  const spot = latestTwo(usdKrw ?? []).at(-1);
  const krShort = latestTwo(krCd91 ?? []).at(-1);
  const usShort = latestTwo((treasury ?? []).map((row) => ({ asOf: row.asOf, value: row.us3m }))).at(-1);
  const points = impliedFxSwapPoints({ spot: spot?.value, krwRate: krShort?.value, usdRate: usShort?.value });
  const asOf = [spot?.asOf, krShort?.asOf, usShort?.asOf].filter(Boolean).sort().at(0) ?? null;
  const swapItem = { id: "usd-krw-swap-3m", name: "USD/KRW 3개월 스왑", symbol: "3M implied", format: "swap", source: "금리차 추정", note: "CD 91일·미국 3개월 금리 기반 · 실제 호가 아님", price: points, asOf, status: points == null ? "BOK_ECOS_API_KEY 등록 후 계산" : undefined };
  items.push(fallbackItem(oldItems, swapItem));

  let wti = null;
  if (eiaEnabled) {
    try { wti = await eiaWtiRows(eiaApiKey, fetchImpl); } catch { wti = null; }
  }
  const wtiItem = quoted({ id: "wti", name: "WTI 원유", symbol: "WTI Spot", format: "oil", source: "U.S. EIA", note: "현물 · 달러/배럴", rows: wti ?? [] });
  items.push(fallbackItem(oldItems, eiaEnabled ? wtiItem : { ...wtiItem, status: "EIA_API_KEY 필요" }));

  return { updatedAt: new Date().toISOString(), source: "공개·공식 데이터", items };
}
