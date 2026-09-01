import assert from "node:assert/strict";
import test from "node:test";
import { etfRow, parseKisEtfMaster } from "../src/etfService.mjs";

const widths = [2, 1, 4, 4, 4, ...Array(26).fill(1), 9, 5, 5, 1, 1, 1, 2, 1, 1, 1, 2, 2, 2, 3, 1, 3, 12, 12, 8, 15, 21, 2, 7, 1, 1, 1, 1, 1, 9, 9, 9, 5, 9, 8, 9, 3, 1, 1, 1];
const offset = (index) => widths.slice(0, index).reduce((sum, width) => sum + width, 0);

function masterLine({ code, name, group, price, shares }) {
  const tail = Buffer.alloc(227, " ");
  tail.write(group, 0, "ascii");
  tail.write(String(price).padStart(widths[31], "0"), offset(31), "ascii");
  tail.write(String(shares).padStart(widths[50], "0"), offset(50), "ascii");
  return Buffer.concat([Buffer.from(`${code.padEnd(9)}KR0000000000${name}`, "ascii"), tail, Buffer.from("\n")]);
}

test("KIS master에서 ETF만 골라 상장좌수를 실제 주수로 변환한다", () => {
  const master = Buffer.concat([
    masterLine({ code: "069500", name: "KODEX 200", group: "EF", price: 107615, shares: 232300 }),
    masterLine({ code: "005930", name: "SAMSUNG", group: "ST", price: 260000, shares: 5846278 })
  ]);
  assert.deepEqual(parseKisEtfMaster(master), [{ code: "069500", name: "KODEX 200", listedShares: 232300000, referencePrice: 107615 }]);
});

test("ETF 자금흐름 행은 종가·NAV가 있으면 시가평가액을 저장한다", () => {
  const etf = { code: "069500", name: "KODEX 200", listedShares: 232300000, referencePrice: 107615 };
  const row = etfRow({ output: { stck_prpr: "108000", nav: "107900" } }, etf, "20260901");
  assert.deepEqual(row, ["20260901", "069500", "KODEX 200", "", 232300000, 108000, 107900 * 232300000]);
});
