export interface Env {
  DASHBOARD_BUCKET: R2Bucket;
  DASHBOARD_SYNC_TOKEN: string;
  PUBLIC_DASHBOARD_ORIGIN?: string;
}

const EMPTY_DASHBOARD = {
  generatedAt: null,
  dates: [],
  columns: [],
  rows: [],
  liveSnapshot: null,
  etfRows: [],
  marketRanks: {},
  investorTrends: { rows: [] },
  automation: { source: "cloudflare-r2", mode: "uninitialized", records: 0, failed: 0 }
};
const DATA_KEY = "dashboard.json";
const VERSION_KEY = "dashboard-version.json";
const MAX_BODY_BYTES = 30 * 1024 * 1024;

function headers(request: Request, env: Env, cache = "no-store"): Headers {
  const result = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": cache,
    "x-content-type-options": "nosniff",
    "referrer-policy": "same-origin"
  });
  const origin = request.headers.get("origin");
  if (origin && env.PUBLIC_DASHBOARD_ORIGIN && origin === env.PUBLIC_DASHBOARD_ORIGIN) {
    result.set("access-control-allow-origin", origin);
    result.set("vary", "Origin");
  }
  return result;
}

function json(request: Request, env: Env, body: unknown, status = 200, cache = "no-store"): Response {
  return new Response(JSON.stringify(body), { status, headers: headers(request, env, cache) });
}

function options(request: Request, env: Env): Response {
  const result = new Response(null, { status: 204, headers: headers(request, env) });
  result.headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  result.headers.set("access-control-allow-headers", "content-type, x-dashboard-sync-token");
  result.headers.set("access-control-max-age", "86400");
  return result;
}

async function readJson<T>(bucket: R2Bucket, key: string, fallback: T): Promise<T> {
  const object = await bucket.get(key);
  if (!object) return fallback;
  try { return await object.json<T>(); } catch { return fallback; }
}

function validPayload(value: unknown): value is { dates: unknown[]; rows: unknown[]; etfRows?: unknown[] } {
  return Boolean(value && typeof value === "object" && Array.isArray((value as { dates?: unknown[] }).dates) && Array.isArray((value as { rows?: unknown[] }).rows));
}

function compactQuote(payload: Record<string, unknown>, code: string) {
  const output = (payload.output ?? payload) as Record<string, unknown>;
  const price = numberOf(output.closePrice ?? output.closePriceText ?? output.currentPrice ?? output.nv);
  const change = numberOf(output.compareToPreviousClosePrice ?? output.compareToPreviousPrice ?? output.cv);
  const changePct = numberOf(output.fluctuationsRatio ?? output.fluctuations ?? output.cr);
  const marketStatus = String(output.marketStatus ?? output.marketStatusName ?? "");
  return { code, price, change, changePct, tradedAt: output.localTradedAt ?? output.tradeDate ?? null, marketStatus, halted: /거래정지|정지/i.test(marketStatus) };
}

function numberOf(value: unknown): number | null {
  if (value == null || value === "") return null;
  const result = Number(String(value).replaceAll(",", "").replace("+", ""));
  return Number.isFinite(result) ? result : null;
}

async function naverQuote(code: string) {
  const response = await fetch(`https://m.stock.naver.com/api/stock/${encodeURIComponent(code)}/basic`, {
    headers: { "user-agent": "stockbot-domestic-dashboard/1.0", accept: "application/json" },
    cf: { cacheTtl: 20, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`naver quote ${response.status}`);
  return compactQuote(await response.json<Record<string, unknown>>(), code);
}

async function marketData() {
  const symbols = [
    ["달러인덱스", "DX-Y.NYB"], ["VIX", "^VIX"], ["나스닥 선물", "NQ=F"]
  ];
  const macro = await Promise.all(symbols.map(async ([name, symbol]) => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`;
      const payload = await (await fetch(url, { cf: { cacheTtl: 50, cacheEverything: true } })).json() as { chart?: { result?: Array<{ meta?: Record<string, unknown> }> } };
      const meta = payload.chart?.result?.[0]?.meta ?? {};
      const price = numberOf(meta.regularMarketPrice);
      const previous = numberOf(meta.chartPreviousClose ?? meta.previousClose);
      const change = price != null && previous != null ? price - previous : null;
      return { name, symbol, price, change, changePct: change != null && previous ? change / previous * 100 : null, source: "Yahoo Finance", asOf: meta.regularMarketTime ?? null };
    } catch {
      return { name, symbol, price: null, change: null, changePct: null, source: "Yahoo Finance", asOf: null, error: "연결 대기" };
    }
  }));
  return { updatedAt: new Date().toISOString(), macro };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return options(request, env);
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (request.method === "GET" && path === "/api/data") {
        return json(request, env, await readJson(env.DASHBOARD_BUCKET, DATA_KEY, EMPTY_DASHBOARD));
      }
      if (request.method === "GET" && path === "/api/data-version") {
        return json(request, env, await readJson(env.DASHBOARD_BUCKET, VERSION_KEY, { version: 0 }));
      }
      if (request.method === "POST" && path === "/api/sync") {
        if (!env.DASHBOARD_SYNC_TOKEN || request.headers.get("x-dashboard-sync-token") !== env.DASHBOARD_SYNC_TOKEN) return json(request, env, { error: "unauthorized" }, 401);
        const length = Number(request.headers.get("content-length") ?? 0);
        if (length > MAX_BODY_BYTES) return json(request, env, { error: "payload too large" }, 413);
        const raw = await request.text();
        if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json(request, env, { error: "payload too large" }, 413);
        const payload: unknown = JSON.parse(raw);
        if (!validPayload(payload)) return json(request, env, { error: "dates and rows arrays are required" }, 400);
        const version = Date.now();
        const dashboard = { ...(payload as Record<string, unknown>), generatedAt: new Date().toISOString() };
        await env.DASHBOARD_BUCKET.put(`${DATA_KEY}.staging`, JSON.stringify(dashboard), { httpMetadata: { contentType: "application/json" } });
        await env.DASHBOARD_BUCKET.put(DATA_KEY, JSON.stringify(dashboard), { httpMetadata: { contentType: "application/json" } });
        await env.DASHBOARD_BUCKET.put(VERSION_KEY, JSON.stringify({ version }), { httpMetadata: { contentType: "application/json" } });
        return json(request, env, { ok: true, version });
      }
      if (request.method === "GET" && path === "/api/markets") return json(request, env, await marketData());
      if (request.method === "GET" && path === "/api/investor-trends") {
        const dashboard = await readJson(env.DASHBOARD_BUCKET, DATA_KEY, EMPTY_DASHBOARD);
        return json(request, env, dashboard.investorTrends || { updatedAt: null, source: "한국투자증권 Open API", rows: [], error: "다음 마감 수집 대기" });
      }
      if (request.method === "GET" && path === "/api/stock-quotes") {
        const codes = [...new Set((url.searchParams.get("codes") ?? "").split(",").map((code) => code.trim()).filter((code) => /^\d{6}$/.test(code)))];
        if (!codes.length) return json(request, env, { quotes: [] });
        if (codes.length > 100) return json(request, env, { error: "codes must contain at most 100 stock codes" }, 400);
        const quotes = await Promise.all(codes.map(async (code) => { try { return await naverQuote(code); } catch { return { code, error: "연결 대기" }; } }));
        return json(request, env, { updatedAt: new Date().toISOString(), quotes });
      }
      return json(request, env, { error: "not found" }, 404);
    } catch (error) {
      return json(request, env, { error: "upstream failure", detail: error instanceof Error ? error.message : "unknown" }, 502);
    }
  }
};
