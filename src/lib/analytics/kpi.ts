import type { ColumnSchema, Row } from "@/types/dataset";
import type { ValueFormat } from "@/lib/format";
import { evalMetric, type MetricSpec } from "./query";

export interface Kpi {
  id: string;
  label: string;
  value: number | null;
  format: ValueFormat;
  /** 계산식 설명 — 모든 KPI는 산식과 근거 행 수를 가진다 */
  formula: string;
  sourceRows: number;
  note?: string;
}

export function metricKpi(
  rows: Row[],
  spec: MetricSpec,
  label: string,
  format: ValueFormat,
  formula: string,
  sourceRows = rows.length,
  note?: string,
): Kpi {
  return { id: spec.id, label, value: evalMetric(rows, spec), format, formula, sourceRows, note };
}

export function measureColumns(schema: ColumnSchema[]): ColumnSchema[] {
  return schema.filter(
    (c) =>
      c.semanticType === "numeric" &&
      c.profile.nullRatio < 0.6 &&
      c.profile.uniqueCount > 1,
  );
}

export function categoricalColumns(schema: ColumnSchema[], min = 2, max = 50): ColumnSchema[] {
  return schema.filter(
    (c) =>
      c.semanticType === "categorical" &&
      c.profile.nullRatio < 0.6 &&
      c.profile.uniqueCount >= min &&
      c.profile.uniqueCount <= max,
  );
}

export function temporalColumns(schema: ColumnSchema[]): ColumnSchema[] {
  return schema.filter((c) => c.semanticType === "temporal" && c.profile.nullRatio < 0.6 && !!c.profile.dateRange?.min);
}

/** 컬럼 의미 유형만으로 만드는 범용 KPI (특정 산업 컬럼명에 종속되지 않음) */
export function genericKpis(schema: ColumnSchema[], rows: Row[]): Kpi[] {
  const kpis: Kpi[] = [
    metricKpi(rows, { id: "row_count", agg: "count" }, "전체 행 수", "number", "COUNT(*)"),
  ];
  const measures = measureColumns(schema).slice(0, 3);
  measures.forEach((c, i) => {
    kpis.push(
      metricKpi(rows, { id: `sum_${c.key}`, agg: "sum", field: c.key }, `${c.key} 합계`, "number", `SUM(${c.key})`, rows.filter((r) => r[c.key] !== null).length),
    );
    if (i === 0) {
      kpis.push(
        metricKpi(rows, { id: `avg_${c.key}`, agg: "avg", field: c.key }, `${c.key} 평균`, "number", `AVG(${c.key})`, rows.filter((r) => r[c.key] !== null).length),
      );
    }
  });
  const cat = categoricalColumns(schema)[0];
  if (cat) {
    kpis.push(
      metricKpi(rows, { id: `distinct_${cat.key}`, agg: "distinct", field: cat.key }, `${cat.key} 종류 수`, "number", `COUNT(DISTINCT ${cat.key})`),
    );
  }
  return kpis;
}
