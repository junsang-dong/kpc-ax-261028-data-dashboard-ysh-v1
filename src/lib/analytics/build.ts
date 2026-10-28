import type {
  Cell,
  ColumnProfile,
  ColumnSchema,
  DataType,
  Dataset,
  QualityIssue,
  RawTable,
  Row,
} from "@/types/dataset";
import {
  convertValue,
  inferSemanticType,
  inferType,
  isMissing,
  looksLikeDate,
  parseDate,
} from "./infer";
import { numericStats } from "./stats";

export interface BuildOptions {
  name: string;
  fileName: string;
  sourceType: Dataset["sourceType"];
  datasetId?: string;
  workspaceId?: string;
  version?: number;
  typeOverrides?: Record<string, DataType>;
  notes?: string[];
}

export function normalizeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h, i) => {
    const base = String(h ?? "").trim() || `column_${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

function rawToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return String(v);
}

export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

export function buildDataset(table: RawTable, opts: BuildOptions): Dataset {
  const keys = normalizeHeaders(table.headers);
  const width = keys.length;

  // 완전히 빈 행 제거
  const nonEmpty = table.rows.filter((r) => r.some((v) => !isMissing(v)));
  const droppedEmpty = table.rows.length - nonEmpty.length;

  const rawRows: string[][] = nonEmpty.map((r) =>
    keys.map((_, c) => rawToString(r[c])),
  );

  const columns: ColumnSchema[] = [];
  const cleanedCols: Cell[][] = [];
  const issues: QualityIssue[] = [];

  keys.forEach((key, c) => {
    const source = nonEmpty.map((r) => r[c]);
    const inferredType = inferType(source);
    const dataType = opts.typeOverrides?.[key] ?? inferredType;
    let mismatch = 0;
    const cleaned: Cell[] = source.map((v) => {
      const res = convertValue(v, dataType);
      if (res.mismatch) mismatch++;
      return res.value;
    });
    cleanedCols.push(cleaned);

    const present = cleaned.filter((v): v is Exclude<Cell, null> => v !== null);
    const nullCount = cleaned.length - present.length;
    const counts = new Map<string, number>();
    for (const v of present) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);

    const profile: ColumnProfile = {
      nullCount,
      nullRatio: cleaned.length ? nullCount / cleaned.length : 0,
      uniqueCount: counts.size,
      typeMismatchCount: mismatch,
    };
    if (dataType === "number") {
      profile.numeric = numericStats(present as number[]);
    }
    if (dataType === "date") {
      const dates = (present as string[]).slice().sort();
      const invalid = source.filter((v) => !isMissing(v) && looksLikeDate(v) && parseDate(v) === null).length;
      profile.dateRange = dates.length
        ? { min: dates[0], max: dates[dates.length - 1], invalidCount: invalid }
        : { min: "", max: "", invalidCount: invalid };
      if (invalid) {
        issues.push({ severity: "warning", column: key, message: `존재하지 않는 날짜 ${invalid}건이 null로 처리되었습니다.` });
      }
    }
    profile.topValues = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([value, count]) => ({ value, count }));

    const semanticType = inferSemanticType(key, dataType, cleaned);
    columns.push({
      key,
      originalName: table.headers[c] ?? key,
      dataType,
      inferredType,
      semanticType,
      profile,
    });

    if (profile.nullRatio >= 0.5) {
      issues.push({ severity: "critical", column: key, message: `결측률이 ${(profile.nullRatio * 100).toFixed(1)}%로 매우 높습니다.` });
    } else if (profile.nullRatio >= 0.2) {
      issues.push({ severity: "warning", column: key, message: `결측률이 ${(profile.nullRatio * 100).toFixed(1)}%입니다.` });
    }
    if (mismatch && dataType !== "date") {
      issues.push({ severity: "warning", column: key, message: `${dataType} 타입에 맞지 않는 값 ${mismatch}건이 null로 처리되었습니다.` });
    }
    if (present.length > 1 && counts.size === 1) {
      issues.push({ severity: "info", column: key, message: "모든 값이 동일한 상수 컬럼입니다." });
    }
  });

  const rows: Row[] = nonEmpty.map((_, i) => {
    const row: Row = {};
    for (let c = 0; c < width; c++) row[keys[c]] = cleanedCols[c][i];
    return row;
  });

  const seen = new Set<string>();
  let duplicateRowCount = 0;
  for (const r of rawRows) {
    const sig = r.join("\u0001");
    if (seen.has(sig)) duplicateRowCount++;
    else seen.add(sig);
  }
  const duplicateRatio = rawRows.length ? duplicateRowCount / rawRows.length : 0;
  if (duplicateRatio > 0) {
    issues.push({
      severity: duplicateRatio >= 0.01 ? "warning" : "info",
      message: `중복 행 ${duplicateRowCount.toLocaleString()}건 (${(duplicateRatio * 100).toFixed(2)}%)`,
    });
  }
  if (droppedEmpty) {
    issues.push({ severity: "info", message: `완전히 빈 행 ${droppedEmpty}건을 제외했습니다.` });
  }
  for (const w of table.warnings) issues.push({ severity: "warning", message: w });

  return {
    datasetId: opts.datasetId ?? newId("ds"),
    workspaceId: opts.workspaceId ?? "ws_local",
    datasetName: opts.name,
    sourceType: opts.sourceType,
    originalFileName: opts.fileName,
    schemaDefinition: columns,
    rowCount: rows.length,
    columnCount: columns.length,
    dataQuality: {
      rowCount: rows.length,
      columnCount: columns.length,
      duplicateRowCount,
      duplicateRatio,
      issues,
    },
    datasetVersion: opts.version ?? 1,
    lastUpdatedAt: new Date().toISOString(),
    processingStatus: "completed",
    rows,
    rawRows,
    notes: opts.notes,
  };
}
