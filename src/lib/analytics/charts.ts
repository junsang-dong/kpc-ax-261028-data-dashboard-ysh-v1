import type { ColumnSchema, TimeGrain } from "@/types/dataset";
import type { ValueFormat } from "@/lib/format";
import { categoricalColumns, measureColumns, temporalColumns } from "./kpi";
import type { AggMetric, MetricSpec } from "./query";
import { CRM, crmMetrics, isCrmPipeline } from "./templates/crm";

export type ChartType = "line" | "bar" | "donut" | "scatter" | "heatmap";

export interface ChartSpec {
  id: string;
  type: ChartType;
  title: string;
  /** 추천 근거 */
  reason: string;
  dimension?: string;
  dimension2?: string;
  grain?: TimeGrain;
  measures: MetricSpec[];
  format: ValueFormat;
  limit?: number;
  scatter?: { x: string; y: string };
}

export interface ChartOptions {
  measureField?: string;
  agg: "sum" | "avg";
}

export function pickGrain(min: string, max: string): TimeGrain {
  const days = (Date.parse(max) - Date.parse(min)) / 86_400_000;
  if (days <= 62) return "day";
  if (days <= 365 * 4) return "month";
  if (days <= 365 * 12) return "quarter";
  return "year";
}

const grainLabel: Record<TimeGrain, string> = { day: "일별", month: "월별", quarter: "분기별", year: "연도별" };

export function recommendCharts(schema: ColumnSchema[], opts: ChartOptions): ChartSpec[] {
  if (isCrmPipeline(schema)) return crmCharts(schema);

  const measures = measureColumns(schema);
  const primary = measures.find((c) => c.key === opts.measureField) ?? measures[0];
  const aggLabel = opts.agg === "sum" ? "합계" : "평균";
  const metric = (c: ColumnSchema): AggMetric => ({
    id: `m_${c.key}`,
    agg: opts.agg,
    field: c.key,
    label: `${c.key} ${aggLabel}`,
  });
  const charts: ChartSpec[] = [];
  const time = temporalColumns(schema)[0];

  if (time && primary && time.profile.dateRange) {
    const grain = pickGrain(time.profile.dateRange.min, time.profile.dateRange.max);
    const series = [primary, ...measures.filter((c) => c !== primary)].slice(0, 3);
    // 규모 차이가 10배를 넘는 지표는 한 축에 그리지 않고 별도 차트로 분리
    const mags = series.map((c) => Math.abs(c.profile.numeric?.mean ?? 0) || 1);
    const comparable = Math.max(...mags) / Math.min(...mags) <= 10;
    if (series.length > 1 && comparable) {
      charts.push({
        id: "line_multi",
        type: "line",
        title: `${grainLabel[grain]} ${series.map((c) => c.key).join(" · ")} 추이`,
        reason: "날짜 + 복수 수치 → Multi-series Line",
        dimension: time.key,
        grain,
        measures: series.map(metric),
        format: "number",
      });
    } else {
      charts.push({
        id: `line_${primary.key}`,
        type: "line",
        title: `${grainLabel[grain]} ${primary.key} ${aggLabel} 추이`,
        reason: "날짜 + 숫자 → Line Chart",
        dimension: time.key,
        grain,
        measures: [metric(primary)],
        format: "number",
      });
    }
  }

  const cats = categoricalColumns(schema).sort(
    (a, b) => Math.abs(a.profile.uniqueCount - 8) - Math.abs(b.profile.uniqueCount - 8),
  );
  if (primary) {
    cats.slice(0, 3).forEach((c) =>
      charts.push({
        id: `bar_${c.key}`,
        type: "bar",
        title: `${c.key}별 ${primary.key} ${aggLabel}`,
        reason: "범주 + 숫자 → Bar Chart",
        dimension: c.key,
        measures: [metric(primary)],
        format: "number",
        limit: 10,
      }),
    );
  }

  const donut = cats.find((c) => c.profile.uniqueCount >= 2 && c.profile.uniqueCount <= 8);
  if (donut) {
    charts.push({
      id: `donut_${donut.key}`,
      type: "donut",
      title: `${donut.key} 구성 비중`,
      reason: "범주 수가 8개 이하 + 구성 비중 → Donut Chart",
      dimension: donut.key,
      measures: [{ id: "count", agg: "count", label: "건수" }],
      format: "number",
    });
  }

  if (measures.length >= 2) {
    charts.push({
      id: "scatter",
      type: "scatter",
      title: `${measures[0].key} × ${measures[1].key}`,
      reason: "숫자 + 숫자 → Scatter Plot",
      measures: [],
      format: "number",
      scatter: { x: measures[0].key, y: measures[1].key },
    });
  }

  const heat = cats.filter((c) => c.profile.uniqueCount <= 12);
  if (heat.length >= 2) {
    charts.push({
      id: "heatmap",
      type: "heatmap",
      title: `${heat[0].key} × ${heat[1].key} 건수`,
      reason: "두 범주 + 집계값 → Heatmap",
      dimension: heat[0].key,
      dimension2: heat[1].key,
      measures: [{ id: "count", agg: "count", label: "건수" }],
      format: "number",
    });
  }
  return charts;
}

