import type { Workbook, Worksheet, CellValue } from "exceljs";
import type { RawTable } from "@/types/dataset";

export interface SheetInfo {
  name: string;
  state: "visible" | "hidden" | "veryHidden";
  rowCount: number;
  columnCount: number;
  mergedCount: number;
}

export async function loadWorkbook(buffer: ArrayBuffer): Promise<Workbook> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

function mergedCount(ws: Worksheet): number {
  return (ws.model as unknown as { merges?: string[] }).merges?.length ?? 0;
}

export function listSheets(wb: Workbook): SheetInfo[] {
  return wb.worksheets.map((ws) => ({
    name: ws.name,
    state: ws.state ?? "visible",
    rowCount: ws.actualRowCount,
    columnCount: ws.actualColumnCount,
    mergedCount: mergedCount(ws),
  }));
}

/** 수식은 실행하지 않고 파일에 저장된 계산 결과만 사용한다. */
export function normalizeCellValue(v: CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v !== "object") return v;
  if ("result" in v) return normalizeCellValue(v.result as CellValue);
  if ("formula" in v || "sharedFormula" in v) return null;
  if ("richText" in v) return v.richText.map((t) => t.text).join("");
  if ("text" in v) return String(v.text);
  if ("error" in v) return null;
  return String(v);
}

export function sheetToRawTable(ws: Worksheet, headerRow = 1): RawTable {
  const warnings: string[] = [];
  if (ws.state && ws.state !== "visible") warnings.push(`'${ws.name}'은(는) 숨김 시트입니다.`);
  const merges = mergedCount(ws);
  if (merges) warnings.push(`병합 셀 ${merges}개가 있습니다. 병합된 값은 첫 셀에만 채워집니다.`);

  const width = ws.actualColumnCount;
  const readRow = (n: number): unknown[] => {
    const row = ws.getRow(n);
    const out: unknown[] = [];
    for (let c = 1; c <= width; c++) out.push(normalizeCellValue(row.getCell(c).value));
    return out;
  };

  const headers = readRow(headerRow).map((v) => (v === null ? "" : String(v)));
  const rows: unknown[][] = [];
  let blank = 0;
  let uncomputed = 0;
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values = readRow(r);
    if (values.every((v) => v === null || v === "")) {
      blank++;
      continue;
    }
    for (let c = 1; c <= width; c++) {
      const raw = row.getCell(c).value;
      if (raw && typeof raw === "object" && "formula" in raw && raw.result === undefined) uncomputed++;
    }
    rows.push(values);
  }
  if (blank) warnings.push(`빈 행 ${blank}건을 건너뛰었습니다.`);
  if (uncomputed) warnings.push(`저장된 계산 결과가 없는 수식 셀 ${uncomputed}개는 빈 값으로 처리했습니다.`);
  return { headers, rows, warnings };
}
