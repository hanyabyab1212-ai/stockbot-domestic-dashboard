const SCANNER_URL = "https://scanner.tradingview.com/korea/scan";
const columns = ["name", "description", "close", "change", "volume", "market_cap_basic", "High.52W", "high", "sector", "exchange", "type", "active_symbol"];

function codeOf(symbol = "") { const match = String(symbol).match(/(\d{6})$/); return match?.[1] || ""; }
function value(data, index) { return Array.isArray(data) ? data[index] : null; }

export async function loadTradingViewMarketRankings() {
  const response = await fetch(SCANNER_URL, { method: "POST", headers: { "content-type": "application/json", origin: "https://www.tradingview.com" }, body: JSON.stringify({ filter: [{ left: "type", operation: "equal", right: "stock" }, { left: "active_symbol", operation: "equal", right: true }], options: { lang: "ko" }, range: [0, 5000], columns, sort: { sortBy: "market_cap_basic", sortOrder: "desc" } }) });
  if (!response.ok) throw new Error(`TradingView scanner ${response.status}`);
  const payload = await response.json(); const list = payload.data || [];
  if (list.length < 1000) throw new Error(`TradingView scanner 비정상 응답: ${list.length}종목`);
  const stocks = list.map((entry) => {
    const data = entry.d || []; const exchange = String(value(data, 9) || ""); const market = /KOSDAQ/i.test(exchange) ? "코스닥" : "유가";
    return { code: codeOf(entry.s), name: value(data, 1) || value(data, 0) || entry.s, closePrice: value(data, 2), dailyChangePct: value(data, 3), tradingVolume: value(data, 4), marketCapWon: value(data, 5), high52: value(data, 6), high: value(data, 7), sector: value(data, 8) || "미분류", market, exchange };
  }).filter((item) => item.code && Number(item.closePrice) > 0);
  const highs = stocks.filter((item) => Number(item.tradingVolume) > 0 && Math.abs(Number(item.dailyChangePct)) >= .005 && Number(item.high) >= Number(item.high52) * .999).sort((a, b) => Number(b.dailyChangePct) - Number(a.dailyChangePct));
  const daily = stocks.filter((item) => Number(item.tradingVolume) > 0 && Number(item.dailyChangePct) !== 0).sort((a, b) => Number(b.dailyChangePct) - Number(a.dailyChangePct));
  return { stocks, marketRanks: { highs, daily, weekly: [] } };
}
