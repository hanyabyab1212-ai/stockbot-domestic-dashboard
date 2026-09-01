import test from "node:test";
import assert from "node:assert/strict";
import { IDX, mergeEtfRows, mergeRows, streak } from "../src/domain.mjs";
import { hasTodayCloseData } from "../src/flowService.mjs";

const row = (date, code, foreign = 0, pension = 0) => [date, code, "테스트", "유가", "미분류", 1000, 1000000, foreign, foreign, foreign, foreign, pension, pension, 1, 0];

test("같은 날짜·종목은 새 마감 행으로 교체한다", () => {
  const result = mergeRows([row("20260801", "005930", 1)], [row("20260801", "005930", 2)]);
  assert.equal(result.length, 1);
  assert.equal(result[0][IDX.foreignWon], 2);
});

test("연속 매수와 중간 0 종료를 계산한다", () => {
  const bought = streak([row("20260803", "1", 3), row("20260802", "1", 2), row("20260801", "1", 1)], IDX.foreignWon);
  assert.deepEqual([bought.sign, bought.count, bought.total], [1, 3, 6]);
  const stopped = streak([row("20260803", "1", 3), row("20260802", "1", 0), row("20260801", "1", 2)], IDX.foreignWon);
  assert.equal(stopped.count, 1);
});

test("ETF 이력은 최대 저장 일수만 보관한다", () => {
  const rows = Array.from({ length: 24 }, (_, i) => [`202607${String(i + 1).padStart(2, "0")}`, "123456", "ETF"]);
  assert.equal(mergeEtfRows([], rows).length, 23);
});

test("마감 수집은 데이터가 나오는 장 마감 뒤에만 당일을 사용한다", () => {
  assert.equal(hasTodayCloseData({ isTodayOpen: true, minutes: 15 * 60 + 39 }), false);
  assert.equal(hasTodayCloseData({ isTodayOpen: true, minutes: 15 * 60 + 40 }), true);
  assert.equal(hasTodayCloseData({ isTodayOpen: false, minutes: 16 * 60 }), false);
});
