import assert from "node:assert/strict";
import test from "node:test";
import { BOK_INDUSTRY_FEEDS, collectBokIndustryBriefing, parseBokRss } from "../src/bokIndustryService.mjs";

const rss = (title, link, date, description = "산업 동향과 주요 시사점을 살펴봅니다.") => `<?xml version="1.0"?><rss><channel><item><title><![CDATA[${title}]]></title><link>${link}</link><pubDate>${date}</pubDate><description><![CDATA[${description}]]></description></item></channel></rss>`;

test("한국은행 RSS 항목에서 제목·발간일·원문 링크를 읽는다", () => {
  const feed = BOK_INDUSTRY_FEEDS[0];
  const items = parseBokRss(rss("반도체 산업 동향", "https://www.bok.or.kr/portal/bbs/example/view.do", "2026.09.13"), feed);
  assert.equal(items.length, 1);
  assert.equal(items[0].category, "주력산업 모니터링");
  assert.equal(items[0].publishedAt, "20260913");
  assert.equal(items[0].sourceUrl, "https://www.bok.or.kr/portal/bbs/example/view.do");
});

test("영문 요일·월이 포함된 RSS 발간일도 한국 날짜로 읽는다", () => {
  const items = parseBokRss(rss("지역 산업 자료", "https://www.bok.or.kr/portal/bbs/example/view.do", "Thu, 10 Sep 2026 17:00:00 +0900"), BOK_INDUSTRY_FEEDS[2]);
  assert.equal(items[0].publishedAt, "20260910");
});

test("일부 RSS가 실패해도 기존 자료를 보존한다", async () => {
  const previous = { items: [{ id: "old", sourceKey: "regional-economy", category: "지역경제보고서", title: "기존 지역 자료", publishedAt: "20260910", summary: "기존 자료", sourceUrl: "https://www.bok.or.kr/portal/bbs/old/view.do" }] };
  const fetchImpl = async (url) => {
    if (String(url).includes("P0002507")) throw new Error("temporary failure");
    return { ok: true, text: async () => rss("새 산업 자료", "https://www.bok.or.kr/portal/bbs/new/view.do", "2026.09.13") };
  };
  const result = await collectBokIndustryBriefing({ previous, fetchImpl, now: new Date("2026-09-13T02:00:00Z") });
  assert.equal(result.items.length, 2);
  assert.equal(result.items.some((item) => item.title === "기존 지역 자료"), true);
  assert.deepEqual(result.failedSources, ["regional-economy"]);
});
