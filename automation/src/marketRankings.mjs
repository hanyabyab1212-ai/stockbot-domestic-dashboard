const SCANNER_URL = "https://scanner.tradingview.com/korea/scan";
const columns = ["name", "description", "close", "change", "volume", "market_cap_basic", "High.52W", "high", "sector", "exchange", "type", "active_symbol"];

function codeOf(symbol = "") { const match = String(symbol).match(/(\d{6})$/); return match?.[1] || ""; }
function value(data, index) { return Array.isArray(data) ? data[index] : null; }
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function scannerRequest() {
  return {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://www.tradingview.com" },
    body: JSON.stringify({
      filter: [{ left: "type", operation: "equal", right: "stock" }, { left: "active_symbol", operation: "equal", right: true }],
      options: { lang: "ko" },
      range: [0, 5000],
      columns,
      sort: { sortBy: "market_cap_basic", sortOrder: "desc" }
    })
  };
}

function retryable(error) {
  return error?.retryable !== false;
}

export async function fetchTradingViewScanner({ fetchImpl = fetch, attempts = 3, waitImpl = wait } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(SCANNER_URL, scannerRequest());
      if (!response.ok) {
        const error = new Error(`TradingView scanner ${response.status}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !retryable(error)) break;
      await waitImpl(750 * attempt);
    }
  }
  throw new Error(`TradingView 종목 마스터 요청 실패 (${attempts}회 재시도): ${lastError?.message || "알 수 없는 오류"}`, { cause: lastError });
}

export async function loadTradingViewMarketRankings(options = {}) {
  const payload = await fetchTradingViewScanner(options); const list = payload.data || [];
  if (list.length < 1000) throw new Error(`TradingView scanner 비정상 응답: ${list.length}종목`);
  const stocks = list.map((entry) => {
    const data = entry.d || []; const exchange = String(value(data, 9) || ""); const market = /KOSDAQ/i.test(exchange) ? "코스닥" : "유가";
    return { code: codeOf(entry.s), name: value(data, 1) || value(data, 0) || entry.s, closePrice: value(data, 2), dailyChangePct: value(data, 3), tradingVolume: value(data, 4), marketCapWon: value(data, 5), high52: value(data, 6), high: value(data, 7), sector: value(data, 8) || "미분류", market, exchange };
  }).filter((item) => item.code && Number(item.closePrice) > 0);
  const highs = stocks.filter((item) => Number(item.tradingVolume) > 0 && Math.abs(Number(item.dailyChangePct)) >= .005 && Number(item.high) >= Number(item.high52) * .999).sort((a, b) => Number(b.dailyChangePct) - Number(a.dailyChangePct));
  const daily = stocks.filter((item) => Number(item.tradingVolume) > 0 && Number(item.dailyChangePct) !== 0).sort((a, b) => Number(b.dailyChangePct) - Number(a.dailyChangePct));
  return { stocks, marketRanks: { highs, daily, weekly: [] } };
}

// TradingView의 당일 고가가 52주 최고가와 같은 종목만 `highs`에 남는다.
// 따라서 마감 수집의 거래일을 신고가가 확인·갱신된 날짜로 함께 보관한다.
export function markHighUpdateDate(marketRanks, date) {
  if (!/^\d{8}$/.test(String(date || ""))) return marketRanks;
  return { ...marketRanks, highs: (marketRanks?.highs || []).map((item) => ({ ...item, highUpdatedAt: date })) };
}
