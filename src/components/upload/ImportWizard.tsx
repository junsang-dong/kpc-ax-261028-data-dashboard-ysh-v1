"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Workbook } from "exceljs";
import type { DataType, RawTable } from "@/types/dataset";
import { buildDataset } from "@/lib/analytics/build";
import { delimiterLabel, MAX_UPLOAD_BYTES, parseCsv } from "@/lib/parsers/csv";
import { listSheets, loadWorkbook, sheetToRawTable, type SheetInfo } from "@/lib/parsers/excel";
import { saveDataset } from "@/lib/storage/db";
import { SAMPLES } from "@/lib/samples";
import { Badge, Button, Card, CardHeader, selectCls } from "@/components/ui";
import { DataTable } from "@/components/dashboard/DataTable";
import { QualityReport, SchemaTable } from "@/components/dashboard/SchemaTable";

type Source =
  | { kind: "csv"; fileName: string; table: RawTable; info: string }
  | { kind: "xlsx"; fileName: string; workbook: Workbook; sheets: SheetInfo[] };

export function ImportWizard() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState<string>("");
  const [headerRows, setHeaderRows] = useState<Record<string, number>>({});
  const [overrides, setOverrides] = useState<Record<string, Record<string, DataType>>>({});
  const [name, setName] = useState("");

  const reset = () => {
    setSource(null);
    setError(null);
    setSelected([]);
    setActive("");
    setOverrides({});
    setHeaderRows({});
  };

  const handleFile = useCallback(async (file: File) => {
    reset();
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext === "xls" || ext === "xlsm" || ext === "xlsb") {
      setError(".xls와 매크로 포함 파일은 지원하지 않습니다. .xlsx로 저장한 뒤 다시 올려 주세요.");
      return;
    }
    if (ext !== "csv" && ext !== "xlsx") {
      setError("CSV 또는 XLSX 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`파일 크기가 ${(file.size / 1024 / 1024).toFixed(1)}MB입니다. 파일당 20MB 이하만 업로드할 수 있습니다.`);
      return;
    }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const base = file.name.replace(/\.[^.]+$/, "");
      setName(base);
      if (ext === "csv") {
        const table = parseCsv(buf);
        if (!table.headers.length) throw new Error("읽을 수 있는 데이터가 없는 파일입니다.");
        setSource({ kind: "csv", fileName: file.name, table, info: `${table.encoding} · 구분자 ${delimiterLabel(table.delimiter)}` });
        setSelected(["csv"]);
        setActive("csv");
      } else {
        const workbook = await loadWorkbook(buf);
        const sheets = listSheets(workbook);
        if (!sheets.length) throw new Error("워크시트가 없는 파일입니다.");
        setSource({ kind: "xlsx", fileName: file.name, workbook, sheets });
        const first = sheets.find((s) => s.state === "visible") ?? sheets[0];
        setSelected([first.name]);
        setActive(first.name);
      }
    } catch (e) {
      setError(`파일을 읽는 중 오류가 발생했습니다: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  /** 샘플 CSV를 업로드한 파일과 동일한 경로(미리보기·타입 수정·품질 리포트)로 처리한다 */
  const loadSample = async (file: string, label: string) => {
    try {
      const res = await fetch(`/samples/${file}`);
      if (!res.ok) throw new Error("샘플 파일을 불러오지 못했습니다.");
      await handleFile(new File([await res.blob()], file, { type: "text/csv" }));
      setName(label);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const tableFor = useCallback(
    (key: string): RawTable | null => {
      if (!source) return null;
      if (source.kind === "csv") return source.table;
      const ws = source.workbook.getWorksheet(key);
      return ws ? sheetToRawTable(ws, headerRows[key] ?? 1) : null;
    },
    [source, headerRows],
  );

  const preview = useMemo(() => {
    if (!source || !active) return null;
    const table = tableFor(active);
    if (!table) return null;
    const label = source.kind === "csv" ? name : `${name} - ${active}`;
    return buildDataset(table, {
      name: label,
      fileName: source.fileName,
      sourceType: source.kind,
      typeOverrides: overrides[active],
    });
  }, [source, active, tableFor, name, overrides]);

  const register = async () => {
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      let firstId = "";
      for (const key of selected) {
        const table = tableFor(key);
        if (!table) continue;
        const ds = buildDataset(table, {
          name: source.kind === "csv" ? name : selected.length > 1 ? `${name} - ${key}` : name,
          fileName: source.fileName,
          sourceType: source.kind,
          typeOverrides: overrides[key],
        });
        await saveDataset(ds);
        firstId ||= ds.datasetId;
      }
      router.push(`/analytics/${firstId}`);
    } catch (e) {
      setError(`저장에 실패했습니다: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) void handleFile(f);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          drag ? "border-accent bg-surface2" : "border-line bg-surface"
        }`}
      >
        <p className="text-sm font-medium text-ink">CSV 또는 XLSX 파일을 여기에 끌어다 놓으세요</p>
        <p className="text-xs text-muted">파일당 20MB 이하 · UTF-8/EUC-KR · 쉼표/세미콜론/탭 구분자 자동 인식</p>
        <Button variant="primary" onClick={() => input.current?.click()} disabled={busy}>
          파일 선택
        </Button>
        <input
          ref={input}
          type="file"
          accept=".csv,.xlsx"
          className="sr-only"
          aria-label="데이터 파일 선택"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">예시 데이터로 시작:</span>
        {SAMPLES.map((sm) => (
          <Button key={sm.file} disabled={busy} title={sm.desc} onClick={() => loadSample(sm.file, sm.name)}>
            {sm.name}
          </Button>
        ))}
        <span className="text-xs text-muted">합성 데이터이며 실제 고객 정보가 아닙니다.</span>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-bad">
          {error}
        </p>
      )}

      {source && (
        <Card>
          <CardHeader
            title={source.fileName}
            sub={source.kind === "csv" ? source.info : `Excel 워크시트 ${source.sheets.length}개`}
            right={<Button onClick={reset}>취소</Button>}
          />
          <div className="space-y-5 p-4">
            <label className="block text-xs text-muted">
              데이터셋 이름
              <input
                className="mt-0.5 block w-full max-w-md rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            {source.kind === "xlsx" && (
              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-ink2">등록할 워크시트</legend>
                <ul className="space-y-1.5">
                  {source.sheets.map((s) => (
                    <li key={s.name} className="flex flex-wrap items-center gap-3 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected.includes(s.name)}
                          onChange={(e) => {
                            setSelected((cur) => (e.target.checked ? [...cur, s.name] : cur.filter((n) => n !== s.name)));
                            if (e.target.checked) setActive(s.name);
                          }}
                        />
                        <button type="button" className={`hover:underline ${active === s.name ? "font-semibold" : ""}`} onClick={() => setActive(s.name)}>
                          {s.name}
                        </button>
                      </label>
                      <span className="tabular text-xs text-muted">
                        {s.rowCount.toLocaleString()}행 × {s.columnCount}열
                      </span>
                      {s.state !== "visible" && <Badge tone="warn">숨김</Badge>}
                      {s.mergedCount > 0 && <Badge tone="warn">병합 셀 {s.mergedCount}</Badge>}
                      <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
                        헤더 행
                        <input
                          type="number"
                          min={1}
                          className={`${selectCls} tabular w-16`}
                          value={headerRows[s.name] ?? 1}
                          onChange={(e) => setHeaderRows((h) => ({ ...h, [s.name]: Math.max(1, Number(e.target.value) || 1) }))}
                        />
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}

            {preview && selected.includes(active) ? (
              <>
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-ink">컬럼 타입 {source.kind === "xlsx" && `· ${active}`}</h3>
                  <SchemaTable
                    schema={preview.schemaDefinition}
                    onTypeChange={(key, type) =>
                      setOverrides((o) => ({ ...o, [active]: { ...o[active], [key]: type } }))
                    }
                  />
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-ink">데이터 품질 리포트</h3>
                  <QualityReport dataset={preview} />
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-ink">미리보기</h3>
                  <DataTable dataset={{ ...preview, rows: preview.rows.slice(0, 100), rowCount: preview.rowCount }} rows={preview.rows.slice(0, 100)} />
                </section>
              </>
            ) : (
              source.kind === "xlsx" && <p className="text-sm text-muted">미리볼 워크시트를 선택하세요.</p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="primary" disabled={busy || !selected.length || !name.trim()} onClick={register}>
                {busy ? "저장 중…" : `데이터셋 등록${selected.length > 1 ? ` (${selected.length}개 시트)` : ""} 및 분석 시작`}
              </Button>
            </div>
          </div>
        </Card>
      )}
      {busy && !source && <p role="status" className="text-sm text-muted">파일을 분석하는 중…</p>}
    </div>
  );
}
