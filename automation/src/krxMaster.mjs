import { loadTradingViewMarketRankings } from "./marketRankings.mjs";

// KIND의 XLS 응답 형식은 예고 없이 바뀌므로, 실행 때 TradingView의 active stock 목록을
// 보조 목록으로 사용한다. KIS 종목정보 파일과 합쳐 우선주도 최종 목록에서 보존한다.
export async function loadKrxMaster() {
  const { stocks, marketRanks } = await loadTradingViewMarketRankings();
  const master = new Map(stocks.map((stock) => [stock.code, { code: stock.code, name: stock.name, market: stock.market, sector: stock.sector, marketCapWon: stock.marketCapWon }]));
  return { master: [...master.values()], marketRanks };
}
