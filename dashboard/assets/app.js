(() => {
  "use strict";
  const PAGE = document.body.dataset.page || "home";
  const FALLBACK = window.FLOW_DASHBOARD_DATA || { columns: [], rows: [], dates: [], etfRows: [] };
  const COLS = FALLBACK.columns || [];
  const I = Object.fromEntries(COLS.map((name, index) => [name, index]));
  const API = String(window.STOCKBOT_API_URL || "").replace(/\/$/, "");
  const state = { data: FALLBACK, selectedCode: "005930", days: 7, actor: "foreignWon", direction: "buy", etfCategory: "업종별", momentumMode: "high", market: "유가", period: "day", directionMove: "up" };
  const nav = [
    ["macro", "macro.html", "거시지표", "◎"], ["trade", "trade.html", "수출입데이터", "⇄"], ["home", "index.html", "특이동향", "✦"], ["stocks", "stocks.html", "종목별 검색", "⌕"], ["rankings", "rankings.html", "누적 수급 순위", "≡"], ["etf", "etf.html", "ETF 자금흐름", "◫"], ["momentum", "momentum.html", "52주 신고가·등락률", "↗"]
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
  const tradePlaceholders = [
    { id: "semiconductors", name: "반도체", hsLabel: "HS 8542 · 전자집적회로", rows: [] },
    { id: "cosmetics", name: "화장품", hsLabel: "HS 3303–3307 · 향수·기초·색조·헤어·구강 등", rows: [] }
  ];
  const tradeStored = () => Array.isArray(state.data.trade?.categories) && state.data.trade.categories.length ? state.data.trade.categories : tradePlaceholders;
  const tradePeriod = (period) => /^\d{6}$/.test(String(period)) ? `${String(period).slice(0, 4)}.${String(period).slice(4, 6)}` : "-";
  const tradeUsd = (value) => value == null || !Number.isFinite(Number(value)) ? "연결 대기" : `$${(Number(value) / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`;
  const tradePreviousYear = (period) => /^\d{6}$/.test(String(period)) ? `${Number(String(period).slice(0, 4)) - 1}${String(period).slice(4, 6)}` : "";
  const tradeLatest = (category) => [...(category.rows || [])].filter((row) => number(row.value) != null).sort((a, b) => String(a.period).localeCompare(String(b.period))).at(-1) || null;
  const tradeChangePct = (category, current) => {
    if (!current) return null;
    const prior = (category.rows || []).find((row) => String(row.period) === tradePreviousYear(current.period));
    const currentValue = number(current.value), priorValue = number(prior?.value);
    return currentValue != null && priorValue ? (currentValue - priorValue) / priorValue * 100 : null;
  };
  const tradeCards = (categories) => categories.map((category) => {
    const current = tradeLatest(category), changePct = tradeChangePct(category, current), change = changePct == null ? "전년 동월 대기" : pct(changePct, 1);
    return `<article class="panel macro"><div class="panel-head"><div><h3>${esc(category.name)}</h3><div class="small">${esc(category.hsLabel || "HS 코드 확인 중")}</div></div><span class="${signClass(changePct)}">${change}</span></div><div class="macro-value ${current ? "" : "muted"}">${tradeUsd(current?.value)}</div><div class="small">수출 기준월 · ${tradePeriod(current?.period)}</div><div class="small macro-source">출처 · <a href="https://comtradeplus.un.org/TradeFlow" target="_blank" rel="noopener noreferrer">UN Comtrade <span aria-hidden="true">↗</span></a></div></article>`;
  }).join("");
  const tradeRows = (categories) => {
    const byId = new Map(categories.map((category) => [category.id, new Map((category.rows || []).map((row) => [String(row.period), row.value]))]));
    const periods = [...new Set(categories.flatMap((category) => (category.rows || []).map((row) => String(row.period))))].sort().reverse();
    return periods.map((period) => `<tr><td>${tradePeriod(period)}</td><td>${tradeUsd(byId.get("semiconductors")?.get(period))}</td><td>${tradeUsd(byId.get("cosmetics")?.get(period))}</td></tr>`).join("");
  };
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
  const renderTrade = () => {
    const categories = tradeStored(), rows = tradeRows(categories), trade = state.data.trade || {};
    html("수출입데이터", "Korea Export Monitor", "반도체와 화장품의 한국 월간 수출액을 확인합니다. 현재는 수출 지표를 제공하며, 수입 품목은 필요해지면 같은 기준으로 추가할 수 있습니다.", `<div class="notice">수치는 한국의 전세계 대상 수출액(USD)입니다. 반도체는 HS 8542, 화장품은 HS 3303–3307 합계이며 공개 월간 통계의 발표 시차가 있습니다.</div><section class="grid two">${tradeCards(categories)}</section><section class="panel" style="margin-top:18px"><div class="panel-head"><h2>월별 수출액</h2><span class="small">${esc(trade.asOf ? `${tradePeriod(trade.asOf)} 기준` : "첫 마감 수집 후 표시")}</span></div>${rows ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>기준월</th><th>반도체</th><th>화장품</th></tr></thead><tbody>${rows}</tbody></table></div>` : empty("첫 마감 수집 후 최근 12개월 수출 통계가 표시됩니다.")}<div class="small macro-note">${esc(trade.note || "무료 UN Comtrade 공개 데이터를 사용합니다.")}${trade.error ? ` · ${esc(trade.error)}` : ""}</div></section>`);
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
  const render = () => ({ home: renderHome, stocks: renderStocks, rankings: renderRankings, etf: renderEtf, macro: renderMacro, trade: renderTrade, momentum: renderMomentum }[PAGE] || renderHome)();
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
})();
