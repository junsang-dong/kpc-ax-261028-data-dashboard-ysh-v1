"use client";

import { useMemo, useState } from "react";
import type { Dataset, Row } from "@/types/dataset";
import { Button } from "@/components/ui";

const PAGE = 25;

export function DataTable({ dataset, rows, showRaw = false }: { dataset: Dataset; rows: Row[]; showRaw?: boolean }) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [raw, setRaw] = useState(false);
  const cols = dataset.schemaDefinition;

  const index = useMemo(() => new Map(dataset.rows.map((r, i) => [r, i])), [dataset.rows]);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : 1) * sort.dir;
    });
  }, [rows, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const slice = sorted.slice(cur * PAGE, cur * PAGE + PAGE);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted">
        <span>
          {rows.length.toLocaleString()}행 {rows.length !== dataset.rowCount && `(전체 ${dataset.rowCount.toLocaleString()}행 중)`}
        </span>
        {showRaw && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} />
            원본 값 표시
          </label>
        )}
      </div>
      <div className="max-h-[480px] overflow-auto rounded-lg border border-line">
        <table className="tabular w-full text-left text-xs">
          <thead className="sticky top-0 bg-surface2 text-ink2">
            <tr>
              {cols.map((c) => (
                <th key={c.key} className="whitespace-nowrap px-3 py-2 font-medium">
                  <button
                    type="button"
                    className="hover:text-ink"
                    onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }))}
                  >
                    {c.key}
                    {sort?.key === c.key && (sort.dir === 1 ? " ▲" : " ▼")}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => {
              const rawRow = raw ? dataset.rawRows[index.get(r) ?? -1] : undefined;
              return (
                <tr key={i} className="border-t border-line hover:bg-surface2">
                  {cols.map((c, j) => {
                    const v = rawRow ? rawRow[j] : r[c.key];
                    return (
                      <td key={c.key} className={`whitespace-nowrap px-3 py-1.5 ${v === null || v === "" ? "text-muted" : "text-ink"} ${c.dataType === "number" ? "text-right" : ""}`}>
                        {v === null || v === "" ? "–" : String(v)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {!slice.length && (
              <tr>
                <td colSpan={cols.length} className="px-3 py-8 text-center text-muted">
                  표시할 행이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center justify-end gap-2 text-xs text-muted">
        <Button disabled={cur === 0} onClick={() => setPage(cur - 1)}>이전</Button>
        <span className="tabular">{cur + 1} / {pages}</span>
        <Button disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>다음</Button>
      </div>
    </div>
  );
}
