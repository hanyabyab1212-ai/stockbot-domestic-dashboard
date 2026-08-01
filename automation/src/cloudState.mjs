import { writeFile } from "node:fs/promises";
import { COLUMNS, mergeEtfRows, mergeRows, validateDashboard } from "./domain.mjs";
import { required } from "./env.mjs";

const apiBase = () => required("DASHBOARD_API_URL").replace(/\/$/, "");
export async function loadCloudState() {
  const response = await fetch(`${apiBase()}/api/data`, { cache: "no-store" });
  if (!response.ok) throw new Error(`기존 대시보드 데이터 조회 실패: ${response.status}`);
  return response.json();
}
export function mergeDashboard(previous, { closeRows = [], liveSnapshot = null, etfRows = [], marketRanks = {}, automation = {} }) {
  const next = { ...previous, columns: previous.columns?.length ? previous.columns : COLUMNS, rows: mergeRows(previous.rows || [], closeRows), etfRows: mergeEtfRows(previous.etfRows || [], etfRows), marketRanks: Object.keys(marketRanks).length ? marketRanks : previous.marketRanks || {}, liveSnapshot, automation: { ...previous.automation, ...automation } };
  next.dates = [...new Set(next.rows.map((row) => row[0]))].sort();
  if (next.liveSnapshot?.date) next.dates = [...new Set([...next.dates, next.liveSnapshot.date])].sort();
  validateDashboard(next); return next;
}
export async function syncCloudState(data) {
  validateDashboard(data);
  const response = await fetch(`${apiBase()}/api/sync`, { method: "POST", headers: { "content-type": "application/json", "x-dashboard-sync-token": required("DASHBOARD_SYNC_TOKEN") }, body: JSON.stringify(data) });
  if (!response.ok) throw new Error(`대시보드 동기화 실패: ${response.status} ${await response.text()}`);
  return response.json();
}
export async function writeFallback(data, filename = "dashboard/data.js") {
  await writeFile(filename, `// 자동 수집기가 마지막 정상 API 응답으로 갱신했습니다.\nwindow.STOCKBOT_API_URL = ${JSON.stringify(apiBase())};\nwindow.FLOW_DASHBOARD_DATA = ${JSON.stringify(data)};\n`);
}
