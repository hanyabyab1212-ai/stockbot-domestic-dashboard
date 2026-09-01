const COMTRADE_PREVIEW_URL = "https://comtradeapi.un.org/public/v1/preview/C/M/HS";
const KOREA_REPORTER_CODE = "410";
const WORLD_PARTNER_CODE = "0";
const DAY = 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL = 6 * DAY;

// HS 8542 is electronic integrated circuits.  Cosmetics is deliberately shown
// as the transparent HS 3303–3307 grouping, rather than an opaque vendor label.
export const TRADE_PRODUCTS = Object.freeze([
  { id: "semiconductors", name: "반도체", hsCodes: ["8542"], hsLabel: "HS 8542 · 전자집적회로" },
  { id: "cosmetics", name: "화장품 전체", hsCodes: ["3303", "3304", "3305", "3306", "3307"], hsLabel: "HS 3303–3307 · 향수·기초·색조·헤어·구강 등" },
  { id: "color-cosmetics", name: "색조 화장품", hsCodes: ["330410", "330420", "330430", "330491"], hsLabel: "HS 330410·20·30·491 · 립·아이·네일·파우더" },
  { id: "skin-care", name: "기초 화장품", hsCodes: ["330499"], hsLabel: "HS 330499 · 의약품 제외 피부관리 제제" }
]);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const numeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function monthPeriod(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).formatToParts(date);
  return parts.filter((part) => part.type !== "literal").map((part) => part.value).join("");
}

