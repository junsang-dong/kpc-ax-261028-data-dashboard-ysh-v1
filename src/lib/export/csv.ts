import type { ColumnSchema, Row } from "@/types/dataset";

function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Excel에서 한글이 깨지지 않도록 UTF-8 BOM을 붙인 CSV 문자열 */
export function toCsv(schema: ColumnSchema[], rows: Row[]): string {
  const head = schema.map((c) => esc(c.key)).join(",");
  const body = rows.map((r) => schema.map((c) => esc(r[c.key])).join(","));
  return "﻿" + [head, ...body].join("\r\n");
}

export function downloadCsv(filename: string, schema: ColumnSchema[], rows: Row[]) {
  const blob = new Blob([toCsv(schema, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
