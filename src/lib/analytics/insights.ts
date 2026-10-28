import type { Dataset, Filter, Row } from "@/types/dataset";
import { formatValue } from "@/lib/format";
import { categoricalColumns, measureColumns, temporalColumns } from "./kpi";
import { runQuery, type AggMetric, type RatioMetric } from "./query";
import { pickGrain } from "./charts";
import { pearson, quantile } from "./stats";
import { CRM, crmMetrics, isCrmPipeline } from "./templates/crm";

export interface InsightSettings {
  concentrationShare: number;
  periodChange: number;
  missingRatio: number;
  duplicateRatio: number;
  outlierRatio: number;
  correlation: number;
  winRateGapPt: number;
  minGroupSize: number;
}

export const DEFAULT_INSIGHT_SETTINGS: InsightSettings = {
  concentrationShare: 0.4,
  periodChange: 0.2,
  missingRatio: 0.2,
  duplicateRatio: 0.01,
  outlierRatio: 0.01,
  correlation: 0.7,
  winRateGapPt: 10,
  minGroupSize: 30,
};

export type InsightCategory = "concentration" | "trend" | "quality" | "performance" | "outlier" | "correlation";

export interface Evidence {
  metricId: string;
  label: string;
  value: string;
  dimension?: string;
}

export interface Insight {
  id: string;
  title: string;
  category: InsightCategory;
  severity: "low" | "medium" | "high";
  summary: string;
  evidence: Evidence[];
  recommendation: string;
  limitations: string[];
  /** 계산식, 분석 기간, 적용 필터 */
  basis: { formula: string; period: string; filters: string[]; sourceRows: number };
}

