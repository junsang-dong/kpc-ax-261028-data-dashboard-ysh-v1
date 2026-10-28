"use client";

import { useMemo } from "react";
import type { Dataset, Filter } from "@/types/dataset";
import { categoricalColumns, temporalColumns } from "@/lib/analytics/kpi";
import { describeFilter, setDateFilter, setInFilter } from "@/lib/analytics/filters";
import { selectCls } from "@/components/ui";

interface Props {
  dataset: Dataset;
  filters: Filter[];
  onChange: (f: Filter[]) => void;
}

export function FilterBar({ dataset, filters, onChange }: Props) {
  const schema = dataset.schemaDefinition;
  const dateCols = useMemo(() => temporalColumns(schema), [schema]);
  const cats = useMemo(() => categoricalColumns(schema, 2, 30).slice(0, 4), [schema]);
  const options = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const c of cats) {
      out[c.key] = [...new Set(dataset.rows.map((r) => r[c.key]).filter((v) => v !== null).map(String))].sort();
    }
    return out;
  }, [cats, dataset.rows]);

  const dateFilter = filters.find((f) => f.operator === "between");
  const dateField = dateFilter?.field ?? dateCols[0]?.key;
  const [from, to] = Array.isArray(dateFilter?.value) ? (dateFilter!.value as (string | null)[]) : [null, null];
  const range = dateCols.find((c) => c.key === dateField)?.profile.dateRange;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        {dateCols.length > 0 && dateField && (
          <fieldset className="flex items-end gap-2">
            <legend className="sr-only">분석 기간</legend>
            {dateCols.length > 1 && (
              <label className="text-xs text-muted">
                기간 기준
                <select
                  className={`${selectCls} mt-0.5 block`}
                  value={dateField}
                  onChange={(e) => onChange(setDateFilter(filters, e.target.value, from ?? "", to ?? ""))}
                >
                  {dateCols.map((c) => (
                    <option key={c.key}>{c.key}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-xs text-muted">
              {dateField} 시작
              <input
                type="date"
                className={`${selectCls} mt-0.5 block`}
                min={range?.min}
                max={range?.max}
                value={from ?? ""}
                onChange={(e) => onChange(setDateFilter(filters, dateField, e.target.value, to ?? ""))}
              />
            </label>
            <label className="text-xs text-muted">
              종료
              <input
                type="date"
                className={`${selectCls} mt-0.5 block`}
                min={range?.min}
                max={range?.max}
                value={to ?? ""}
                onChange={(e) => onChange(setDateFilter(filters, dateField, from ?? "", e.target.value))}
              />
            </label>
          </fieldset>
        )}
        {cats.map((c) => {
          const active = filters.find((f) => f.field === c.key && f.operator === "in");
          const selected = new Set(Array.isArray(active?.value) ? active!.value.map(String) : []);
          return (
            <details key={c.key} className="relative">
              <summary className={`${selectCls} flex cursor-pointer list-none items-center gap-1.5`}>
                {c.key}
                {selected.size > 0 && <span className="rounded bg-accent px-1.5 text-xs text-white">{selected.size}</span>}
                <span aria-hidden className="text-muted">▾</span>
              </summary>
              <div className="absolute z-10 mt-1 max-h-64 min-w-48 overflow-auto rounded-lg border border-line bg-surface p-2 shadow-lg">
                {options[c.key].map((v) => (
                  <label key={v} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-surface2">
                    <input
                      type="checkbox"
                      checked={selected.has(v)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(v);
                        else next.delete(v);
                        onChange(setInFilter(filters, c.key, [...next]));
                      }}
                    />
                    <span className="truncate">{v}</span>
                  </label>
                ))}
              </div>
            </details>
          );
        })}
        {filters.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="rounded-lg px-2 py-1.5 text-sm text-ink2 underline hover:text-ink">
            필터 초기화
          </button>
        )}
      </div>
      {filters.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="적용 중인 필터">
          {filters.map((f, i) => (
            <li key={i} className="flex items-center gap-1 rounded-full border border-line bg-surface2 py-0.5 pl-2.5 pr-1 text-xs text-ink2">
              {describeFilter(f)}
              <button
                type="button"
                aria-label={`${describeFilter(f)} 필터 제거`}
                className="rounded-full px-1.5 hover:bg-line"
                onClick={() => onChange(filters.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
