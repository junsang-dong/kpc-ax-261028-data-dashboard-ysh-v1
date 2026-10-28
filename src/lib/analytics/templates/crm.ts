import type { ColumnSchema, Row } from "@/types/dataset";
import { daysBetween } from "@/lib/format";
import { evalMetric, type AggMetric, type RatioMetric } from "../query";
import { metricKpi, type Kpi } from "../kpi";

export const CRM = {
  stage: "deal_stage",
  value: "close_value",
  engage: "engage_date",
  close: "close_date",
  agent: "sales_agent",
  product: "product",
  account: "account",
} as const;

/** CRM Sales Opportunities(sales_pipeline) 구조인지 판별 */
export function isCrmPipeline(schema: ColumnSchema[]): boolean {
  const keys = new Set(schema.map((c) => c.key));
  return [CRM.stage, CRM.value, CRM.engage, CRM.close].every((k) => keys.has(k));
}

const stageIs = (v: string): AggMetric["where"] => [{ field: CRM.stage, operator: "eq", value: v }];

export const crmMetrics = {
  total: { id: "opp_total", agg: "count", label: "전체 영업기회" } satisfies AggMetric,
  won: { id: "opp_won", agg: "count", where: stageIs("Won"), label: "Won 건수" } satisfies AggMetric,
  lost: { id: "opp_lost", agg: "count", where: stageIs("Lost"), label: "Lost 건수" } satisfies AggMetric,
  wonRevenue: {
    id: "won_revenue",
    agg: "sum",
    field: CRM.value,
    where: stageIs("Won"),
    label: "수주금액",
  } satisfies AggMetric,
  /** Won / (Won + Lost) × 100 */
  winRate: {
    id: "win_rate",
    label: "수주 성공률",
    ratio: {
      numerator: { id: "w", agg: "count", where: stageIs("Won") },
      denominator: {
        id: "wl",
        agg: "count",
        where: [{ field: CRM.stage, operator: "in", value: ["Won", "Lost"] }],
      },
      percent: true,
    },
  } satisfies RatioMetric,
};

/** 유효한 완료 거래(Won/Lost, 두 날짜 모두 존재, 종료일 ≥ 시작일)의 영업 소요일 */
export function salesCycleDays(rows: Row[]): { avg: number | null; n: number } {
  let total = 0;
  let n = 0;
  for (const r of rows) {
    if (r[CRM.stage] !== "Won" && r[CRM.stage] !== "Lost") continue;
    const e = r[CRM.engage];
    const c = r[CRM.close];
    if (typeof e !== "string" || typeof c !== "string") continue;
    const d = daysBetween(e, c);
    if (d < 0) continue;
    total += d;
    n++;
  }
  return { avg: n ? total / n : null, n };
}

export function crmKpis(rows: Row[]): Kpi[] {
  const m = crmMetrics;
  const won = evalMetric(rows, m.won) ?? 0;
  const lost = evalMetric(rows, m.lost) ?? 0;
  const open = rows.length - won - lost;
  const revenue = evalMetric(rows, m.wonRevenue);
  const cycle = salesCycleDays(rows);
  return [
    metricKpi(rows, m.total, "전체 영업기회 수", "number", "COUNT(*)"),
    metricKpi(rows, m.won, "Won 수주 건수", "number", "COUNT(deal_stage = 'Won')", won),
    metricKpi(rows, m.lost, "Lost 실패 건수", "number", "COUNT(deal_stage = 'Lost')", lost),
    {
      id: "opp_open",
      label: "진행 중 영업기회",
      value: open,
      format: "number",
      formula: "전체 − Won − Lost (Prospecting, Engaging 등)",
      sourceRows: open,
    },
    metricKpi(rows, m.wonRevenue, "총 수주금액", "currency", "SUM(close_value WHERE deal_stage = 'Won')", won),
    metricKpi(rows, m.winRate, "수주 성공률", "percent", "Won / (Won + Lost) × 100", won + lost),
    {
      id: "avg_deal",
      label: "평균 계약금액",
      value: won ? (revenue ?? 0) / won : null,
      format: "currency",
      formula: "수주금액 / Won 건수",
      sourceRows: won,
    },
    {
      id: "avg_cycle",
      label: "평균 영업 소요일",
      value: cycle.avg,
      format: "days",
      formula: "AVG(close_date − engage_date), Won·Lost 중 두 날짜가 모두 유효한 거래",
      sourceRows: cycle.n,
      note: "종료일이 시작일보다 빠른 행은 제외",
    },
  ];
}
