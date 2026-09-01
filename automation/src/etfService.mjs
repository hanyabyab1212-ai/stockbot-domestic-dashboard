import { inflateRawSync } from "node:zlib";

const MASTER_URL = "https://new.real.download.dws.co.kr/common/master/kospi_code.mst.zip";
const TAIL_BYTES = 227;
const FIELD_WIDTHS = [2, 1, 4, 4, 4, ...Array(26).fill(1), 9, 5, 5, 1, 1, 1, 2, 1, 1, 1, 2, 2, 2, 3, 1, 3, 12, 12, 8, 15, 21, 2, 7, 1, 1, 1, 1, 1, 9, 9, 9, 5, 9, 8, 9, 3, 1, 1, 1];
const FIELD_OFFSET = (index) => FIELD_WIDTHS.slice(0, index).reduce((sum, width) => sum + width, 0);
const REFERENCE_PRICE = 31;
const LISTED_SHARES = 50;
const decoder = new TextDecoder("euc-kr");

const number = (value) => {
  const parsed = Number(String(value ?? "").replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const readAsciiField = (tail, index) => tail.subarray(FIELD_OFFSET(index), FIELD_OFFSET(index) + FIELD_WIDTHS[index]).toString("ascii").trim();

function zipEntry(bytes) {
  const zip = Buffer.from(bytes);
  const minimum = Math.max(0, zip.length - 65_557);
  let end = -1;
  for (let index = zip.length - 22; index >= minimum; index -= 1) if (zip.readUInt32LE(index) === 0x06054b50) { end = index; break; }
  if (end < 0) throw new Error("KIS ETF 마스터 ZIP 종료 정보를 찾지 못했습니다.");
  const central = zip.readUInt32LE(end + 16);
  if (zip.readUInt32LE(central) !== 0x02014b50) throw new Error("KIS ETF 마스터 ZIP 중앙 목록이 올바르지 않습니다.");
  const method = zip.readUInt16LE(central + 10);
  const compressedSize = zip.readUInt32LE(central + 20);
  const local = zip.readUInt32LE(central + 42);
  if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error("KIS ETF 마스터 ZIP 항목이 올바르지 않습니다.");
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const compressed = zip.subarray(start, start + compressedSize);
  if (method === 0) return compressed;
  if (method === 8) return inflateRawSync(compressed);
  throw new Error(`지원하지 않는 KIS ETF 마스터 압축 방식(${method})입니다.`);
}

export function parseKisEtfMaster(bytes) {
  const rows = new Map();
  for (const raw of Buffer.from(bytes).toString("binary").split("\n")) {
    let line = Buffer.from(raw, "binary");
    if (line.at(-1) === 13) line = line.subarray(0, -1);
    if (line.length <= 21 + TAIL_BYTES) continue;
    const tail = line.subarray(-TAIL_BYTES);
    if (readAsciiField(tail, 0) !== "EF") continue;
    const code = line.subarray(0, 9).toString("ascii").trim().match(/\d{6}$/)?.[0];
    const name = decoder.decode(line.subarray(21, line.length - TAIL_BYTES)).trim();
    const listedSharesInThousands = number(readAsciiField(tail, LISTED_SHARES));
    const referencePrice = number(readAsciiField(tail, REFERENCE_PRICE));
    if (!code || !name || !listedSharesInThousands) continue;
    rows.set(code, { code, name, listedShares: listedSharesInThousands * 1_000, referencePrice });
  }
  return [...rows.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export async function loadKisEtfMaster(fetchImpl = fetch) {
  const response = await fetchImpl(MASTER_URL, { headers: { "user-agent": "stockbot-domestic-dashboard/1.0", accept: "application/zip" } });
  if (!response.ok) throw new Error(`KIS ETF 종목 마스터 조회 실패: ${response.status}`);
  const master = parseKisEtfMaster(zipEntry(await response.arrayBuffer()));
  if (master.length < 100) throw new Error(`KIS ETF 종목 마스터 검증 실패: ${master.length}개`);
  return master;
}

const value = (object, ...keys) => keys.map((key) => object?.[key]).find((item) => item != null && item !== "") ?? null;

export function etfRow(payload, etf, date) {
  const output = Array.isArray(payload?.output) ? payload.output[0] : (payload?.output || payload || {});
  const closePrice = number(value(output, "stck_prpr", "stck_clpr", "close_price", "price")) ?? etf.referencePrice;
  if (!closePrice) throw new Error("ETF 종가가 없습니다.");
  const nav = number(value(output, "nav", "nav_prpr", "etf_nav"));
  return [date, etf.code, etf.name, "", etf.listedShares, closePrice, (nav ?? closePrice) * etf.listedShares];
}

async function pool(items, concurrency, worker) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) await worker(items[index++]);
  }));
}

export async function collectEtfRows(kis, date, { fetchImpl = fetch, concurrency = 8, onProgress = () => {} } = {}) {
  const master = await loadKisEtfMaster(fetchImpl);
  const completed = [], failed = [];
  await pool(master, concurrency, async (etf) => {
    try {
      const payload = await kis.withRetry(() => kis.etfPrice(etf.code), 3);
      completed.push(etfRow(payload, etf, date));
    } catch (error) {
      // KIS 시세가 일시적으로 지연돼도, 당일 마스터 기준가로 기준값을 보존한다.
      if (etf.referencePrice) completed.push(etfRow(null, etf, date));
      else failed.push({ code: etf.code, message: error.message });
    } finally {
      onProgress({ completed: completed.length, failed: failed.length, total: master.length });
    }
  });
  return { rows: completed, failed, total: master.length };
}
