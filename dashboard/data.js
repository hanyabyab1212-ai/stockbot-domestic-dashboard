// 마지막 정상 데이터 fallback입니다. 자동 수집기가 실제 API 응답으로 이 파일을 갱신합니다.
window.STOCKBOT_API_URL = "https://stockbot-domestic-api.hanyabyab1212.workers.dev";
window.FLOW_DASHBOARD_DATA = {
  generatedAt: null,
  dates: [],
  columns: ["date","code","name","market","sector","closePrice","marketCapWon","foreignWon","foreignQty","institutionWon","institutionQty","pensionWon","pensionQty","tradingVolume","dailyChangePct"],
  rows: [],
  liveSnapshot: null,
  etfRows: [],
  marketRanks: {},
  automation: { source: "static-fallback", mode: "uninitialized", updatedDate: null, records: 0, failed: 0 }
};
