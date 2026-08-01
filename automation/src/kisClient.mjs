import { required } from "./env.mjs";

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_KIS_CODES = new Set(["EGW00201", "EGW00121", "EGW00123"]);
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class RateLimiter {
  constructor(perSecond = 8) { this.gap = 1000 / perSecond; this.nextAt = 0; }
  async wait() { const at = Date.now(); const scheduled = Math.max(at, this.nextAt); this.nextAt = scheduled + this.gap; if (scheduled > at) await sleep(scheduled - at); }
}

export class KisError extends Error {
  constructor(message, { status, code, retryable } = {}) { super(message); this.name = "KisError"; this.status = status; this.code = code; this.retryable = retryable; }
}

export class KisClient {
  constructor({ appKey = required("KIS_APP_KEY"), appSecret = required("KIS_APP_SECRET"), baseUrl = process.env.KIS_BASE_URL || "https://openapi.koreainvestment.com:9443", perSecond = 8 } = {}) {
    this.appKey = appKey; this.appSecret = appSecret; this.baseUrl = baseUrl.replace(/\/$/, "");
    this.rateLimiter = new RateLimiter(perSecond); this.token = null; this.tokenExpiresAt = 0; this.tokenPromise = null;
  }
  async getToken() {
    if (this.token && Date.now() < this.tokenExpiresAt - 300_000) return this.token;
    if (!this.tokenPromise) this.tokenPromise = this.issueToken().finally(() => { this.tokenPromise = null; });
    return this.tokenPromise;
  }
  async issueToken() {
    const response = await fetch(`${this.baseUrl}/oauth2/tokenP`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ grant_type: "client_credentials", appkey: this.appKey, appsecret: this.appSecret }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) throw new KisError(payload.msg1 || "KIS 토큰 발급 실패", { status: response.status, code: payload.msg_cd, retryable: RETRYABLE_STATUS.has(response.status) });
    this.token = payload.access_token;
    this.tokenExpiresAt = Date.now() + Math.max(60, Number(payload.expires_in || 86_400)) * 1000;
    return this.token;
  }
  async get(path, trId, query = {}) {
    const token = await this.getToken(); await this.rateLimiter.wait();
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(query)) if (value != null) url.searchParams.set(key, String(value));
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, appkey: this.appKey, appsecret: this.appSecret, tr_id: trId } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.rt_cd === "1") {
      const code = payload.msg_cd;
      throw new KisError(payload.msg1 || `KIS 요청 실패 (${response.status})`, { status: response.status, code, retryable: RETRYABLE_STATUS.has(response.status) || RETRYABLE_KIS_CODES.has(code) });
    }
    return payload;
  }
  async withRetry(work, attempts = 6) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try { return await work(); } catch (error) {
        lastError = error;
        if (!(error instanceof KisError) || !error.retryable || attempt === attempts - 1) throw error;
        await sleep(500 * (attempt + 1));
      }
    }
    throw lastError;
  }
  dailyInvestor(code, date) { return this.get("/uapi/domestic-stock/v1/quotations/investor-trade-by-stock-daily", "FHPTJ04160001", { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code, FID_INPUT_DATE_1: date, FID_ORG_ADJ_PRC: "0" }); }
  intradayInvestor(code) { return this.get("/uapi/domestic-stock/v1/quotations/investor-trend-estimate", "HHPTJ04160200", { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code }); }
  price(code) { return this.get("/uapi/domestic-stock/v1/quotations/inquire-price", "FHKST01010100", { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code }); }
  holiday(date) { return this.get("/uapi/domestic-stock/v1/quotations/chk-holiday", "CTCA0903R", { BASS_DT: date, CTX_AREA_FK200: "", CTX_AREA_NK200: "" }); }
}
