import { loadTradingViewMarketRankings } from "./marketRankings.mjs";
import { IDX, latestByCode } from "./domain.mjs";

// KIND의 XLS 응답 형식은 예고 없이 바뀌므로, 실행 때 TradingView의 active stock 목록을
// 보조 목록으로 사용한다. KIS 종목정보 파일과 합쳐 우선주도 최종 목록에서 보존한다.
export async function loadKrxMaster() {
  const { stocks, marketRanks } = await loadTradingViewMarketRankings();
  const master = new Map(stocks.map((stock) => [stock.code, { code: stock.code, name: stock.name, market: stock.market, sector: stock.sector, marketCapWon: stock.marketCapWon }]));
  return { master: [...master.values()], marketRanks };
}

// 외부 종목목록 서버가 잠시 끊겨도, 직전 정상 수집본에는 KIS 조회에 필요한 종목 정보가 있다.
// 이를 사용하면 일시적인 TradingView 네트워크 오류가 전체 갱신을 막지 않는다.
export function masterFromPreviousRows(rows = []) {
  return [...latestByCode(rows).values()]
    .filter((row) => row[IDX.code] && row[IDX.name])
    .map((row) => ({
      code: row[IDX.code],
      name: row[IDX.name],
      market: row[IDX.market],
      sector: row[IDX.sector],
      marketCapWon: row[IDX.marketCapWon]
    }));
}
