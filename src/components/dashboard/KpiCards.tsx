import type { Kpi } from "@/lib/analytics/kpi";
import { formatValue } from "@/lib/format";

export function KpiCards({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {kpis.map((k) => (
        <div key={k.id} className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs text-muted">{k.label}</p>
          <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-ink">{formatValue(k.value, k.format, true)}</p>
          <details className="mt-1 text-xs text-muted">
            <summary className="cursor-pointer select-none hover:text-ink2">산식 · 근거 {k.sourceRows.toLocaleString()}행</summary>
            <p className="mt-1 break-words text-ink2">{k.formula}</p>
            {k.value !== null && <p className="tabular mt-0.5">정확한 값: {formatValue(k.value, k.format)}</p>}
            {k.note && <p className="mt-0.5">{k.note}</p>}
          </details>
        </div>
      ))}
    </div>
  );
}
