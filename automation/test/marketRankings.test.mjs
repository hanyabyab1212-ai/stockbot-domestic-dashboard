import assert from "node:assert/strict";
import test from "node:test";
import { IDX } from "../src/domain.mjs";
import { masterFromPreviousRows } from "../src/krxMaster.mjs";
import { fetchTradingViewScanner, markHighUpdateDate } from "../src/marketRankings.mjs";

test("TradingView 연결이 끊기면 재시도 후 응답을 사용한다", async () => {
  let calls = 0;
  const payload = await fetchTradingViewScanner({
    attempts: 3,
    waitImpl: async () => {},
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) throw new TypeError("terminated");
      return { ok: true, json: async () => ({ data: [] }) };
    }
  });
  assert.equal(calls, 3);
  assert.deepEqual(payload, { data: [] });
});

test("직전 정상 행에서 종목 마스터를 복구한다", () => {
  const older = ["20260901", "005930", "삼성전자", "유가", "반도체", 70000, 400, 0, 0, 0, 0, 0, 0, 1, 0];
  const newer = [...older]; newer[IDX.date] = "20260902"; newer[IDX.marketCapWon] = 500;
  const master = masterFromPreviousRows([older, newer]);
  assert.deepEqual(master, [{ code: "005930", name: "삼성전자", market: "유가", sector: "반도체", marketCapWon: 500 }]);
});

test("마감 수집일을 52주 신고가 갱신일로 저장한다", () => {
  const marketRanks = { highs: [{ code: "005930", name: "삼성전자" }], daily: [] };
  const marked = markHighUpdateDate(marketRanks, "20260902");
  assert.equal(marked.highs[0].highUpdatedAt, "20260902");
  assert.equal(marketRanks.highs[0].highUpdatedAt, undefined);
});
