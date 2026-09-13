(() => {
  "use strict";
  const PAGE = document.body.dataset.page || "home";
  const FALLBACK = window.FLOW_DASHBOARD_DATA || { columns: [], rows: [], dates: [], etfRows: [] };
  const COLS = FALLBACK.columns || [];
  const I = Object.fromEntries(COLS.map((name, index) => [name, index]));
  const API = String(window.STOCKBOT_API_URL || "").replace(/\/$/, "");
  const selectedCodeFromUrl = new URLSearchParams(location.search).get("code");
  const state = { data: FALLBACK, selectedCode: /^\d{6}$/.test(selectedCodeFromUrl || "") ? selectedCodeFromUrl : "005930", days: 7, actor: "foreignWon", direction: "buy", etfCategory: "업종별", momentumMode: "high", market: "유가", period: "day", directionMove: "up", marketIndex: "kospi", marketData: null };
  const nav = [
    ["market", "market.html", "오늘의 시장", "◉"], ["reports", "reports.html", "리포트 브리핑", "▤"], ["macro", "macro.html", "거시지표", "◎"], ["home", "index.html", "특이동향", "✦"], ["stocks", "stocks.html", "종목별 검색", "⌕"], ["rankings", "rankings.html", "누적 수급 순위", "≡"], ["etf", "etf.html", "ETF 자금흐름", "◫"], ["momentum", "momentum.html", "52주 신고가·등락률", "↗"]
  ];
  const number = (value, fallback = null) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const signClass = (value) => value > 0 ? "positive" : value < 0 ? "negative" : "muted";
  const sign = (value) => value > 0 ? "+" : value < 0 ? "-" : "";
  const won = (value, blank = "-") => {
    if (value == null || !Number.isFinite(Number(value))) return blank;
    const v = Number(value), abs = Math.abs(v);
    if (abs >= 1e12) return `${sign(v)}${(abs / 1e12).toFixed(2)}조`;
    if (abs >= 1e8) return `${sign(v)}${(abs / 1e8).toFixed(abs < 1e9 ? 2 : 1)}억`;
    return `${sign(v)}${(abs / 1e8).toFixed(2)}억`;
  };
  const cap = (value) => value == null ? "-" : Math.abs(value) >= 1e12 ? `${(value / 1e12).toFixed(2)}조` : `${(value / 1e8).toFixed(0)}억`;
  const pct = (value, digits = 2) => value == null || !Number.isFinite(Number(value)) ? "-" : `${sign(Number(value))}${Math.abs(Number(value)).toFixed(digits)}%`;
  const shortDate = (date) => date && String(date).length >= 8 ? `${Number(String(date).slice(4, 6))}/${Number(String(date).slice(6, 8))}` : "-";
  const longDate = (date) => date && String(date).length >= 8 ? `${String(date).slice(0, 4)}.${String(date).slice(4, 6)}.${String(date).slice(6, 8)}` : "-";
  const price = (value) => value == null ? "-" : `${Math.round(value).toLocaleString("ko-KR")}원`;
  const macroPlaceholders = [
    ["usd-krw", "원/달러", "USD/KRW", "krw", "한국은행 ECOS", "매매기준율"],
    ["kr-gov-10y", "한국 국고채 10년", "KTB 10Y", "yield", "한국은행 ECOS", "일별 수익률"],
    ["us-gov-10y", "미국 국채 10년", "UST 10Y", "yield", "U.S. Treasury", "일별 만기수익률"],
    ["usd-krw-swap-3m", "USD/KRW 3개월 스왑", "3M implied", "swap", "금리차 추정", "실제 호가 아님"],
    ["wti", "WTI 원유", "WTI Spot", "oil", "U.S. EIA", "현물 · 달러/배럴"]
  ].map(([id, name, symbol, format, source, note]) => ({ id, name, symbol, format, source, note, price: null, status: "무료 API 키 등록 후 첫 수집" }));
  const macroStored = () => Array.isArray(state.data.macro?.items) && state.data.macro.items.length ? state.data.macro.items : macroPlaceholders;
  const macroDate = (value) => {
    const raw = String(value ?? "");
    if (/^\d{8}$/.test(raw)) return longDate(raw);
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10).replaceAll("-", ".");
    return "연결 대기";
  };
  const macroValue = (item) => {
    const value = number(item.price);
    if (value == null) return "연결 대기";
    if (item.format === "krw") return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;
    if (item.format === "yield") return `${value.toFixed(2)}%`;
    if (item.format === "swap") return `${sign(value)}${Math.abs(value).toFixed(2)}원`;
    if (item.format === "oil") return `$${value.toFixed(2)}`;
    return value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
  };
  const macroChange = (item) => {
    const value = number(item.change);
    if (item.format === "yield" && value != null) return `${sign(value)}${Math.abs(value * 100).toFixed(1)}bp`;
    return pct(item.changePct);
  };
  const macroSources = (item) => {
    const bok = ["https://ecos.bok.or.kr/", "한국은행 ECOS"];
    const treasury = ["https://home.treasury.gov/resource-center/data-chart-center/interest-rates", "U.S. Treasury"];
    const sources = {
      "usd-krw": [bok], "kr-gov-10y": [bok], "us-gov-10y": [treasury],
      "usd-krw-swap-3m": [bok, treasury],
      wti: [["https://www.eia.gov/dnav/pet/hist/RWTCd.htm", "U.S. EIA"]]
    };
    if (sources[item.id]) return sources[item.id];
    if (item.source === "Yahoo Finance" && item.symbol) return [[`https://finance.yahoo.com/quote/${encodeURIComponent(item.symbol)}`, "Yahoo Finance"]];
    return [];
  };
  const macroSourceLinks = (item) => {
    const sources = macroSources(item);
    if (!sources.length) return esc(item.source || "출처 정보 없음");
    return sources.map(([url, label]) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${esc(label)} <span aria-hidden="true">↗</span></a>`).join("<span class=\"macro-source-divider\">·</span>");
  };
  const macroCards = (items) => items.map((item) => `<article class="panel macro"><div class="panel-head"><div><h3>${esc(item.name)}</h3><div class="small">${esc(item.symbol || "-")}</div></div><span class="${signClass(item.change ?? item.changePct)}">${macroChange(item)}</span></div><div class="macro-value ${item.price == null ? "muted" : ""}">${macroValue(item)}</div><div class="small">기준일 · ${esc(item.asOf ? macroDate(item.asOf) : item.status || "연결 대기")}</div><div class="small macro-source">출처 · ${macroSourceLinks(item)}</div>${item.note ? `<div class="small macro-note">${esc(item.note)}</div>` : ""}</article>`).join("") || empty();
  const active = (condition) => condition ? " active" : "";
  const row = (raw) => Object.fromEntries(COLS.map((column, index) => [column, raw[index]]));
  const rows = () => {
    const base = Array.isArray(state.data.rows) ? state.data.rows : [];
    const live = state.data.liveSnapshot?.rows;
    const merged = Array.isArray(live) && live.length ? [...base.filter((r) => r[I.date] !== state.data.liveSnapshot.date), ...live] : base;
    return merged.map(row).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.code).localeCompare(String(b.code)));
  };
  const latest = (allRows) => {
    const map = new Map();
    for (const item of allRows) if (!map.has(item.code)) map.set(item.code, item);
    return map;
  };
  const byCode = (allRows, code) => allRows.filter((item) => item.code === code).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const html = (title, eyebrow, description, body) => {
    document.querySelector("#app").innerHTML = `<div class="shell"><header class="topbar"><a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true"></span>알파냥의 주식봇</a><div class="status"><span class="dot"></span><span>${state.data.generatedAt ? `데이터 ${longDate(String(state.data.generatedAt).slice(0, 10).replaceAll("-", ""))}` : "데이터 연결 대기"}</span></div></header><div class="layout"><aside class="sidebar"><nav class="nav">${nav.map(([id, href, label, icon]) => `<a href="${href}" class="${id === PAGE ? "active" : ""}"><span class="nav-icon">${icon}</span>${label}</a>`).join("")}</nav></aside><main class="content"><section class="hero"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></section>${body}</main></div></div>`;
  };
  const empty = (message = "표시할 실제 데이터가 아직 없습니다. 첫 수집이 끝나면 자동으로 갱신됩니다.") => `<div class="empty">${esc(message)}</div>`;
  const tabs = (items, value, attr) => `<div class="filters">${items.map(([key, label]) => `<button class="filter${active(value === key)}" data-filter="${attr}" data-value="${esc(key)}" type="button">${esc(label)}</button>`).join("")}</div>`;
  const attachTabs = () => document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => { state[button.dataset.filter] = button.dataset.value; render(); }));
  const streak = (list, key) => {
    let currentSign = 0, count = 0, total = 0, records = [];
    for (const item of list) {
      const value = item[key];
      if (value == null) continue;
      const next = value > 0 ? 1 : value < 0 ? -1 : 0;
      if (!next || (currentSign && currentSign !== next)) break;
      if (!currentSign) currentSign = next;
      count++; total += value; records.push(item);
    }
    return { sign: currentSign, count, total, records };
  };
  const signalGroups = (allRows) => {
    const groups = new Map([["pension-buy", []], ["foreign-buy", []], ["both-buy", []], ["pension-sell", []], ["foreign-sell", []], ["both-sell", []]]);
    for (const [code, latestRow] of latest(allRows)) {
      const history = byCode(allRows, code), foreign = streak(history, "foreignWon"), pension = streak(history, "pensionWon");
      const add = (key, data) => { if (data.count >= 3) groups.get(key).push({ latest: latestRow, ...data }); };
      if (foreign.sign > 0) add("foreign-buy", foreign); if (foreign.sign < 0) add("foreign-sell", foreign);
      if (pension.sign > 0) add("pension-buy", pension); if (pension.sign < 0) add("pension-sell", pension);
      if (!state.data.liveSnapshot && foreign.sign && pension.sign && foreign.sign === pension.sign) {
        const both = { sign: foreign.sign, count: Math.min(foreign.count, pension.count), total: foreign.total + pension.total, records: foreign.records.slice(0, Math.min(foreign.count, pension.count)) };
        add(foreign.sign > 0 ? "both-buy" : "both-sell", both);
      }
    }
    for (const list of groups.values()) list.sort((a, b) => b.count - a.count || Math.abs(b.total) - Math.abs(a.total));
    return groups;
  };
  const signalCard = (item, actor) => {
    const capRatio = item.latest.marketCapWon ? item.total / item.latest.marketCapWon * 100 : null;
    const actorText = actor === "both" ? "외국인·연기금" : actor === "foreign" ? "외국인" : "연기금";
    return `<article class="signal-card"><div class="signal-top"><div><div class="signal-name">${esc(item.latest.name)} <span class="${signClass(item.latest.dailyChangePct)}">${pct(item.latest.dailyChangePct)}</span></div><div class="signal-meta">${esc(item.latest.code)} · ${esc(item.latest.sector || "미분류")} · ${price(item.latest.closePrice)}</div></div><span class="pill">${item.count}일 연속</span></div><div class="signal-metrics"><span>기간 ${shortDate(item.records.at(-1)?.date)}–${shortDate(item.latest.date)}</span><strong class="${signClass(item.total)}">${won(item.total)}</strong><span>시총 대비 ${pct(capRatio, 3)}</span></div><div class="small">${actorText} ${item.sign > 0 ? "순매수" : "순매도"} · 최근 시총 기준</div></article>`;
  };
  const investorTrendBoard = (trend) => {
    const rows = Array.isArray(trend?.rows) ? trend.rows : [];
    if (!rows.length) return empty(trend?.error || "시장종합 데이터가 다음 마감 수집 후 표시됩니다.");
    return `<div class="head"><span>구분</span><span>개인</span><span>외국인</span><span>기관</span></div>${rows.map((item) => `<div><strong>${esc(item.market)}</strong><span class="${signClass(item.personal)}">${won(item.personal)}</span><span class="${signClass(item.foreign)}">${won(item.foreign)}</span><span class="${signClass(item.institution)}">${won(item.institution)}</span></div>`).join("")}<div class="small" style="margin-top:12px">${esc(trend.source || "한국투자증권 Open API")} · ${longDate(trend.asOf)}</div>`;
  };
  const renderHome = () => {
    const allRows = rows(), groups = signalGroups(allRows);
    const names = [["pension-buy", "연기금 연속 순매수", "pension"], ["foreign-buy", "외국인 연속 순매수", "foreign"], ["both-buy", "연기금·외국인 동시 순매수", "both"], ["pension-sell", "연기금 연속 순매도", "pension"], ["foreign-sell", "외국인 연속 순매도", "foreign"], ["both-sell", "연기금·외국인 동시 순매도", "both"]];
    const accordions = names.filter(([key]) => !(state.data.liveSnapshot && key.startsWith("both"))).map(([key, name, actor], index) => `<details ${index === 0 ? "open" : ""}><summary><span>${name}</span><span class="pill">${groups.get(key).length}종목</span></summary><div class="accordion-body">${groups.get(key).length ? groups.get(key).slice(0, 30).map((item) => signalCard(item, actor)).join("") : empty("3거래일 이상의 조건 충족 종목이 없습니다.")}</div></details>`).join("");
    html("특이동향", "Flow Intelligence / 알파냥의 주식봇", state.data.liveSnapshot ? `장중 잠정(외국인·기관) ${shortDate(state.data.liveSnapshot.date)} · 연기금은 전일 마감 기준입니다.` : "마감 수급을 바탕으로 연속 순매수·순매도 흐름을 찾습니다.", `<div class="grid two"><section class="panel"><div class="panel-head"><h2>투자자동향</h2><span class="small">현물 순매수 · 억원</span></div><div id="investor-trends" class="trend-board">${investorTrendBoard(state.data.investorTrends)}</div></section><section class="panel"><div class="panel-head"><h2>수집 상태</h2><span class="pill">${esc(state.data.automation?.mode || "대기")}</span></div><div class="metric"><div class="metric-label">마지막 갱신</div><div class="metric-value">${state.data.generatedAt ? new Date(state.data.generatedAt).toLocaleString("ko-KR") : "연결 대기"}</div></div><div class="metric"><div class="metric-label">유효 종목 수</div><div class="metric-value">${Number(state.data.automation?.records || 0).toLocaleString("ko-KR")}</div></div><div class="metric"><div class="metric-label">실패 종목 수</div><div class="metric-value">${Number(state.data.automation?.failed || 0).toLocaleString("ko-KR")}</div></div></section></div><section class="panel" style="margin-top:18px"><div class="panel-head"><h2>특이동향</h2><span class="small">연속일수 ↓ · 누적금액 절댓값 ↓</span></div><div class="accordion">${accordions}</div></section>`);
    loadHomeDynamic();
  };
  async function loadHomeDynamic() {
    try {
      const trend = await api("/api/investor-trends");
      const target = document.querySelector("#investor-trends");
      if (target) target.innerHTML = investorTrendBoard(trend);
    } catch { /* fallback is already visible */ }
  }
  const renderMacro = () => {
    html("거시지표", "Macro Dashboard", "환율·한국과 미국 국채금리·USD/KRW 3개월 스왑 추정치·원유 등 주요 시장 환경을 한 곳에서 확인합니다.", `<div class="notice">USD/KRW 3개월 스왑은 한국과 미국의 3개월 금리차로 계산한 추정치이며, 실제 시장 호가가 아닙니다.</div><section class="grid three" id="macro-board">${macroCards(macroStored())}</section>`);
    loadMacroDynamic();
  };
  async function loadMacroDynamic() {
    try {
      const result = await api("/api/markets");
      const board = document.querySelector("#macro-board");
      if (board) board.innerHTML = macroCards([...macroStored(), ...(result.macro || [])]);
    } catch { /* 저장된 거시지표 카드를 유지한다 */ }
  }
  const marketIndexSpecs = [
    { id: "kospi", name: "KOSPI", symbol: "^KS11", description: "코스피 종합주가지수" },
    { id: "kosdaq", name: "KOSDAQ", symbol: "^KQ11", description: "코스닥 종합주가지수" }
  ];
  const sectorLabels = {
    "Electronic Technology": "IT·반도체", "Producer Manufacturing": "산업재", "Process Industries": "소재·화학", "Health Technology": "바이오·헬스케어",
    "Technology Services": "IT서비스", "Consumer Non-Durables": "필수소비재", "Consumer Durables": "경기소비재", Finance: "금융",
    "Non-Energy Minerals": "철강·소재", "Energy Minerals": "에너지", "Distribution Services": "유통", "Commercial Services": "상업서비스",
    "Consumer Services": "소비자서비스", "Industrial Services": "산업서비스", Communications: "통신", Utilities: "유틸리티"
  };
  const friendlySector = (sector) => sectorLabels[sector] || sector || "기타";
  const marketIndexData = (id) => {
    const spec = marketIndexSpecs.find((item) => item.id === id) || marketIndexSpecs[0];
    return (state.marketData?.indices || []).find((item) => item.id === spec.id) || { ...spec, price: null, change: null, changePct: null, series: [] };
  };
  const marketPrice = (value) => value == null || !Number.isFinite(Number(value)) ? "연결 대기" : Number(value).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const marketRows = () => [...latest(rows()).values()].filter((item) => number(item.dailyChangePct) != null);
  const marketSummary = () => {
    const current = marketRows(), sectors = new Map();
    for (const item of current) {
      const key = friendlySector(item.sector);
      if (!sectors.has(key)) sectors.set(key, { name: key, count: 0, sum: 0, up: 0, down: 0 });
      const group = sectors.get(key), change = number(item.dailyChangePct, 0);
      group.count += 1; group.sum += change; if (change > 0) group.up += 1; if (change < 0) group.down += 1;
    }
    const sectorList = [...sectors.values()].filter((item) => item.count >= 5).map((item) => ({ ...item, change: item.sum / item.count })).sort((a, b) => b.change - a.change);
    const advance = current.filter((item) => number(item.dailyChangePct, 0) > 0).length;
    const decline = current.filter((item) => number(item.dailyChangePct, 0) < 0).length;
    const flat = current.length - advance - decline;
    const signals = [...current].filter((item) => number(item.marketCapWon, 0) >= 1e11).sort((a, b) => Math.abs(number(b.dailyChangePct, 0)) - Math.abs(number(a.dailyChangePct, 0))).slice(0, 6);
    return { current, sectors: sectorList.slice(0, 8), allSectors: sectorList, advance, decline, flat, signals };
  };
  const marketInvestorFlow = () => (state.data.investorTrends?.rows || []).reduce((sum, item) => sum + number(item.foreign, 0), 0);
  const marketIndexCard = (item) => `<article class="market-kpi"><div class="market-kpi-head"><span>${esc(item.name)}</span><span class="${signClass(item.changePct)}">${pct(item.changePct)}</span></div><strong>${marketPrice(item.price)}</strong><div class="small">${esc(item.description || "실시간 지수")}</div></article>`;
  const marketBreadth = ({ advance, decline, flat }) => {
    const total = Math.max(1, advance + decline + flat), upWidth = advance / total * 100, downWidth = decline / total * 100, flatWidth = flat / total * 100;
    return `<section class="panel market-breadth"><div class="panel-head"><div><h2>시장 폭</h2><div class="small">최신 마감 종목 기준</div></div><span class="small">상승 ${advance.toLocaleString("ko-KR")} · 하락 ${decline.toLocaleString("ko-KR")}</span></div><div class="breadth-bar"><i class="breadth-up" style="width:${upWidth}%"></i><i class="breadth-flat" style="width:${flatWidth}%"></i><i class="breadth-down" style="width:${downWidth}%"></i></div><div class="breadth-labels"><span class="positive">상승 ${advance.toLocaleString("ko-KR")}</span><span>보합 ${flat.toLocaleString("ko-KR")}</span><span class="negative">하락 ${decline.toLocaleString("ko-KR")}</span></div></section>`;
  };
  const marketSectorTiles = (sectors) => `<section class="panel"><div class="panel-head"><div><h2>업종 온도</h2><div class="small">업종별 평균 등락률 · 종목 수 5개 이상</div></div><span class="small">최신 마감 기준</span></div><div class="sector-tiles">${sectors.length ? sectors.map((item) => `<article class="sector-tile ${item.change > 0 ? "warm" : item.change < 0 ? "cool" : "neutral"}"><div class="small">${esc(item.name)} · ${item.count}종목</div><strong class="${signClass(item.change)}">${pct(item.change)}</strong><div class="small">상승 ${item.up} · 하락 ${item.down}</div></article>`).join("") : empty("업종별 등락률 데이터를 계산하는 중입니다.")}</div></section>`;
  const marketSignals = (signals) => `<section class="panel"><div class="panel-head"><div><h2>오늘의 변동 시그널</h2><div class="small">시가총액 1,000억 원 이상 · 절대 등락률 순</div></div><a class="text-link" href="momentum.html">전체 보기 ↗</a></div>${signals.length ? `<div class="market-signals">${signals.map((item) => `<a class="market-signal" href="stocks.html?code=${encodeURIComponent(item.code)}"><div><strong>${esc(item.name)}</strong><span>${esc(item.code)} · ${esc(friendlySector(item.sector))}</span></div><div><strong class="${signClass(item.dailyChangePct)}">${pct(item.dailyChangePct)}</strong><span>거래량 ${number(item.tradingVolume, 0).toLocaleString("ko-KR")}</span></div></a>`).join("")}</div>` : empty("오늘의 변동 종목을 불러오는 중입니다.")}</section>`;
  const marketBrief = (summary) => {
    const strongest = summary.allSectors[0], weakest = summary.allSectors.at(-1), foreign = marketInvestorFlow(), kospi = marketIndexData("kospi"), kosdaq = marketIndexData("kosdaq");
    const indexLine = [kospi, kosdaq].filter((item) => item.price != null).map((item) => `${item.name} ${pct(item.changePct)}`).join(" · ") || "장중 지수 연결 대기";
    return `<aside class="panel market-brief"><div class="eyebrow">Data Briefing</div><h2>오늘의 시장 요약</h2><p>${esc(indexLine)}</p><div class="brief-row"><span>외국인 수급</span><strong class="${signClass(foreign)}">${won(foreign)}</strong></div><div class="brief-row"><span>강한 업종</span><strong class="${signClass(strongest?.change)}">${esc(strongest ? `${strongest.name} ${pct(strongest.change)}` : "집계 중")}</strong></div><div class="brief-row"><span>약한 업종</span><strong class="${signClass(weakest?.change)}">${esc(weakest ? `${weakest.name} ${pct(weakest.change)}` : "집계 중")}</strong></div><p class="small">지수는 네이버페이 증권의 장중 1분 데이터를 5분 간격으로 표시하며, 업종과 수급은 마지막 정상 마감 수집 데이터 기준입니다. 투자 판단의 근거로만 사용하지 마세요.</p></aside>`;
  };
  function drawMarketIndexChart(index) {
    const canvas = document.querySelector("#market-index-chart"), series = (index.series || []).filter((item) => Number.isFinite(Number(item.value)));
    if (!canvas || series.length < 2) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1, width = Math.max(1, rect.width), height = Math.max(1, rect.height);
      canvas.width = width * ratio; canvas.height = height * ratio;
      const ctx = canvas.getContext("2d"); ctx.scale(ratio, ratio); ctx.clearRect(0, 0, width, height);
      const pad = { left: 48, right: 14, top: 18, bottom: 30 }, values = series.map((item) => Number(item.value));
      const min = Math.min(...values), max = Math.max(...values), range = Math.max(.01, max - min), chartHeight = height - pad.top - pad.bottom, chartWidth = width - pad.left - pad.right;
      ctx.strokeStyle = "rgba(148,163,184,.18)"; ctx.fillStyle = "#8d99ae"; ctx.font = "11px sans-serif";
      for (let step = 0; step <= 3; step += 1) { const y = pad.top + chartHeight * step / 3, value = max - range * step / 3; ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke(); ctx.fillText(value.toLocaleString("ko-KR", { maximumFractionDigits: 1 }), 2, y + 4); }
      const color = number(index.changePct, 0) >= 0 ? "#ff6673" : "#5b9cff";
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.beginPath();
      series.forEach((item, position) => { const x = pad.left + position / (series.length - 1) * chartWidth, y = pad.top + (max - Number(item.value)) / range * chartHeight; position ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      const label = (item) => { const date = new Date(Number(item.time) * 1000); return Number.isNaN(date.valueOf()) ? "" : date.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }); };
      ctx.fillStyle = "#8d99ae"; ctx.fillText(label(series[0]), pad.left, height - 8); const last = label(series.at(-1)); ctx.fillText(last, width - pad.right - ctx.measureText(last).width, height - 8);
    };
    new ResizeObserver(draw).observe(canvas.parentElement); draw();
  }
  const renderMarket = ({ refresh = true } = {}) => {
    const summary = marketSummary(), index = marketIndexData(state.marketIndex), usd = macroStored().find((item) => item.id === "usd-krw"), foreign = marketInvestorFlow();
    const flowValue = foreign === 0 ? "집계 중" : won(foreign);
    const chart = (index.series || []).filter((item) => Number.isFinite(Number(item.value))).length > 1 ? `<canvas id="market-index-chart" aria-label="${esc(index.name)} 장중 흐름 차트"></canvas>` : empty("장중 지수 차트는 무료 시세 API가 연결되면 표시됩니다.");
    html("오늘의 시장", "Korea Equity / Market Desk", "지수·환율·수급·업종의 변화를 한 화면에서 확인합니다. 장중 지수는 무료 시세 데이터로 갱신되며, 업종과 수급은 마지막 정상 마감 데이터를 사용합니다.", `<section class="market-kpi-grid">${marketIndexSpecs.map((spec) => marketIndexCard(marketIndexData(spec.id))).join("")}<article class="market-kpi"><div class="market-kpi-head"><span>원/달러</span><span class="${signClass(usd?.changePct)}">${macroChange(usd || {})}</span></div><strong>${usd ? macroValue(usd) : "연결 대기"}</strong><div class="small">한국은행 ECOS · 매매기준율</div></article><article class="market-kpi"><div class="market-kpi-head"><span>외국인 순매수</span><span class="${signClass(foreign)}">${foreign > 0 ? "순매수" : foreign < 0 ? "순매도" : "집계 중"}</span></div><strong class="${signClass(foreign)}">${flowValue}</strong><div class="small">코스피·코스닥 합계 · 억원</div></article></section><section class="market-main-grid"><div class="market-stack"><section class="panel"><div class="panel-head"><div><h2>시장 흐름</h2><div class="small">무료 시세 API · 장중 5분 단위</div></div>${tabs(marketIndexSpecs.map((item) => [item.id, item.name]), state.marketIndex, "marketIndex")}</div><div class="market-index-value"><strong>${marketPrice(index.price)}</strong><span class="${signClass(index.changePct)}">${pct(index.changePct)}</span><span>${esc(index.description || "국내 주가지수")}</span></div><div class="chart-wrap market-chart-wrap">${chart}</div></section>${marketBreadth(summary)}${marketSectorTiles(summary.sectors)}${marketSignals(summary.signals)}</div><div class="market-side">${marketBrief(summary)}<section class="panel"><div class="panel-head"><div><h2>데이터 기준</h2><div class="small">수집 상태와 출처</div></div></div><div class="metric"><div class="metric-label">마지막 정상 마감</div><div class="metric-value">${state.data.automation?.updatedDate ? longDate(state.data.automation.updatedDate) : "연결 대기"}</div></div><div class="metric"><div class="metric-label">수집 종목</div><div class="metric-value">${Number(state.data.automation?.records || 0).toLocaleString("ko-KR")}개</div></div><div class="metric"><div class="metric-label">지수 출처</div><div class="metric-value"><a class="text-link" href="https://finance.naver.com/sise/sise_index.naver?code=${encodeURIComponent(index.symbol || "KOSPI")}" target="_blank" rel="noopener noreferrer">네이버페이 증권 ↗</a></div></div></section></div></section>`);
    attachTabs(); drawMarketIndexChart(index); if (refresh) loadMarketDynamic();
  };
  async function loadMarketDynamic() {
    try {
      state.marketData = await api("/api/markets");
      if (PAGE === "market") renderMarket({ refresh: false });
    } catch { /* 마지막 마감 데이터와 연결 대기 상태를 유지한다 */ }
  }
  const researchDate = (value) => /^\d{8}$/.test(String(value || "")) ? longDate(value) : "-";
  const researchUrl = (value) => {
    try {
      const url = new URL(String(value || ""));
      return url.origin === "https://stock.naver.com" && url.pathname.startsWith("/research/") ? url.href : "https://stock.naver.com/research";
    } catch { return "https://stock.naver.com/research"; }
  };
  const reportTarget = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? `${Math.round(Number(value)).toLocaleString("ko-KR")}원` : "";
  const reportCard = (item) => {
    const company = [item.company, item.companyCode ? `(${item.companyCode})` : ""].filter(Boolean).join(" ");
    const details = [company, item.broker, item.analyst, item.opinion, reportTarget(item.targetPrice)].filter(Boolean).join(" · ");
    const highlights = Array.isArray(item.highlights) ? item.highlights.slice(0, 2) : [];
    return `<a class="report-card" href="${esc(researchUrl(item.sourceUrl))}" target="_blank" rel="noopener noreferrer"><div class="report-card-head"><span class="report-tag">${esc(item.category || "리포트")}</span><span class="small">${researchDate(item.publishedAt)}</span></div><h3>${esc(item.title || "제목 없음")}</h3>${details ? `<div class="report-meta">${esc(details)}</div>` : ""}<p>${esc(item.summary || "원문에서 핵심 내용을 확인하세요.")}</p>${highlights.length ? `<ul>${highlights.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>` : ""}<span class="report-open">네이버 증권 원문 보기 <span aria-hidden="true">↗</span></span></a>`;
  };
  const reportList = (items, message) => items.length ? `<div class="report-list">${items.map(reportCard).join("")}</div>` : empty(message);
  const renderReports = () => {
    const research = state.data.research || {}, company = Array.isArray(research.company) ? research.company : [], macro = Array.isArray(research.macro) ? research.macro : [];
    const naverUrl = research.sources?.naver || "https://stock.naver.com/research";
    const etfCheckUrl = research.sources?.etfCheck || "https://www.etfcheck.co.kr/mobile/main";
    const companyNote = research.companyUsesLatest ? "당일 업로드가 없어 가장 최근 공개 리포트를 표시합니다." : "당일 공개된 리포트를 우선 표시합니다.";
    const macroNote = research.macroUsesLatest ? "당일 업로드가 없어 가장 최근 공개 리포트를 표시합니다." : "당일 공개된 리포트를 우선 표시합니다.";
    html("리포트 브리핑", "Daily Research Brief", "네이버 증권에 공개된 기업·산업·거시 리포트의 핵심 문장을 짧게 발췌하고, 모든 카드는 원문으로 연결합니다.", `<section class="report-status"><div><strong>기준일 ${researchDate(research.referenceDate)}</strong><span>자동 발췌 요약 · 원문 링크 제공</span></div><a class="text-link" href="${esc(naverUrl)}" target="_blank" rel="noopener noreferrer">네이버 증권 리서치 전체 보기 ↗</a></section><section class="report-layout"><div class="report-main"><section class="panel report-section"><div class="panel-head"><div><h2>기업 리포트</h2><div class="small">개별 기업의 실적·투자의견·목표주가</div></div><span class="small">${esc(companyNote)}</span></div>${reportList(company, "기업 리포트를 갱신 중입니다. 리포트 수집 모드를 한 번 실행해 주세요.")}</section><section class="panel report-section"><div class="panel-head"><div><h2>산업·거시 브리핑</h2><div class="small">산업 · 투자전략 · 경제 · 채권</div></div><span class="small">${esc(macroNote)}</span></div>${reportList(macro, "산업·거시 리포트를 갱신 중입니다. 리포트 수집 모드를 한 번 실행해 주세요.")}</section></div><aside class="report-side"><section class="panel"><div class="eyebrow">HOW TO READ</div><h2>읽는 방법</h2><p class="report-side-copy">요약은 공개 리포트 본문의 앞부분을 자동으로 짧게 발췌한 안내입니다. 투자 판단 전에는 반드시 원문과 발간일을 확인하세요.</p><div class="metric"><div class="metric-label">마지막 리포트 갱신</div><div class="metric-value">${research.updatedAt ? researchDate(String(research.updatedAt).slice(0, 10).replaceAll("-", "")) : "연결 대기"}</div></div></section><section class="panel etf-report-link"><div class="eyebrow">ETF CHECK</div><h2>ETF·산업 리포트 탐색</h2><p>ETF CHECK의 원문은 출처 사이트에서 직접 확인하도록 연결합니다.</p><a class="report-source-button" href="${esc(etfCheckUrl)}" target="_blank" rel="noopener noreferrer">ETF CHECK에서 리포트 보기 <span aria-hidden="true">↗</span></a><div class="small">출처 이용 조건을 지키기 위해 원문을 복제하거나 자동 저장하지 않습니다.</div></section></aside></section>`);
  };
  const stockHistoryTable = (history) => `<div class="table-wrap"><table class="data-table"><thead><tr><th>날짜</th><th>주가</th><th>외국인</th><th>연기금</th><th>기관</th></tr></thead><tbody>${history.map((item, index) => `<tr><td>${longDate(item.date)}${state.data.liveSnapshot?.date === item.date && index === 0 ? " <span class=\"pill\">잠정</span>" : ""}</td><td class="${signClass(item.dailyChangePct)}">${price(item.closePrice)} <small>${pct(item.dailyChangePct)}</small></td><td class="${signClass(item.foreignWon)}">${won(item.foreignWon)}</td><td class="${signClass(item.pensionWon)}">${won(item.pensionWon, "장중 미제공")}</td><td class="${signClass(item.institutionWon)}">${won(item.institutionWon)}</td></tr>`).join("")}</tbody></table></div>`;
  function renderFlowChart(history) {
    const canvas = document.querySelector("#flow-chart");
    if (!canvas || !history.length) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1, width = Math.max(1, rect.width), height = Math.max(1, rect.height);
      canvas.width = width * ratio; canvas.height = height * ratio;
      const ctx = canvas.getContext("2d"); ctx.scale(ratio, ratio); ctx.clearRect(0, 0, width, height);
      const values = history.flatMap((item) => [item.foreignWon || 0, item.pensionWon || 0]);
      const max = Math.max(1, ...values.map((v) => Math.abs(v))); const pad = { left: 45, right: 14, top: 17, bottom: 28 }, base = height / 2, innerW = width - pad.left - pad.right;
      ctx.strokeStyle = "rgba(148,163,184,.20)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad.left, base); ctx.lineTo(width - pad.right, base); ctx.stroke();
      ctx.fillStyle = "#8d99ae"; ctx.font = "11px sans-serif"; ctx.fillText(`+${won(max)}`, 2, pad.top + 5); ctx.fillText("0원", 16, base + 4); ctx.fillText(`-${won(max)}`, 2, height - pad.bottom + 4);
      const plot = (key, color) => { ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2; ctx.beginPath(); history.slice().reverse().forEach((item, index, array) => { const x = pad.left + (array.length === 1 ? innerW / 2 : index / (array.length - 1) * innerW); const y = base - ((item[key] || 0) / max) * (height / 2 - pad.top); index ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); history.slice().reverse().forEach((item, index, array) => { const x = pad.left + (array.length === 1 ? innerW / 2 : index / (array.length - 1) * innerW); const y = base - ((item[key] || 0) / max) * (height / 2 - pad.top); ctx.beginPath(); ctx.arc(x, y, 3.3, 0, Math.PI * 2); ctx.fill(); }); };
      plot("foreignWon", "#ff6673"); plot("pensionWon", "#5b9cff");
      const first = history.at(-1)?.date, last = history[0]?.date; ctx.fillStyle = "#8d99ae"; ctx.fillText(shortDate(first), pad.left, height - 7); ctx.fillText(shortDate(last), width - pad.right - 24, height - 7);
    };
    new ResizeObserver(draw).observe(canvas.parentElement); draw();
  }
  const renderStocks = () => {
    const allRows = rows(), codes = [...latest(allRows).values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
    let history = byCode(allRows, state.selectedCode);
    if (!history.length) history = byCode(allRows, codes.find((item) => item.code === "005930")?.code || codes[0]?.code || "");
    const current = history[0];
    const sum = (key) => history.slice(0, 7).reduce((total, item) => total + (item[key] || 0), 0);
    html(current ? `${esc(current.name)} (${esc(current.code)})` : "종목별 검색", "Stock Flow Search", current ? `${esc(current.sector || "미분류")} · ${history.length}거래일${state.data.liveSnapshot ? " · 장중 잠정" : ""}` : "종목명 또는 여섯 자리 종목코드로 수급 이력을 찾습니다.", `<section class="panel"><label class="search">⌕ <input id="stock-search" list="stock-list" placeholder="종목명 또는 6자리 코드" value="${esc(current?.name ? `${current.name} (${current.code})` : "삼성전자 (005930)")}" aria-label="종목 검색"><datalist id="stock-list">${codes.map((item) => `<option value="${esc(item.name)} (${esc(item.code)})"></option>`).join("")}</datalist></label></section>${current ? `<section class="kpi-grid"><article class="kpi"><div class="metric-label">현재가 또는 최근 종가</div><div class="metric-value ${signClass(current.dailyChangePct)}">${price(current.closePrice)}</div><div class="metric-sub">${pct(current.dailyChangePct)}</div></article><article class="kpi"><div class="metric-label">시가총액</div><div class="metric-value">${cap(current.marketCapWon)}</div></article><article class="kpi"><div class="metric-label">외국인 7일 누적</div><div class="metric-value ${signClass(sum("foreignWon"))}">${won(sum("foreignWon"))}</div></article><article class="kpi"><div class="metric-label">연기금 7일 누적</div><div class="metric-value ${signClass(sum("pensionWon"))}">${won(sum("pensionWon"), "장중 미제공")}</div></article></section><section class="panel"><div class="panel-head"><h2>수급 추이</h2><div class="chart-legend"><span><i class="legend-dot" style="background:#ff6673"></i>외국인</span><span><i class="legend-dot" style="background:#5b9cff"></i>연기금</span></div></div><div class="chart-wrap"><canvas id="flow-chart" aria-label="외국인과 연기금의 기간별 순매수 금액. 0선 위는 순매수, 아래는 순매도"></canvas></div></section><section class="panel" style="margin-top:18px"><div class="panel-head"><h2>수급 이력</h2><span class="small">최신일 우선</span></div>${stockHistoryTable(history)}</section>` : empty("수집 후 삼성전자부터 검색할 수 있습니다.")}`);
    const search = document.querySelector("#stock-search");
    search?.addEventListener("change", () => { const text = search.value; const match = codes.find((item) => text.includes(item.code) || text.trim() === item.name); state.selectedCode = match?.code || "005930"; render(); });
    if (current) { renderFlowChart(history); updateQuotes([current.code], 30000); }
  };
  const computeRanks = (allRows) => {
    const output = [];
    for (const [code, current] of latest(allRows)) {
      const history = byCode(allRows, code).slice(0, Number(state.days));
      if (!history.length) continue;
      const amount = history.reduce((sum, item) => sum + (item[state.actor] || 0), 0), currentStreak = streak(byCode(allRows, code), state.actor);
      output.push({ current, amount, ratio: current.marketCapWon ? amount / current.marketCapWon * 100 : null, count: currentStreak.count, sign: currentStreak.sign });
    }
    return output.filter((item) => state.direction === "buy" ? item.amount > 0 : item.amount < 0).sort((a, b) => state.direction === "buy" ? b.amount - a.amount : a.amount - b.amount).slice(0, 50);
  };
  const renderRankings = () => {
    const actorNames = { foreignWon: "외국인", pensionWon: "연기금", institutionWon: "기관" }, list = computeRanks(rows());
    html("누적 수급 순위", "Accumulated Flow", "선택한 기간의 순매수·순매도 금액과 최신 시가총액 대비 비율을 비교합니다.", `<section class="panel"><h2>필터</h2>${tabs([["7", "7일"], ["14", "14일"], ["30", "30일"]], String(state.days), "days")}${tabs([["foreignWon", "외국인"], ["pensionWon", "연기금"], ["institutionWon", "기관"]], state.actor, "actor")}${tabs([["buy", "순매수"], ["sell", "순매도"]], state.direction, "direction")}</section><section class="panel" style="margin-top:18px"><div class="panel-head"><h2>${state.days}일 ${actorNames[state.actor]} ${state.direction === "buy" ? "순매수" : "순매도"} 순위</h2><span class="small">최대 50개</span></div>${list.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>순위</th><th>종목명</th><th>누적 ${state.direction === "buy" ? "순매수" : "순매도"}</th><th>시총 대비</th><th>연속일</th><th>시가총액</th></tr></thead><tbody>${list.map((item, index) => `<tr><td class="rank ${index < 3 ? "top" : ""}">${index + 1}</td><td><strong>${esc(item.current.name)}</strong> <span class="muted">(${esc(item.current.code)})</span></td><td class="${signClass(item.amount)}">${won(item.amount)}</td><td>${pct(item.ratio, 3)}</td><td>${item.sign === (state.direction === "buy" ? 1 : -1) ? `${item.count}일` : "-"}</td><td>${cap(item.current.marketCapWon)}</td></tr>`).join("")}</tbody></table></div>` : empty()}</section>`);
    attachTabs();
  };
  const etfCategory = (name) => {
    const upper = String(name || "").toUpperCase();
    if (/반도체/.test(upper)) return "반도체"; if (/2차전지|배터리/.test(upper)) return "2차전지"; if (/자동차/.test(upper)) return "자동차"; if (/금융|은행|보험|증권/.test(upper)) return "금융"; if (/조선|기계/.test(upper)) return "조선·기계"; if (/철강|소재|금속/.test(upper)) return "철강·소재"; if (/에너지|화학/.test(upper)) return "에너지·화학"; if (/게임|콘텐츠|미디어/.test(upper)) return "콘텐츠·게임"; if (/소비|유통|화장품/.test(upper)) return "소비재"; if (/액티브/.test(upper)) return "액티브"; return "기타 국내";
  };
  const etfFlow = (items) => {
    const sorted = [...items].sort((a, b) => String(a[0]).localeCompare(String(b[0]))), values = [];
    for (let index = 1; index < sorted.length; index++) values.push({ date: sorted[index][0], value: (number(sorted[index][4], 0) - number(sorted[index - 1][4], 0)) * number(sorted[index][5], 0) });
    return values;
  };
  const miniBars = (flows) => { const max = Math.max(1, ...flows.map((item) => Math.abs(item.value))); return `<div class="bar-chart">${flows.slice(-22).map((item) => `<i class="${item.value < 0 ? "negative-bar" : ""}" style="height:${Math.max(4, Math.abs(item.value) / max * 44)}px" title="${shortDate(item.date)} ${won(item.value)}"></i>`).join("")}</div>`; };
  const renderEtf = () => {
    const raw = Array.isArray(state.data.etfRows) ? state.data.etfRows : [], groups = new Map();
    for (const item of raw) { const category = item[3] || etfCategory(item[2]); if (!groups.has(category)) groups.set(category, new Map()); const map = groups.get(category); if (!map.has(item[1])) map.set(item[1], []); map.get(item[1]).push(item); }
    const categories = [...groups.keys()].sort(), shown = state.etfCategory === "업종별" ? categories.map((category) => ({ category, lists: [...groups.get(category).values()] })) : [{ category: state.etfCategory, lists: [...(groups.get(state.etfCategory)?.values() || [])] }];
    const cards = shown.flatMap(({ category, lists }) => {
      if (state.etfCategory === "업종별") { const flowMap = new Map(); lists.flat().forEach((item) => { const list = flowMap.get(item[1]) || []; list.push(item); flowMap.set(item[1], list); }); const flows = [...flowMap.values()].map(etfFlow).flat().reduce((map, item) => (map.set(item.date, (map.get(item.date) || 0) + item.value), map), new Map()); const series = [...flows].map(([date, value]) => ({ date, value })); const latestValue = series.at(-1)?.value, total = series.reduce((sum, item) => sum + item.value, 0); return `<article class="panel"><div class="panel-head"><div><h3>${esc(category)}</h3><div class="small">ETF ${lists.length}개</div></div><strong class="${signClass(latestValue)}">${won(latestValue)}</strong></div>${miniBars(series)}<div class="etf-footer"><span>시작 ${shortDate(series[0]?.date)}</span><span>중간 ${shortDate(series[Math.floor(series.length / 2)]?.date)}</span><span>1개월 ${won(total)}</span></div></article>`; }
      return lists.map((list) => { const latest = [...list].sort((a, b) => String(b[0]).localeCompare(String(a[0])))[0], flows = etfFlow(list), last = flows.at(-1)?.value, total = flows.reduce((sum, item) => sum + item.value, 0); return `<article class="panel"><div class="panel-head"><div><h3>${esc(latest[2])}</h3><div class="small">${esc(latest[1])} · ${esc(latest[3] || category)}</div></div><strong class="${signClass(last)}">${won(last)}</strong></div>${miniBars(flows)}<div class="etf-footer"><span>상장좌수 ${number(latest[4], 0).toLocaleString("ko-KR")}</span><span>시가평가액 ${cap(latest[6])}</span><span>1개월 ${won(total)}</span></div></article>`; });
    });
    html("ETF 자금흐름", "ETF Fund Flow", "상장좌수 변동 × 종가로 산출한 일별 추정 순유입·순유출입니다. 첫 수집일은 기준값만 저장되며, 다음 거래일부터 흐름이 계산됩니다.", `<section class="panel"><h2>분류</h2>${tabs([["업종별", "업종별"], ...categories.map((category) => [category, category])], state.etfCategory, "etfCategory")}</section><section class="grid two" style="margin-top:18px">${cards.length ? cards.join("") : `<div style="grid-column:1/-1">${empty("ETF 기준가격·상장좌수 데이터를 불러오는 중입니다. 첫 수집 뒤부터 분류별 ETF가 표시됩니다.")}</div>`}</section>`);
    attachTabs();
  };
  const normalRank = (raw) => Array.isArray(raw) ? raw : [];
  const renderMomentum = () => {
    const ranks = state.data.marketRanks || {}, source = state.momentumMode === "high" ? normalRank(ranks.highs || ranks.nearHighs) : normalRank(state.period === "week" ? ranks.weekly : ranks.daily);
    const list = source.filter((item) => { const market = item.market || item[3]; return market === state.market; }).filter((item) => state.momentumMode === "high" || (state.directionMove === "up" ? number(item.dailyChangePct ?? item.changePct ?? item[6], 0) > 0 : number(item.dailyChangePct ?? item.changePct ?? item[6], 0) < 0)).slice(0, 100);
    const get = (item, keys, index) => keys.map((key) => item[key]).find((value) => value != null) ?? (Array.isArray(item) ? item[index] : null);
    const highDateHeader = state.momentumMode === "high" ? "<th>신고가 갱신일</th>" : "";
    html("52주 신고가·등락률", "Market Momentum", "거래정지·0%·기업행사 의심 종목을 공식 시세로 재검증한 결과만 표시합니다.", `<section class="panel"><h2>필터</h2>${tabs([["high", "52주 신고가"], ["move", "등락률"]], state.momentumMode, "momentumMode")}${tabs([["유가", "코스피"], ["코스닥", "코스닥"]], state.market, "market")}${state.momentumMode === "move" ? `${tabs([["day", "일간"], ["week", "주간"]], state.period, "period")}${tabs([["up", "상승"], ["down", "하락"]], state.directionMove, "directionMove")}` : ""}</section><section class="panel" style="margin-top:18px"><div class="panel-head"><h2>${state.momentumMode === "high" ? "52주 신고가" : `${state.period === "week" ? "주간" : "일간"} 등락률`}</h2><span class="small">최대 100개</span></div>${list.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>순위</th><th>회사명</th><th>종가</th><th>등락률</th><th>시가총액</th><th>섹터</th>${highDateHeader}</tr></thead><tbody>${list.map((item, index) => { const name = get(item, ["name"], 2), code = get(item, ["code"], 1), close = get(item, ["closePrice", "price"], 5), change = get(item, ["dailyChangePct", "changePct"], 6), marketCap = get(item, ["marketCapWon", "marketCap"], 7), sector = get(item, ["sector"], 4), highUpdatedAt = get(item, ["highUpdatedAt"], -1); const highDate = state.momentumMode === "high" ? `<td>${longDate(highUpdatedAt)}</td>` : ""; return `<tr><td class="rank ${index < 3 ? "top" : ""}">${index + 1}</td><td><strong>${esc(name)}</strong> <span class="muted">(${esc(code)})</span></td><td>${price(close)}</td><td class="${signClass(change)}">${pct(change)}</td><td>${cap(marketCap)}</td><td>${esc(sector || "미분류")}</td>${highDate}</tr>`; }).join("")}</tbody></table></div>` : empty("TradingView·공식 시세의 신고가 및 등락률 결과가 다음 수집 후 표시됩니다.")}</section>`);
    attachTabs();
  };
  const api = async (path) => {
    if (!API) throw new Error("API endpoint unavailable");
    const response = await fetch(`${API}${path}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`API ${response.status}`);
    return response.json();
  };
  async function updateQuotes(codes, every) {
    try {
      const result = await api(`/api/stock-quotes?codes=${codes.join(",")}`);
      for (const quote of result.quotes || []) {
        if (quote.halted || quote.price == null) continue;
        const match = rows().filter((item) => item.code === quote.code).at(0);
        if (match) { match.closePrice = quote.price; match.dailyChangePct = quote.changePct; }
      }
    } catch { /* last normal data remains */ }
    if (every && document.visibilityState === "visible") setTimeout(() => updateQuotes(codes, every), every);
  }
  const render = () => ({ market: renderMarket, reports: renderReports, home: renderHome, stocks: renderStocks, rankings: renderRankings, etf: renderEtf, macro: renderMacro, momentum: renderMomentum }[PAGE] || renderHome)();
  async function loadData() {
    try {
      const remote = await api(`/api/data?t=${Date.now()}`);
      if (remote && Array.isArray(remote.rows) && Array.isArray(remote.dates)) { state.data = { ...FALLBACK, ...remote, columns: remote.columns?.length ? remote.columns : COLS }; render(); }
    } catch { /* fallback remains active */ }
  }
  async function checkVersion() {
    try {
      const version = await api("/api/data-version");
      if (state.version && version.version && version.version !== state.version) location.reload();
      state.version = version.version;
    } catch { /* retry later */ }
  }
  render(); loadData(); checkVersion(); setInterval(checkVersion, 15000);
  if (PAGE === "home") setInterval(loadHomeDynamic, 60000);
  if (PAGE === "macro") setInterval(loadMacroDynamic, 60000);
  if (PAGE === "market") setInterval(loadMarketDynamic, 60000);
})();
