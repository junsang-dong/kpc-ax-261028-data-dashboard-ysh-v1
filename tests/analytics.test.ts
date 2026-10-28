import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDataset } from "@/lib/analytics/build";
import { parseCsv } from "@/lib/parsers/csv";
import { parseNumber, parseDate, inferType } from "@/lib/analytics/infer";
import { runQuery, validateQuery } from "@/lib/analytics/query";
import { crmKpis, crmMetrics, isCrmPipeline } from "@/lib/analytics/templates/crm";
import { recommendCharts } from "@/lib/analytics/charts";
import { generateInsights, DEFAULT_INSIGHT_SETTINGS } from "@/lib/analytics/insights";
import { toCsv } from "@/lib/export/csv";

const buf = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const load = (file: string) => {
  const text = readFileSync(file);
  const raw = parseCsv(text.buffer.slice(text.byteOffset, text.byteOffset + text.byteLength) as ArrayBuffer);
  return buildDataset(raw, { name: file, fileName: file, sourceType: "csv" });
};

describe("value parsing", () => {
  it("parses numbers with separators and symbols", () => {
    expect(parseNumber("1,234.5")).toBe(1234.5);
    expect(parseNumber("$1,000")).toBe(1000);
    expect(parseNumber("12%")).toBe(12);
    expect(parseNumber("(300)")).toBe(-300);
    expect(parseNumber("abc")).toBeNull();
  });
  it("rejects impossible dates", () => {
    expect(parseDate("2026-02-30")).toBeNull();
    expect(parseDate("2026/10/28")).toBe("2026-10-28");
  });
  it("infers column types", () => {
    expect(inferType(["1", "2", "3"])).toBe("number");
    expect(inferType(["2026-01-01", "2026-01-02"])).toBe("date");
    expect(inferType(["true", "false"])).toBe("boolean");
    expect(inferType(["a", "b"])).toBe("string");
  });
});

describe("csv parsing", () => {
  it("handles BOM and semicolon delimiter", () => {
    const r = parseCsv(buf("﻿a;b\n1;2\n3;4\n"));
    expect(r.headers).toEqual(["a", "b"]);
    expect(r.delimiter).toBe(";");
    expect(r.encoding).toBe("UTF-8 (BOM)");
  });
  it("dedupes headers and reports quality", () => {
    const ds = buildDataset(parseCsv(buf("x,x,y\n1,1,\n1,1,\n2,3,\n")), { name: "t", fileName: "t.csv", sourceType: "csv" });
    expect(ds.schemaDefinition.map((c) => c.key)).toEqual(["x", "x_2", "y"]);
    expect(ds.dataQuality.duplicateRowCount).toBe(1);
    expect(ds.schemaDefinition[2].profile.nullCount).toBe(3);
    expect(ds.rawRows[0]).toEqual(["1", "1", ""]);
  });
});

describe("query engine", () => {
  const ds = load("public/samples/retail_orders.csv");
  it("rejects fields outside the schema", () => {
    expect(validateQuery({ metrics: [{ id: "m", agg: "sum", field: "nope" }] }, ds.schemaDefinition)).toMatch(/허용되지 않은/);
    expect(validateQuery({ metrics: [{ id: "m", agg: "sum", field: "지역" }] }, ds.schemaDefinition)).toMatch(/숫자형/);
  });
  it("matches a manual aggregation", () => {
    const manual = ds.rows.reduce((a, r) => a + (r["매출"] as number), 0);
    const res = runQuery(ds.rows, ds.schemaDefinition, { metrics: [{ id: "s", agg: "sum", field: "매출" }] });
    expect(res.rows[0].s).toBe(manual);
    const byRegion = runQuery(ds.rows, ds.schemaDefinition, { metrics: [{ id: "s", agg: "sum", field: "매출" }], dimensions: ["지역"] });
    expect(byRegion.rows.reduce((a, r) => a + (r.s as number), 0)).toBe(manual);
  });
  it("applies filters", () => {
    const res = runQuery(ds.rows, ds.schemaDefinition, {
      metrics: [{ id: "c", agg: "count" }],
      filters: [{ field: "지역", operator: "eq", value: "서울" }],
    });
    expect(res.rows[0].c).toBe(ds.rows.filter((r) => r["지역"] === "서울").length);
  });
  it("recommends a line, bar and donut chart", () => {
    const types = recommendCharts(ds.schemaDefinition, { agg: "sum" }).map((c) => c.type);
    expect(types).toEqual(expect.arrayContaining(["line", "bar", "donut"]));
  });
});

describe("CRM template", () => {
  const ds = load("public/samples/sales_pipeline.csv");
  it("detects the pipeline schema", () => {
    expect(isCrmPipeline(ds.schemaDefinition)).toBe(true);
    expect(ds.schemaDefinition.find((c) => c.key === "opportunity_id")?.semanticType).toBe("identifier");
  });
  it("computes KPIs with the specified formulas", () => {
    const won = ds.rows.filter((r) => r.deal_stage === "Won");
    const lost = ds.rows.filter((r) => r.deal_stage === "Lost");
    const revenue = won.reduce((a, r) => a + (r.close_value as number), 0);
    const k = Object.fromEntries(crmKpis(ds.rows).map((x) => [x.id, x.value]));
    expect(k.opp_total).toBe(ds.rows.length);
    expect(k.opp_won).toBe(won.length);
    expect(k.opp_lost).toBe(lost.length);
    expect(k.won_revenue).toBe(revenue);
    expect(k.win_rate).toBeCloseTo((won.length / (won.length + lost.length)) * 100, 10);
    expect(k.avg_deal).toBeCloseTo(revenue / won.length, 10);
    expect(k.opp_open).toBe(ds.rows.length - won.length - lost.length);
    expect(k.avg_cycle).toBeGreaterThan(9);
  });
  it("flags the low-win-rate group with evidence", () => {
    const insights = generateInsights({ dataset: ds, rows: ds.rows, filters: [], settings: DEFAULT_INSIGHT_SETTINGS });
    const perf = insights.find((i) => i.id === "performance_product");
    expect(perf?.summary).toContain("GTK 500");
    expect(perf?.evidence.length).toBeGreaterThan(1);
    expect(perf?.limitations.length).toBeGreaterThan(0);
    expect(crmMetrics.winRate.id).toBe("win_rate");
  });
});

describe("export", () => {
  it("writes BOM and escapes quotes", () => {
    const ds = buildDataset(parseCsv(buf('a,b\n"x,y","q""r"\n')), { name: "t", fileName: "t.csv", sourceType: "csv" });
    const out = toCsv(ds.schemaDefinition, ds.rows);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toContain('"x,y","q""r"');
  });
});

describe("insight accuracy", () => {
  const ds = load("public/samples/sales_pipeline.csv");
  const insights = generateInsights({ dataset: ds, rows: ds.rows, filters: [], settings: DEFAULT_INSIGHT_SETTINGS });
  it("does not report concentration on the dimension the metric already filters", () => {
    expect(insights.find((i) => i.id === "concentration_deal_stage")).toBeUndefined();
  });
  it("excludes the partial last month from period comparison", () => {
    const trend = insights.find((i) => i.category === "trend");
    if (trend) {
      expect(trend.summary).not.toContain("2026-10");
      expect(trend.limitations.join(" ")).toContain("부분 기간");
    }
  });
  it("does not flag zero-heavy columns as outliers", () => {
    expect(insights.find((i) => i.id === "outlier_close_value")).toBeUndefined();
  });
});