export function previousMonth(period) {
  const year = Number(String(period).slice(0, 4));
  const month = Number(String(period).slice(4, 6));
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return `${previous.getUTCFullYear()}${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(lastPeriod, count = 12) {
  const periods = [];
  let current = lastPeriod;
  for (let index = 0; index < count; index += 1) {
    periods.push(current);
    current = previousMonth(current);
  }
  return periods.reverse();
}

export function comtradeExportUrl(period, hsCodes) {
  const params = new URLSearchParams({
    period: String(period),
    reporterCode: KOREA_REPORTER_CODE,
    flowCode: "X",
    cmdCode: hsCodes.join(","),
    partnerCode: WORLD_PARTNER_CODE,
    partner2Code: "0",
    customsCode: "C00",
    motCode: "0",
    maxRecords: "500"
  });
  return `${COMTRADE_PREVIEW_URL}?${params}`;
}

export function comtradePartnersUrl(period, hsCode) {
  // Deliberately omit partnerCode: the preview API then returns one row per
  // partner.  One HS heading at a time keeps the free preview below 500 rows.
  const params = new URLSearchParams({
    period: String(period),
    reporterCode: KOREA_REPORTER_CODE,
    flowCode: "X",
    cmdCode: String(hsCode),
    maxRecords: "500",
    includeDesc: "true"
  });
  return `${COMTRADE_PREVIEW_URL}?${params}`;
}

export function sumPrimaryValue(rows) {
  const values = (Array.isArray(rows) ? rows : []).map((row) => numeric(row?.primaryValue)).filter((value) => value != null);
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

async function fetchMonth(period, product, { fetchImpl, retries, retryDelayMs }) {
  const url = comtradeExportUrl(period, product.hsCodes);
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, { headers: { accept: "application/json" } });
      if (response.ok) {
        const payload = await response.json();
        return { period, value: sumPrimaryValue(payload?.data), records: Array.isArray(payload?.data) ? payload.data.length : 0 };
      }
      lastError = new Error(`UN Comtrade ${response.status}`);
      if (response.status !== 429) throw lastError;
      if (attempt === retries) throw lastError;
    } catch (error) {
      lastError = error;
      if (attempt === retries) throw error;
    }
    await wait(retryDelayMs * (attempt + 1));
  }
  throw lastError || new Error("UN Comtrade 조회 실패");
}

async function fetchPartnerMonth(period, hsCode, { fetchImpl, retries, retryDelayMs }) {
  const url = comtradePartnersUrl(period, hsCode);
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, { headers: { accept: "application/json" } });
      if (response.ok) return (await response.json())?.data || [];
      lastError = new Error(`UN Comtrade ${response.status}`);
      if (response.status !== 429 || attempt === retries) throw lastError;
    } catch (error) {
      lastError = error;
      if (attempt === retries) throw error;
    }
    await wait(retryDelayMs * (attempt + 1));
  }
  throw lastError || new Error("UN Comtrade 국가별 조회 실패");
}

function oldRowsFor(previous, productId) {
  const category = (previous?.categories || []).find((item) => item?.id === productId);
  return new Map((category?.rows || []).filter((row) => /^\d{6}$/.test(String(row?.period)) && numeric(row.value) != null).map((row) => [String(row.period), { period: String(row.period), value: numeric(row.value) }]));
}

function canReuseRecentSnapshot(previous, now) {
  const checkedAt = Date.parse(previous?.checkedAt || previous?.updatedAt || "");
  const categories = Array.isArray(previous?.categories) ? previous.categories : [];
  return Number.isFinite(checkedAt) && now.getTime() - checkedAt < REFRESH_INTERVAL && TRADE_PRODUCTS.every((product) => categories.some((category) => category?.id === product.id && category.rows?.length));
}

function topPartners(rows, total) {
  const merged = new Map();
  for (const row of rows) {
    const code = numeric(row?.partnerCode), value = numeric(row?.primaryValue);
    if (code == null || code <= 0 || value == null || !row?.partnerDesc) continue;
    const current = merged.get(code) || { code, name: row.partnerDesc, iso: row.partnerISO || "", value: 0 };
    current.value += value;
    merged.set(code, current);
  }
  return [...merged.values()].sort((a, b) => b.value - a.value).slice(0, 10).map((partner) => ({ ...partner, sharePct: total ? partner.value / total * 100 : null }));
}

async function collectPartners(period, product, total, { fetchImpl, retries, retryDelayMs, pauseForPublicApi, errors }) {
  const rows = [];
  for (const hsCode of product?.hsCodes || []) {
    await pauseForPublicApi();
    try {
      rows.push(...await fetchPartnerMonth(period, hsCode, { fetchImpl, retries, retryDelayMs }));
    } catch (error) {
      errors.push(`${product.name} 국가별 ${hsCode}: ${error.message}`);
    }
  }
  return topPartners(rows, total);
}

/**
 * Monthly Korean exports, sourced from UN Comtrade's free public preview API.
 * Calls are intentionally sequential: the free endpoint is rate-limited.
 */
export async function collectTradeSnapshot({ previous = {}, fetchImpl = fetch, now = new Date(), historyMonths = 12, delayMs = 1300, retries = 2, retryDelayMs = 3000 } = {}) {
  if (canReuseRecentSnapshot(previous, now)) return previous;
  // A monthly series is complete only after a calendar month ends.
  const periods = monthRange(previousMonth(monthPeriod(now)), historyMonths);
  const categories = [];
  const errors = [];
  let requests = 0;
  const pauseForPublicApi = async () => {
    if (requests > 0 && delayMs) await wait(delayMs);
    requests += 1;
  };

  for (const product of TRADE_PRODUCTS) {
    const rows = oldRowsFor(previous, product.id);
    for (const period of periods) {
      await pauseForPublicApi();
      try {
        const result = await fetchMonth(period, product, { fetchImpl, retries, retryDelayMs });
        if (result.value != null) rows.set(period, { period, value: result.value });
      } catch (error) {
        errors.push(`${product.name} ${period}: ${error.message}`);
      }
    }
    categories.push({ ...product, rows: [...rows.values()].filter((row) => periods.includes(row.period)).sort((a, b) => a.period.localeCompare(b.period)) });
  }

  if (!categories.some((category) => category.rows.length)) throw new Error(errors[0] || "UN Comtrade에서 수출 데이터를 찾지 못했습니다.");
  const asOf = categories.flatMap((category) => category.rows.map((row) => row.period)).sort().at(-1) || null;
  const cosmetics = categories.find((category) => category.id === "cosmetics");
  const semiconductors = categories.find((category) => category.id === "semiconductors");
  const cosmeticsValue = cosmetics?.rows.find((row) => row.period === asOf)?.value;
  const semiconductorsValue = semiconductors?.rows.find((row) => row.period === asOf)?.value;
  const oldTopPartners = Array.isArray(previous.topPartners) ? { cosmetics: previous.topPartners, semiconductors: [] } : previous.topPartners || {};
  let cosmeticsPartners = [];
  let semiconductorsPartners = [];
  if (asOf) {
    cosmeticsPartners = await collectPartners(asOf, cosmetics, cosmeticsValue, { fetchImpl, retries, retryDelayMs, pauseForPublicApi, errors });
    semiconductorsPartners = await collectPartners(asOf, semiconductors, semiconductorsValue, { fetchImpl, retries, retryDelayMs, pauseForPublicApi, errors });
  }
  return {
    updatedAt: new Date().toISOString(),
    checkedAt: now.toISOString(),
    asOf,
    source: "UN Comtrade",
    sourceUrl: "https://comtradeplus.un.org/TradeFlow",
    note: "한국의 전세계 대상 월간 수출액(USD) · 반도체 HS 8542 · 화장품 HS 3303–3307",
    categories,
    topPartners: {
      cosmetics: cosmeticsPartners.length ? cosmeticsPartners : oldTopPartners.cosmetics || [],
      semiconductors: semiconductorsPartners.length ? semiconductorsPartners : oldTopPartners.semiconductors || []
    },
    error: errors.length ? `일부 월의 공개 API 조회가 지연되었습니다. (${errors.length}건)` : undefined
  };
}