function crmCharts(schema: ColumnSchema[]): ChartSpec[] {
  const has = (k: string) => schema.some((c) => c.key === k);
  const m = crmMetrics;
  const charts: ChartSpec[] = [
    {
      id: "crm_revenue_trend",
      type: "line",
      title: "월별 수주금액 (종료일 기준)",
      reason: "날짜 + 숫자 → Line Chart · CRM 템플릿",
      dimension: CRM.close,
      grain: "month",
      measures: [m.wonRevenue],
      format: "currency",
    },
    {
      id: "crm_stage",
      type: "donut",
      title: "거래 단계 구성",
      reason: "범주 4개 + 구성 비중 → Donut Chart · CRM 템플릿",
      dimension: CRM.stage,
      measures: [{ id: "count", agg: "count", label: "건수" }],
      format: "number",
    },
  ];
  if (has(CRM.product)) {
    charts.push(
      {
        id: "crm_product_revenue",
        type: "bar",
        title: "제품별 수주금액",
        reason: "범주 + 숫자 → Bar Chart · CRM 템플릿",
        dimension: CRM.product,
        measures: [m.wonRevenue],
        format: "currency",
        limit: 10,
      },
      {
        id: "crm_product_winrate",
        type: "bar",
        title: "제품별 수주 성공률",
        reason: "범주 + 비율 → Bar Chart · Won/(Won+Lost)",
        dimension: CRM.product,
        measures: [m.winRate],
        format: "percent",
        limit: 10,
      },
    );
  }
  if (has(CRM.agent)) {
    charts.push({
      id: "crm_agent_revenue",
      type: "bar",
      title: "영업 담당자별 수주금액 Top 10",
      reason: "범주 + 숫자 → Bar Chart · 상위 N",
      dimension: CRM.agent,
      measures: [m.wonRevenue],
      format: "currency",
      limit: 10,
    });
  }
  if (has(CRM.account)) {
    charts.push({
      id: "crm_account_revenue",
      type: "bar",
      title: "고객사별 수주금액 Top 10",
      reason: "범주 + 숫자 → Bar Chart · 상위 N",
      dimension: CRM.account,
      measures: [m.wonRevenue],
      format: "currency",
      limit: 10,
    });
  }
  if (has(CRM.product)) {
    charts.push({
      id: "crm_product_stage",
      type: "heatmap",
      title: "제품 × 거래 단계 건수",
      reason: "두 범주 + 집계값 → Heatmap",
      dimension: CRM.product,
      dimension2: CRM.stage,
      measures: [{ id: "count", agg: "count", label: "건수" }],
      format: "number",
    });
  }
  return charts;
}
