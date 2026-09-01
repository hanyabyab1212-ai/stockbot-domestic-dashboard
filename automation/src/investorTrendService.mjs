const MARKETS = [
  { market: "코스피", marketCode: "KSP", industryCode: "0001" },
  { market: "코스닥", marketCode: "KSQ", industryCode: "1001" }
];

function numberOf(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replaceAll(",", "").replaceAll("+", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function recordsOf(payload) {
  const output = payload?.output ?? payload?.output1 ?? [];
  return Array.isArray(output) ? output : output && typeof output === "object" ? [output] : [];
}

export function marketInvestorTrend(payload, { market, date }) {
  const records = recordsOf(payload);
  const record = records.find((item) => String(item.stck_bsop_date || "") === date) || records[0];
  if (!record) return null;
  const personal = numberOf(record.prsn_ntby_tr_pbmn);
  const foreign = numberOf(record.frgn_ntby_tr_pbmn);
  const institution = numberOf(record.orgn_ntby_tr_pbmn);
  if ([personal, foreign, institution].every((value) => value == null)) return null;
  return { market, personal, foreign, institution };
}

export async function collectInvestorTrends(kis, date) {
  const rows = (await Promise.all(MARKETS.map(async (config) => {
    const payload = await kis.withRetry(() => kis.marketInvestorDaily(config.marketCode, config.industryCode, date), 3);
    return marketInvestorTrend(payload, { market: config.market, date });
  }))).filter(Boolean);
  if (!rows.length) throw new Error("시장별 투자자 매매동향이 비어 있습니다.");
  return { updatedAt: new Date().toISOString(), asOf: date, source: "한국투자증권 Open API", rows };
}
