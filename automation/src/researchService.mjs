const NAVER_RESEARCH_BASE = "https://stock.naver.com/api/stockSecurity/researches/v2";

export const RESEARCH_TYPES = {
  industry: { label: "산업", path: "industry" },
  invest: { label: "투자전략", path: "invest" },
  economy: { label: "경제", path: "economy" },
  debenture: { label: "채권", path: "debenture" }
};

const dateBefore = (compact, days) => {
  const value = compactDate(compact);
  const date = new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
};

const decodeEntities = (value) => String(value || "")
  .replaceAll("&nbsp;", " ")
  .replaceAll("&amp;", "&")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'");

export function researchPlainText(html) {
  return decodeEntities(html)
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

const clip = (text, limit = 155) => {
  const normalized = String(text || "").trim();
  if (normalized.length <= limit) return normalized;
  const cut = normalized.slice(0, limit).replace(/\s+\S*$/, "").trim();
  return `${cut || normalized.slice(0, limit)}…`;
};

export function researchHighlights(content, limit = 3) {
  const lines = researchPlainText(content)
    .split(/\n|(?<=[.!?])\s+(?=[A-Z가-힣0-9])/)
    .map((line) => line.replace(/^[•·\-\d.)\s]+/, "").trim())
    .filter((line) => line.length >= 12);
  const unique = [...new Set(lines.map((line) => clip(line)))];
  return unique.slice(0, limit);
}

const compactDate = (value) => String(value || "").replace(/[^0-9]/g, "").slice(0, 8);

export function normalizeResearchItem(item, type) {
  const meta = type === "company" ? { label: "기업", path: "company" } : RESEARCH_TYPES[type];
  if (!meta || !item?.nid) return null;
  const highlights = researchHighlights(item.content);
  return {
    id: `${type}-${item.nid}`,
    type,
    category: meta.label,
    title: String(item.title || "제목 없음"),
    company: String(item.itemName || item.industryKoreanName || item.industry || ""),
    companyCode: String(item.itemCode || ""),
    broker: String(item.brokerName || ""),
    analyst: String(item.analystName || ""),
    readCount: Number(String(item.readCount || "0").replaceAll(",", "")) || 0,
    ranking: Number(item.ranking) || null,
    publishedAt: compactDate(item.writeDate),
    opinion: String(item.opinionText || item.opinionType || ""),
    targetPrice: item.goalPrice == null || item.goalPrice === "" ? null : Number(String(item.goalPrice).replaceAll(",", "")) || null,
    summary: highlights[0] || "원문에서 핵심 내용을 확인하세요.",
    highlights: highlights.slice(1),
    sourceUrl: `https://stock.naver.com/research/${meta.path}/${encodeURIComponent(item.nid)}`
  };
}

async function fetchWeeklyHot({ referenceDate, stockNames = {}, fetchImpl }) {
  const startDate = dateBefore(referenceDate, 7);
  const response = await fetchImpl(`${NAVER_RESEARCH_BASE}/weekly-hot?startDate=${encodeURIComponent(startDate)}&size=10`, {
    headers: {
      accept: "application/json",
      referer: "https://stock.naver.com/research",
      "user-agent": "alphanyang-stockbot/1.0 (public report index)"
    }
  });
  if (!response.ok) throw new Error(`네이버 인기 리포트 조회 실패: ${response.status}`);
  const payload = await response.json();
  const source = Array.isArray(payload?.researchList) ? payload.researchList : [];
  return source.map((item) => normalizeResearchItem({ ...item, itemName: item.itemName || stockNames[String(item.itemCode || "")] || "" }, "company")).filter(Boolean);
}

async function fetchResearchType(type, { size, fetchImpl }) {
  const response = await fetchImpl(`${NAVER_RESEARCH_BASE}/${encodeURIComponent(type)}?size=${size}`, {
    headers: {
      accept: "application/json",
      referer: "https://stock.naver.com/research",
      "user-agent": "alphanyang-stockbot/1.0 (public report index)"
    }
  });
  if (!response.ok) throw new Error(`네이버 ${RESEARCH_TYPES[type].label} 리포트 조회 실패: ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload?.items) ? payload.items.map((item) => normalizeResearchItem(item, type)).filter(Boolean) : [];
}

const newestFirst = (items) => [...items].sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)) || String(a.id).localeCompare(String(b.id)));
const currentOrLatest = (items, referenceDate, limit) => {
  const sorted = newestFirst(items);
  const current = sorted.filter((item) => item.publishedAt === referenceDate);
  return { items: (current.length ? current : sorted).slice(0, limit), usesLatest: !current.length };
};

export async function collectResearchBriefing({ referenceDate, previous = null, stockNames = {}, fetchImpl = fetch, now = new Date() } = {}) {
  const kstParts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const dateFromNow = Object.fromEntries(kstParts.filter((part) => ["year", "month", "day"].includes(part.type)).map((part) => [part.type, part.value]));
  const date = compactDate(referenceDate) || `${dateFromNow.year}${dateFromNow.month}${dateFromNow.day}`;
  const types = Object.keys(RESEARCH_TYPES);
  const requests = await Promise.allSettled([fetchWeeklyHot({ referenceDate: date, stockNames, fetchImpl }), ...types.map((type) => fetchResearchType(type, { size: 16, fetchImpl }))]);
  const successful = new Map();
  const failedTypes = [];
  requests.forEach((result, index) => {
    const type = index === 0 ? "company" : types[index - 1];
    if (result.status === "fulfilled") successful.set(type, result.value);
    else failedTypes.push(type);
  });
  const company = { items: successful.get("company") || previous?.company || [], usesLatest: false };
  const macroItems = ["industry", "invest", "economy", "debenture"].flatMap((type) => {
    const current = successful.get(type);
    return current?.length ? current : (previous?.macro || []).filter((item) => item.type === type);
  });
  const macro = currentOrLatest(macroItems.length ? macroItems : previous?.macro || [], date, 12);
  return {
    updatedAt: now.toISOString(),
    referenceDate: date,
    company: company.items,
    macro: macro.items,
    companyUsesLatest: company.usesLatest,
    macroUsesLatest: macro.usesLatest,
    failedTypes,
    sources: {
      naver: "https://stock.naver.com/research",
      etfCheck: "https://www.etfcheck.co.kr/mobile/main"
    }
  };
}