export interface InsightContext {
  dataset: Dataset;
  /** 필터가 적용된 행 */
  rows: Row[];
  filters: Filter[];
  settings: InsightSettings;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** 기간 버킷(YYYY-MM 등)의 마지막 날짜 */
function bucketEnd(bucket: string, grain: "day" | "month" | "quarter" | "year"): string {
  if (grain === "day") return bucket;
  if (grain === "year") return `${bucket}-12-31`;
  const [y, rest] = bucket.split("-");
  const lastMonth = grain === "quarter" ? +rest.slice(1) * 3 : +rest;
  const day = new Date(Date.UTC(+y, lastMonth, 0)).getUTCDate();
  return `${y}-${String(lastMonth).padStart(2, "0")}-${day}`;
}

function describeFilter(f: Filter): string {
  const v = Array.isArray(f.value) ? f.value.join(" ~ ") : String(f.value);
  return `${f.field} ${f.operator} ${v}`;
}

export function generateInsights(ctx: InsightContext): Insight[] {
  const { dataset, rows, filters, settings } = ctx;
  const schema = dataset.schemaDefinition;
  const crm = isCrmPipeline(schema);
  const out: Insight[] = [];
  const filterDesc = filters.map(describeFilter);
  const time = (crm && schema.find((c) => c.key === CRM.close)) || temporalColumns(schema)[0];
  const period = time?.profile.dateRange
    ? `${time.key}: ${time.profile.dateRange.min} ~ ${time.profile.dateRange.max}`
    : "전체 데이터";
  const basis = (formula: string) => ({ formula, period, filters: filterDesc, sourceRows: rows.length });

  const primary: AggMetric | undefined = crm
    ? crmMetrics.wonRevenue
    : (() => {
        const c = measureColumns(schema)[0];
        return c ? { id: `sum_${c.key}`, agg: "sum" as const, field: c.key, label: `${c.key} 합계` } : undefined;
      })();
  const primaryLabel = primary?.label ?? "";
  const primaryFmt = crm ? "currency" : "number";

  // 1. 집중도
  if (primary && rows.length) {
    const fixedByMetric = new Set((primary.where ?? []).map((f) => f.field));
    for (const dim of categoricalColumns(schema, 3, 50).filter((c) => !fixedByMetric.has(c.key)).slice(0, 3)) {
      const { rows: res } = runQuery(rows, schema, { metrics: [primary], dimensions: [dim.key], limit: 200 });
      const vals = res.map((r) => (r[primary.id] as number | null) ?? 0);
      if (vals.some((v) => v < 0)) continue;
      const total = vals.reduce((a, b) => a + b, 0);
      if (!total) continue;
      const top = res[0];
      const share = ((top[primary.id] as number) ?? 0) / total;
      if (share < settings.concentrationShare) continue;
      out.push({
        id: `concentration_${dim.key}`,
        title: `${dim.key} 기준 ${primaryLabel} 집중`,
        category: "concentration",
        severity: share >= 0.6 ? "high" : "medium",
        summary: `'${top[dim.key]}'이(가) ${primaryLabel}의 ${pct(share)}를 차지합니다.`,
        evidence: [
          { metricId: primary.id, label: `${top[dim.key]}`, value: formatValue(top[primary.id] as number, primaryFmt, true), dimension: dim.key },
          { metricId: primary.id, label: "전체", value: formatValue(total, primaryFmt, true) },
        ],
        recommendation: "상위 항목 의존도를 점검하고 나머지 항목의 성장 여력을 확인하세요.",
        limitations: ["비중이 높다는 사실만으로 위험 여부를 판단할 수는 없습니다.", `임계값 ${pct(settings.concentrationShare)} 기준`],
        basis: basis(`SHARE = top1(${primaryLabel} by ${dim.key}) / SUM(${primaryLabel})`),
      });
    }
  }

  // 2. 기간 대비 변화
  if (primary && time?.profile.dateRange) {
    const grain = pickGrain(time.profile.dateRange.min, time.profile.dateRange.max);
    const { rows: series } = runQuery(rows, schema, { metrics: [primary], dimensions: [time.key], timeGrain: grain });
    let pts = series.filter((r) => r[time.key] !== null);
    // 데이터 마지막 날짜가 기간 끝에 못 미치면 마지막 기간은 부분 기간이므로 비교에서 제외
    const lastDate = time.profile.dateRange.max;
    const partial = pts.length > 0 && bucketEnd(String(pts[pts.length - 1][time.key]), grain) > lastDate;
    if (partial) pts = pts.slice(0, -1);
    if (pts.length >= 3) {
      const last = pts[pts.length - 1];
      const prev = pts[pts.length - 2];
      const a = (last[primary.id] as number) ?? 0;
      const b = (prev[primary.id] as number) ?? 0;
      if (b > 0) {
        const change = (a - b) / b;
        if (Math.abs(change) >= settings.periodChange) {
          out.push({
            id: `trend_${time.key}`,
            title: `직전 기간 대비 ${primaryLabel} ${change > 0 ? "증가" : "감소"}`,
            category: "trend",
            severity: change < 0 ? "medium" : "low",
            summary: `${last[time.key]}의 ${primaryLabel}은(는) ${prev[time.key]} 대비 ${change > 0 ? "+" : ""}${(change * 100).toFixed(1)}% 변했습니다.`,
            evidence: [
              { metricId: primary.id, label: String(last[time.key]), value: formatValue(a, primaryFmt, true), dimension: time.key },
              { metricId: primary.id, label: String(prev[time.key]), value: formatValue(b, primaryFmt, true), dimension: time.key },
            ],
            recommendation: "변화 시점의 주요 항목(제품·담당자 등)을 분해해 원인 후보를 조사하세요.",
            limitations: [
              partial ? `데이터가 ${lastDate}까지여서 마지막 부분 기간은 비교에서 제외했습니다.` : "마지막 기간이 부분 기간(진행 중)일 수 있습니다.",
              "관찰된 변화이며 원인을 단정하지 않습니다.",
            ],
            basis: basis(`(${last[time.key]} − ${prev[time.key]}) / ${prev[time.key]}`),
          });
        }
      }
    }
  }

  // 3. 데이터 품질
  const missing = schema.filter((c) => c.profile.nullRatio >= settings.missingRatio);
  if (missing.length) {
    out.push({
      id: "quality_missing",
      title: "결측률이 높은 컬럼",
      category: "quality",
      severity: missing.some((c) => c.profile.nullRatio >= 0.5) ? "high" : "medium",
      summary: `${missing.length}개 컬럼의 결측률이 ${pct(settings.missingRatio)} 이상입니다.`,
      evidence: missing.slice(0, 5).map((c) => ({
        metricId: `null_ratio_${c.key}`,
        label: c.key,
        value: pct(c.profile.nullRatio),
        dimension: c.key,
      })),
      recommendation: "결측이 정상(예: 미완료 거래)인지 수집 오류인지 확인한 뒤 분석에 사용하세요.",
      limitations: ["결측률은 필터와 무관하게 전체 데이터 기준입니다."],
      basis: { formula: "NULL 개수 / 전체 행 수", period: "전체 데이터", filters: [], sourceRows: dataset.rowCount },
    });
  }
  if (dataset.dataQuality.duplicateRatio >= settings.duplicateRatio) {
    out.push({
      id: "quality_duplicates",
      title: "중복 행 감지",
      category: "quality",
      severity: "medium",
      summary: `중복 행이 ${dataset.dataQuality.duplicateRowCount.toLocaleString()}건(${pct(dataset.dataQuality.duplicateRatio)}) 있습니다.`,
      evidence: [{ metricId: "duplicate_rows", label: "중복 행", value: String(dataset.dataQuality.duplicateRowCount) }],
      recommendation: "중복이 의도된 값인지 확인하고 필요하면 원본에서 제거하세요.",
      limitations: ["모든 컬럼 값이 동일한 행만 중복으로 계산합니다."],
      basis: { formula: "원본 값이 모두 같은 행 수 − 고유 행 수", period: "전체 데이터", filters: [], sourceRows: dataset.rowCount },
    });
  }

  // 4. 성과 격차 (CRM 수주율)
  if (crm) {
    const overall = runQuery(rows, schema, { metrics: [crmMetrics.winRate] }).rows[0]?.win_rate as number | null;
    const decided: AggMetric = { id: "decided", agg: "count", where: [{ field: CRM.stage, operator: "in", value: ["Won", "Lost"] }] };
    const winRate: RatioMetric = crmMetrics.winRate;
    if (overall !== null && overall !== undefined) {
      for (const dim of [CRM.product, CRM.agent].filter((d) => schema.some((c) => c.key === d))) {
        const { rows: res } = runQuery(rows, schema, { metrics: [winRate, decided], dimensions: [dim], limit: 500 });
        const eligible = res.filter((r) => ((r.decided as number) ?? 0) >= settings.minGroupSize && r.win_rate !== null);
        const worst = [...eligible].sort((x, y) => (x.win_rate as number) - (y.win_rate as number))[0];
        if (worst && overall - (worst.win_rate as number) >= settings.winRateGapPt) {
          out.push({
            id: `performance_${dim}`,
            title: `${dim}별 수주 성공률 격차`,
            category: "performance",
            severity: overall - (worst.win_rate as number) >= settings.winRateGapPt * 2 ? "high" : "medium",
            summary: `'${worst[dim]}'의 수주 성공률은 ${formatValue(worst.win_rate as number, "percent")}로 전체 평균 ${formatValue(overall, "percent")}보다 낮습니다.`,
            evidence: [
              { metricId: "win_rate", label: String(worst[dim]), value: formatValue(worst.win_rate as number, "percent"), dimension: dim },
              { metricId: "win_rate", label: "전체", value: formatValue(overall, "percent") },
              { metricId: "decided", label: `${worst[dim]} 완료 거래 수`, value: String(worst.decided) },
            ],
            recommendation: "해당 그룹의 Lost 거래를 단계·고객사별로 세부 분석하세요.",
            limitations: ["수주율 차이의 원인은 확인되지 않았습니다.", `완료 거래 ${settings.minGroupSize}건 이상인 그룹만 비교했습니다.`],
            basis: basis("Won / (Won + Lost) × 100"),
          });
        }
      }
    }
  }

  // 5. 이상치 (IQR)
  const outlierCols = measureColumns(schema)
    .map((c) => {
      const vals = rows.map((r) => r[c.key]).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
      if (vals.length < 30) return null;
      const q1 = quantile(vals, 0.25);
      const q3 = quantile(vals, 0.75);
      const iqr = q3 - q1;
      if (!iqr) return null;
      const lo = q1 - 1.5 * iqr;
      const hi = q3 + 1.5 * iqr;
      const count = vals.filter((v) => v < lo || v > hi).length;
      return { c, count, ratio: count / vals.length, lo, hi };
    })
    // 10%를 넘으면 이상치가 아니라 0값 군집 등 분포 자체의 특성이므로 제외
    .filter((x): x is NonNullable<typeof x> => !!x && x.ratio >= settings.outlierRatio && x.ratio <= 0.1)
    .slice(0, 2);
  for (const o of outlierCols) {
    out.push({
      id: `outlier_${o.c.key}`,
      title: `${o.c.key} 이상치 후보`,
      category: "outlier",
      severity: "low",
      summary: `${o.c.key}의 ${o.count.toLocaleString()}건(${pct(o.ratio)})이 IQR 기준 범위를 벗어납니다.`,
      evidence: [
        { metricId: `outlier_${o.c.key}`, label: "정상 범위", value: `${formatValue(o.lo, "number", true)} ~ ${formatValue(o.hi, "number", true)}`, dimension: o.c.key },
        { metricId: `outlier_${o.c.key}`, label: "범위 밖 건수", value: String(o.count) },
      ],
      recommendation: "입력 오류인지 실제 특이 거래인지 원본 행을 확인하세요.",
      limitations: ["IQR 기준은 분포가 한쪽으로 치우친 데이터에서 과다 검출될 수 있습니다."],
      basis: basis("범위 = [Q1 − 1.5×IQR, Q3 + 1.5×IQR]"),
    });
  }

  // 6. 상관
  const nums = measureColumns(schema).slice(0, 5);
  const pairs: { a: string; b: string; r: number; n: number }[] = [];
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const r of rows) {
        const x = r[nums[i].key];
        const y = r[nums[j].key];
        if (typeof x === "number" && typeof y === "number") {
          xs.push(x);
          ys.push(y);
        }
      }
      if (xs.length >= 30) pairs.push({ a: nums[i].key, b: nums[j].key, r: pearson(xs, ys), n: xs.length });
    }
  }
  const strong = pairs.filter((p) => Math.abs(p.r) >= settings.correlation).sort((x, y) => Math.abs(y.r) - Math.abs(x.r))[0];
  if (strong) {
    out.push({
      id: `correlation_${strong.a}_${strong.b}`,
      title: `${strong.a}와 ${strong.b}의 강한 상관`,
      category: "correlation",
      severity: "low",
      summary: `두 지표의 피어슨 상관계수는 ${strong.r.toFixed(2)}입니다.`,
      evidence: [{ metricId: "pearson_r", label: `${strong.a} × ${strong.b}`, value: strong.r.toFixed(3) }],
      recommendation: "산점도로 분포를 확인하고, 제3의 변수가 영향을 주는지 검토하세요.",
      limitations: ["상관관계는 인과관계를 의미하지 않습니다.", `${strong.n.toLocaleString()}개 행의 쌍만 사용했습니다.`],
      basis: basis("Pearson r"),
    });
  }

  const rank = { high: 0, medium: 1, low: 2 } as const;
  return out.sort((x, y) => rank[x.severity] - rank[y.severity]);
}
