import type {
  Aggregation,
  Cell,
  ColumnSchema,
  Filter,
  Row,
  TimeGrain,
} from "@/types/dataset";
import { median } from "./stats";

export interface AggMetric {
  id: string;
  label?: string;
  agg: Aggregation;
  field?: string;
  /** 조건부 집계 (예: deal_stage = 'Won') */
  where?: Filter[];
}

export interface RatioMetric {
  id: string;
  label?: string;
  ratio: { numerator: AggMetric; denominator: AggMetric; percent?: boolean };
}

export type MetricSpec = AggMetric | RatioMetric;

export interface QuerySpec {
  metrics: MetricSpec[];
  dimensions?: string[];
  filters?: Filter[];
  timeGrain?: TimeGrain;
  limit?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export type ResultRow = Record<string, Cell>;

export interface QueryResult {
  rows: ResultRow[];
  /** 필터 적용 후 집계에 사용된 원본 행 수 */
  sourceRowCount: number;
}

export function bucketDate(iso: string, grain: TimeGrain): string {
  switch (grain) {
    case "day":
      return iso;
    case "month":
      return iso.slice(0, 7);
    case "quarter":
      return `${iso.slice(0, 4)}-Q${Math.floor((+iso.slice(5, 7) - 1) / 3) + 1}`;
    case "year":
      return iso.slice(0, 4);
  }
}

export function matchesFilter(row: Row, f: Filter): boolean {
  const v = row[f.field];
  switch (f.operator) {
    case "eq":
      return v === f.value;
    case "in":
      return Array.isArray(f.value) && f.value.includes(v);
    case "between": {
      if (v === null || !Array.isArray(f.value)) return false;
      const [lo, hi] = f.value;
      return (lo === null || v >= lo) && (hi === null || v <= hi);
    }
    case "gte":
      return v !== null && f.value !== null && !Array.isArray(f.value) && v >= f.value;
    case "lte":
      return v !== null && f.value !== null && !Array.isArray(f.value) && v <= f.value;
    case "contains":
      return v !== null && String(v).toLowerCase().includes(String(f.value).toLowerCase());
  }
}

export function applyFilters(rows: Row[], filters: Filter[] = []): Row[] {
  if (!filters.length) return rows;
  return rows.filter((r) => filters.every((f) => matchesFilter(r, f)));
}

function aggregate(rows: Row[], m: AggMetric): number | null {
  const scoped = m.where ? applyFilters(rows, m.where) : rows;
  if (m.agg === "count") {
    if (!m.field) return scoped.length;
    return scoped.filter((r) => r[m.field!] !== null).length;
  }
  const field = m.field!;
  if (m.agg === "distinct") return new Set(scoped.map((r) => r[field]).filter((v) => v !== null)).size;
  const nums = scoped.map((r) => r[field]).filter((v): v is number => typeof v === "number");
  if (!nums.length) return null;
  switch (m.agg) {
    case "sum":
      return nums.reduce((a, b) => a + b, 0);
    case "avg":
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    case "min":
      return Math.min(...nums);
    case "max":
      return Math.max(...nums);
    case "median":
      return median(nums);
    default:
      return null;
  }
}

export function evalMetric(rows: Row[], m: MetricSpec): number | null {
  if ("ratio" in m) {
    const n = aggregate(rows, m.ratio.numerator);
    const d = aggregate(rows, m.ratio.denominator);
    if (n === null || !d) return null;
    return (n / d) * (m.ratio.percent ? 100 : 1);
  }
  return aggregate(rows, m);
}

function collectFields(spec: QuerySpec): string[] {
  const fields: string[] = [...(spec.dimensions ?? []), ...(spec.filters ?? []).map((f) => f.field)];
  const addAgg = (m: AggMetric) => {
    if (m.field) fields.push(m.field);
    m.where?.forEach((f) => fields.push(f.field));
  };
  for (const m of spec.metrics) {
    if ("ratio" in m) {
      addAgg(m.ratio.numerator);
      addAgg(m.ratio.denominator);
    } else addAgg(m);
  }
  return fields;
}

/** 요청 필드가 스키마에 존재하고 집계 방식이 타입에 맞는지 검증한다. */
export function validateQuery(spec: QuerySpec, schema: ColumnSchema[]): string | null {
  const byKey = new Map(schema.map((c) => [c.key, c]));
  for (const f of collectFields(spec)) {
    if (!byKey.has(f)) return `허용되지 않은 필드: ${f}`;
  }
  const checkAgg = (m: AggMetric): string | null => {
    if (m.agg !== "count" && !m.field) return `${m.id}: ${m.agg} 집계에는 field가 필요합니다.`;
    if (["sum", "avg", "min", "max", "median"].includes(m.agg) && byKey.get(m.field!)?.dataType !== "number") {
      return `${m.id}: ${m.field}은(는) 숫자형이 아닙니다.`;
    }
    return null;
  };
  for (const m of spec.metrics) {
    const err = "ratio" in m ? (checkAgg(m.ratio.numerator) ?? checkAgg(m.ratio.denominator)) : checkAgg(m);
    if (err) return err;
  }
  return null;
}

export function runQuery(rows: Row[], schema: ColumnSchema[], spec: QuerySpec): QueryResult {
  const err = validateQuery(spec, schema);
  if (err) throw new Error(err);
  const filtered = applyFilters(rows, spec.filters);
  const dims = spec.dimensions ?? [];
  const typeOf = new Map(schema.map((c) => [c.key, c.dataType]));

  const groups = new Map<string, { dimValues: Cell[]; rows: Row[] }>();
  for (const row of filtered) {
    const dimValues = dims.map((d) => {
      const v = row[d];
      if (v === null) return null;
      return typeOf.get(d) === "date" && spec.timeGrain ? bucketDate(String(v), spec.timeGrain) : v;
    });
    const key = dimValues.map((v) => String(v)).join("\u0001");
    const g = groups.get(key);
    if (g) g.rows.push(row);
    else groups.set(key, { dimValues, rows: [row] });
  }
  if (!dims.length && !groups.size) groups.set("", { dimValues: [], rows: [] });

  let out: ResultRow[] = [...groups.values()].map((g) => {
    const r: ResultRow = {};
    dims.forEach((d, i) => (r[d] = g.dimValues[i]));
    for (const m of spec.metrics) r[m.id] = evalMetric(g.rows, m);
    return r;
  });

  const sortBy = spec.sortBy ?? (dims.length && typeOf.get(dims[0]) === "date" ? dims[0] : spec.metrics[0]?.id);
  const dir = spec.sortDir ?? (sortBy && dims.includes(sortBy) ? "asc" : "desc");
  if (sortBy && dims.length) {
    out.sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (av === bv) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av < bv ? -1 : 1) * (dir === "asc" ? 1 : -1);
    });
  }
  if (spec.limit) out = out.slice(0, spec.limit);
  return { rows: out, sourceRowCount: filtered.length };
}
