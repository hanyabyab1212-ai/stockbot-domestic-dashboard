import assert from "node:assert/strict";
import test from "node:test";
import { collectInvestorTrends, marketInvestorTrend } from "../src/investorTrendService.mjs";

test("시장별 투자자동향 응답에서 개인·외국인·기관 순매수 금액을 읽는다", () => {
  const item = marketInvestorTrend({ output: [{ stck_bsop_date: "20260901", prsn_ntby_tr_pbmn: "-1,200", frgn_ntby_tr_pbmn: "300", orgn_ntby_tr_pbmn: "900" }] }, { market: "코스피", date: "20260901" });
  assert.deepEqual(item, { market: "코스피", personal: -1200, foreign: 300, institution: 900 });
});

test("코스피와 코스닥 시장 동향을 함께 수집한다", async () => {
  const calls = [];
  const kis = {
    withRetry: async (work) => work(),
    marketInvestorDaily: async (market, code, date) => {
      calls.push([market, code, date]);
      return { output: [{ stck_bsop_date: date, prsn_ntby_tr_pbmn: "-10", frgn_ntby_tr_pbmn: "2", orgn_ntby_tr_pbmn: "8" }] };
    }
  };
  const result = await collectInvestorTrends(kis, "20260901");
  assert.deepEqual(calls, [["KSP", "0001", "20260901"], ["KSQ", "1001", "20260901"]]);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[1].market, "코스닥");
});
