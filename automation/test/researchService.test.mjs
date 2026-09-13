import assert from "node:assert/strict";
import test from "node:test";
import { collectResearchBriefing, normalizeResearchItem, researchHighlights, researchPlainText } from "../src/researchService.mjs";

test("공개 리포트 HTML에서 짧은 발췌 문장을 만든다", () => {
  const text = researchPlainText("<p><strong>실적 개선</strong>이 이어집니다.</p><p>하반기 수요 회복을 확인해야 합니다.</p>");
  assert.match(text, /실적 개선 이 이어집니다/);
  assert.deepEqual(researchHighlights(text), ["실적 개선 이 이어집니다.", "하반기 수요 회복을 확인해야 합니다."]);
});

test("기업 리포트는 메타정보와 네이버 원문 주소를 유지한다", () => {
  const item = normalizeResearchItem({ nid: "1234", title: "테스트 기업", itemName: "알파냥", itemCode: "000001", brokerName: "테스트증권", analystName: "홍길동", readCount: "1,234", writeDate: "2026-09-13", opinionText: "매수", goalPrice: "123,000", content: "첫 번째 핵심 내용입니다. 두 번째 핵심 내용입니다." }, "company");
  assert.equal(item.company, "알파냥");
  assert.equal(item.targetPrice, 123000);
  assert.equal(item.publishedAt, "20260913");
  assert.equal(item.readCount, 1234);
  assert.equal(item.sourceUrl, "https://stock.naver.com/research/company/1234");
});

test("네이버 첫 화면의 인기 리포트와 산업·거시 리포트를 함께 수집한다", async () => {
  const fetchImpl = async (url) => {
    const type = String(url).match(/v2\/([^?]+)/)?.[1];
    if (type === "weekly-hot") return { ok: true, json: async () => ({ researchList: [{ ranking: "1", type: "company", nid: "hot-1", title: "인기 리포트", itemCode: "005930", brokerName: "테스트증권", readCount: "4,321", writeDate: "2026-09-12" }] }) };
    const item = { nid: `${type}-1`, title: `${type} 리포트`, writeDate: "2026-09-13", content: "첫 번째 핵심 내용입니다. 두 번째 핵심 내용입니다." };
    return { ok: true, json: async () => ({ items: [item] }) };
  };
  const result = await collectResearchBriefing({ referenceDate: "20260913", stockNames: { "005930": "삼성전자" }, fetchImpl, now: new Date("2026-09-13T02:00:00Z") });
  assert.equal(result.companyUsesLatest, false);
  assert.equal(result.macroUsesLatest, false);
  assert.equal(result.company[0].title, "인기 리포트");
  assert.equal(result.company[0].company, "삼성전자");
  assert.equal(result.company[0].readCount, 4321);
  assert.equal(result.macro.length, 4);
  assert.equal(result.failedTypes.length, 0);
});
