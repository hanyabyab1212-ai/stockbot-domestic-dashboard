import { KisClient } from "../src/kisClient.mjs";
import { collectCloseRows, collectIntradayRows, currentKstParts, isOpenDay } from "../src/flowService.mjs";
import { loadKrxMaster } from "../src/krxMaster.mjs";
import { loadCloudState, mergeDashboard, syncCloudState, writeFallback } from "../src/cloudState.mjs";
import { isValidCloseBatch } from "../src/domain.mjs";
import { loadLocalEnv } from "../src/env.mjs";

loadLocalEnv();
const args = new Set(process.argv.slice(2));
const requestedMode = [...args].find((value) => value.startsWith("--mode="))?.slice(7) || "auto";
const force = args.has("--force");
if (!["auto", "close", "intraday"].includes(requestedMode)) throw new Error("--mode은 auto, close, intraday 중 하나여야 합니다.");

const kst = currentKstParts();
const inMarketHours = kst.minutes >= 9 * 60 && kst.minutes <= 15 * 60 + 30;
const mode = requestedMode === "auto" ? (inMarketHours ? "intraday" : "close") : requestedMode;
const log = (message) => process.stdout.write(`${new Date().toISOString()} ${message}\n`);

const kis = new KisClient({ perSecond: 8 });
if (!force && !(await isOpenDay(kis, kst.date))) { log("휴장일이므로 수집을 건너뜁니다."); process.exit(0); }
if (mode === "intraday" && !force && !inMarketHours) { log("장중 시간이 아니므로 장중 수집을 건너뜁니다."); process.exit(0); }

log("KRX/TradingView 종목 마스터를 불러옵니다.");
const [{ master, marketRanks }, previous] = await Promise.all([loadKrxMaster(), loadCloudState()]);
if (master.length < 1000) throw new Error(`종목 마스터 검증 실패: ${master.length}개`);
log(`${master.length}종목 수집을 ${mode} 모드로 시작합니다.`);
let progressAt = 0;
const onProgress = ({ completed, failed, total }) => {
  if (completed + failed - progressAt >= 100 || completed + failed === total) { progressAt = completed + failed; log(`진행 ${completed + failed}/${total} · 성공 ${completed} · 실패 ${failed}`); }
};
const result = mode === "intraday" ? await collectIntradayRows(kis, master, { date: kst.date, onProgress }) : await collectCloseRows(kis, master, { date: kst.date, onProgress });
if (mode === "close" && !isValidCloseBatch(result.rows)) throw new Error(`마감 데이터가 1,000종목 미만(${result.rows.length})이라 저장하지 않습니다.`);
if (mode === "intraday" && result.rows.length < 1000) throw new Error(`장중 데이터가 1,000종목 미만(${result.rows.length})이라 저장하지 않습니다.`);

const liveSnapshot = mode === "intraday" ? { date: kst.date, updatedAt: new Date().toISOString(), mode: "intraday-estimate", rows: result.rows } : null;
const data = mergeDashboard(previous, { closeRows: mode === "close" ? result.rows : [], liveSnapshot, marketRanks, automation: { source: "github-actions", mode: mode === "intraday" ? "intraday-estimate" : "close", updatedDate: kst.date, records: result.rows.length, failed: result.failed.length } });
const synced = await syncCloudState(data);
await writeFallback(data);
log(`동기화 완료 · version ${synced.version} · ${result.rows.length}행`);
