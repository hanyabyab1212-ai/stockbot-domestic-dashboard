const BOK_RSS_SERVICE_URL = "https://www.bok.or.kr/static/view/popup/rss_popup.html";

export const BOK_INDUSTRY_FEEDS = [
  { key: "industry-monitor", category: "주력산업 모니터링", url: "https://www.bok.or.kr/portal/bbs/B0000357/news.rss?menuNo=201127" },
  { key: "issue-note", category: "BOK 이슈노트", url: "https://www.bok.or.kr/portal/bbs/P0002353/news.rss?menuNo=200433" },
  { key: "regional-research", category: "지역 조사연구", url: "https://www.bok.or.kr/portal/bbs/P0000800/news.rss?menuNo=200560" },
  { key: "regional-economy", category: "지역경제보고서", url: "https://www.bok.or.kr/portal/bbs/P0002507/news.rss?menuNo=200069" }
];

const decode = (value) => String(value || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replaceAll("&nbsp;", " ")
  .replaceAll("&amp;", "&")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const field = (xml, tag) => {
  const match = String(xml || "").match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return decode(match?.[1]);
};

const compactDate = (value) => {
  const source = String(value || "").trim();
  if (/[A-Za-z]{3}/.test(source)) {
    const parsed = Date.parse(source);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10).replaceAll("-", "");
  }
  const ymd = source.match(/(\d{4})[^\d]?(\d{1,2})[^\d]?(\d{1,2})/);
  if (ymd) return `${ymd[1]}${ymd[2].padStart(2, "0")}${ymd[3].padStart(2, "0")}`;
  const compact = source.replace(/[^0-9]/g, "");
  if (/^\d{8}$/.test(compact)) return compact;
  const parsed = Date.parse(source);
  return Number.isNaN(parsed) ? "" : new Date(parsed).toISOString().slice(0, 10).replaceAll("-", "");
};

const clip = (value, max = 165) => {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  const shortened = text.slice(0, max).replace(/\s+\S*$/, "").trim();
  return `${shortened || text.slice(0, max)}…`;
};

const isBokUrl = (value) => {
  try { return new URL(value).hostname.endsWith("bok.or.kr"); } catch { return false; }
};

export function parseBokRss(xml, feed) {
  const entries = String(xml || "").match(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi) || [];
  return entries.map((entry, index) => {
    const title = field(entry, "title");
    const sourceUrl = field(entry, "link") || field(entry, "guid");
    if (!title || !isBokUrl(sourceUrl)) return null;
    const description = field(entry, "description");
    return {
      id: `bok-${feed.key}-${compactDate(field(entry, "pubDate")) || "undated"}-${index}`,
      sourceKey: feed.key,
      category: feed.category,
      title,
      publishedAt: compactDate(field(entry, "pubDate")),
      summary: clip(description) || "한국은행 원문에서 발간 내용과 세부 자료를 확인하세요.",
      sourceUrl
    };
  }).filter(Boolean);
}

const newestFirst = (items) => [...items].sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)) || String(a.title).localeCompare(String(b.title), "ko"));

export async function collectBokIndustryBriefing({ previous = null, fetchImpl = fetch, now = new Date() } = {}) {
  const results = await Promise.allSettled(BOK_INDUSTRY_FEEDS.map(async (feed) => {
    const response = await fetchImpl(feed.url, { headers: { accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8", "user-agent": "guguyam-stockbot/1.0 (public BOK RSS reader)" } });
    if (!response.ok) throw new Error(`${feed.category} RSS 조회 실패: ${response.status}`);
    return { key: feed.key, items: parseBokRss(await response.text(), feed) };
  }));
  const failedSources = [];
  const items = results.flatMap((result, index) => {
    const feed = BOK_INDUSTRY_FEEDS[index];
    if (result.status === "fulfilled" && result.value.items.length) return result.value.items;
    failedSources.push(feed.key);
    return (previous?.items || []).filter((item) => item.sourceKey === feed.key);
  });
  const unique = new Map();
  for (const item of newestFirst(items)) unique.set(`${item.sourceUrl}|${item.title}`, item);
  return {
    updatedAt: now.toISOString(),
    items: newestFirst([...unique.values()]).slice(0, 24),
    failedSources,
    sources: { bok: BOK_RSS_SERVICE_URL }
  };
}
