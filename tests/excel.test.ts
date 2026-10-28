import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildDataset } from "@/lib/analytics/build";
import { listSheets, loadWorkbook, sheetToRawTable } from "@/lib/parsers/excel";

async function makeBuffer(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet("매출");
  a.addRow(["보고서 제목"]); // 헤더가 2행에 있는 경우
  a.addRow(["일자", "지역", "수량", "단가", "합계"]);
  a.addRow([new Date(Date.UTC(2026, 0, 5)), "서울", 2, 1000, { formula: "C3*D3", result: 2000 }]);
  a.addRow([new Date(Date.UTC(2026, 0, 6)), "부산", 3, 1500, { formula: "C4*D4", result: 4500 }]);
  a.addRow([]);
  a.addRow([new Date(Date.UTC(2026, 0, 7)), "서울", 1, 900, { formula: "C6*D6" }]);
  a.mergeCells("A1:C1");
  wb.addWorksheet("숨김").state = "hidden";
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

describe("excel parser", () => {
  it("lists sheets with hidden/merged warnings and uses stored formula results", async () => {
    const wb = await loadWorkbook(await makeBuffer());
    const sheets = listSheets(wb);
    expect(sheets.map((s) => [s.name, s.state])).toEqual([["매출", "visible"], ["숨김", "hidden"]]);
    expect(sheets[0].mergedCount).toBe(1);

    const table = sheetToRawTable(wb.getWorksheet("매출")!, 2);
    expect(table.headers).toEqual(["일자", "지역", "수량", "단가", "합계"]);
    expect(table.rows).toHaveLength(3);
    expect(table.warnings.join(" ")).toContain("병합 셀");
    expect(table.warnings.join(" ")).toContain("빈 행");

    const ds = buildDataset(table, { name: "t", fileName: "t.xlsx", sourceType: "xlsx" });
    const types = Object.fromEntries(ds.schemaDefinition.map((c) => [c.key, c.dataType]));
    expect(types).toMatchObject({ 일자: "date", 지역: "string", 수량: "number", 합계: "number" });
    expect(ds.rows[0]["일자"]).toBe("2026-01-05");
    expect(ds.rows[0]["합계"]).toBe(2000);
  });

  it("warns about hidden sheets", async () => {
    const wb = await loadWorkbook(await makeBuffer());
    expect(sheetToRawTable(wb.getWorksheet("숨김")!).warnings.join(" ")).toContain("숨김 시트");
  });
});
