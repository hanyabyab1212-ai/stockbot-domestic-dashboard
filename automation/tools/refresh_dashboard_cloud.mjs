import { KisClient } from "../src/kisClient.mjs";
import { collectCloseRows, collectIntradayRows, currentKstParts, isOpenDay } from "../src/flowService.mjs";
import { loadKrxMaster } from "../src/krxMaster.mjs";
import { loadCloudState, mergeDashboard, syncCloudState, writeFallback } from "../src/cloudState.mjs";
import { isValidCloseBatch } from "../src/domain.mjs";
import { loadLocalEnv } from "../src/env.mjs";
import { collectMacroSnapshot } from "../src/macroService.mjs";

loadLocalEnv();
const args = new Set(process.argv.slice(2));
const requestedMode = [...args].find((value) => value.startsWith("--mode="))?.slice(7) || "auto";
const force = args.has("--force");
if (!["auto", "close", "intraday"].includes(requestedMode)) throw new Error("--mode은 auto, close, intraday 중 하나여야 합니다.");

const kst = currentKstParts();
const inMarketHours = kst.minutes >= 9 * 60 && kst.minutes <= 15 * 60 + 30;
const mode = requestedMode === "auto" ? (inMarketHours ? "intraday" : "close") : requestedMode;
const log = (message) => process.stdout.write(`${new Date().toISOString()} ${message}\n`);
const previousDate = (compactDate) => {
  const date = new Date(`${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10).replaceAll("-", "");
};

async function previousOpenDate(client, date) {
  let candidate = previousDate(date);
  for (let offset = 1; offset <= 10; offset += 1) {
    if (await isOpenDay(client, candidate)) return candidate;
    candidate = previousDate(candidate);
  }
  throw new Error("최근 10일 안에서 거래일을 찾지 못했습니다.");
}

const kis = new KisClient({ perSecond: 8 });
// Fail immediately with KIS's safe error message when the app key/secret is invalid.
await kis.getToken();
const isTodayOpen = await isOpenDay(kis, kst.date);
if (!force && !isTodayOpen) { log("휴장일이므로 수집을 건너뜁니다."); process.exit(0); }
if (mode === "intraday" && !force && !inMarketHours) { log("장중 시간이 아니므로 장중 수집을 건너뜁니다."); process.exit(0); }
const collectionDate = mode === "close" && !isTodayOpen ? await previousOpenDate(kis, kst.date) : kst.date;
if (collectionDate !== kst.date) log(`휴장일 강제 수집: 최근 거래일 ${collectionDate} 데이터를 사용합니다.`);

log("KRX/TradingView 종목 마스터를 불러옵니다.");
const [{ master, marketRanks }, previous] = await Promise.all([loadKrxMaster(), loadCloudState()]);
if (master.length < 1000) throw new Error(`종목 마스터 검증 실패: ${master.length}개`);
log(`${master.length}종목 수집을 ${mode} 모드로 시작합니다.`);
let progressAt = 0;
const onProgress = ({ completed, failed, total }) => {
  if (completed + failed - progressAt >= 100 || completed + failed === total) { progressAt = completed + failed; log(`진행 ${completed + failed}/${total} · 성공 ${completed} · 실패 ${failed}`); }
};
const result = mode === "intraday" ? await collectIntradayRows(kis, master, { date: collectionDate, onProgress }) : await collectCloseRows(kis, master, { date: collectionDate, onProgress });
if (result.failed.length) log(`수집 실패 ${result.failed.length}건 · 첫 원인: ${result.failed[0].message}`);
if (mode === "close" && !isValidCloseBatch(result.rows)) throw new Error(`마감 데이터가 1,000종목 미만(${result.rows.length})이라 저장하지 않습니다.`);
if (mode === "intraday" && result.rows.length < 1000) throw new Error(`장중 데이터가 1,000종목 미만(${result.rows.length})이라 저장하지 않습니다.`);

const liveSnapshot = mode === "intraday" ? { date: collectionDate, updatedAt: new Date().toISOString(), mode: "intraday-estimate", rows: result.rows } : null;
log("무료 거시지표를 갱신합니다.");
const macro = await collectMacroSnapshot({ bokApiKey: process.env.BOK_ECOS_API_KEY, eiaApiKey: process.env.EIA_API_KEY, previous: previous.macro });
const data = mergeDashboard(previous, { closeRows: mode === "close" ? result.rows : [], liveSnapshot, marketRanks, macro, automation: { source: "github-actions", mode: mode === "intraday" ? "intraday-estimate" : "close", updatedDate: collectionDate, records: result.rows.length, failed: result.failed.length } });
const synced = await syncCloudState(data);
await writeFallback(data);
log(`동기화 완료 · version ${synced.version} · ${result.rows.length}행`);
