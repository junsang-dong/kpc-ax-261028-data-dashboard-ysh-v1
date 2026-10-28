import type { ColumnSchema, DataType, Dataset } from "@/types/dataset";
import { formatValue } from "@/lib/format";
import { Badge, selectCls } from "@/components/ui";

const SEMANTIC: Record<string, string> = {
  numeric: "수치",
  temporal: "날짜·시간",
  categorical: "범주",
  identifier: "식별자",
  text: "텍스트",
  boolean: "Boolean",
};

function summary(c: ColumnSchema): string {
  const p = c.profile;
  if (p.numeric) {
    const n = p.numeric;
    return `최소 ${formatValue(n.min, "number", true)} · 중앙 ${formatValue(n.median, "number", true)} · 평균 ${formatValue(n.mean, "number", true)} · 최대 ${formatValue(n.max, "number", true)}`;
  }
  if (p.dateRange?.min) return `${p.dateRange.min} ~ ${p.dateRange.max}`;
  const top = p.topValues?.[0];
  return top ? `최빈값 ${top.value} (${top.count.toLocaleString()})` : "–";
}

export function SchemaTable({
  schema,
  onTypeChange,
}: {
  schema: ColumnSchema[];
  onTypeChange?: (key: string, type: DataType) => void;
}) {
  return (
    <div className="overflow-auto rounded-lg border border-line">
      <table className="w-full text-left text-xs">
        <thead className="bg-surface2 text-ink2">
          <tr>
            {["컬럼", "데이터 타입", "의미 유형", "결측", "고유값", "요약"].map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {schema.map((c) => (
            <tr key={c.key} className="border-t border-line">
              <td className="whitespace-nowrap px-3 py-1.5 font-medium text-ink">{c.key}</td>
              <td className="px-3 py-1.5">
                {onTypeChange ? (
                  <select
                    aria-label={`${c.key} 데이터 타입`}
                    className={selectCls}
                    value={c.dataType}
                    onChange={(e) => onTypeChange(c.key, e.target.value as DataType)}
                  >
                    {(["number", "string", "date", "boolean"] as const).map((t) => (
                      <option key={t} value={t}>{t}{t === c.inferredType ? " (추론)" : ""}</option>
                    ))}
                  </select>
                ) : (
                  c.dataType
                )}
              </td>
              <td className="px-3 py-1.5"><Badge>{SEMANTIC[c.semanticType]}</Badge></td>
              <td className={`tabular px-3 py-1.5 ${c.profile.nullRatio >= 0.2 ? "text-warn" : "text-ink2"}`}>
                {(c.profile.nullRatio * 100).toFixed(1)}%
                {c.profile.typeMismatchCount > 0 && <span className="text-bad"> · 불일치 {c.profile.typeMismatchCount}</span>}
              </td>
              <td className="tabular px-3 py-1.5 text-ink2">{c.profile.uniqueCount.toLocaleString()}</td>
              <td className="tabular px-3 py-1.5 text-ink2">{summary(c)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QualityReport({ dataset }: { dataset: Dataset }) {
  const q = dataset.dataQuality;
  const tone = { info: "neutral", warning: "warn", critical: "bad" } as const;
  const label = { info: "참고", warning: "주의", critical: "심각" } as const;
  const tiles = [
    ["행", q.rowCount.toLocaleString()],
    ["컬럼", q.columnCount.toLocaleString()],
    ["중복 행", `${q.duplicateRowCount.toLocaleString()} (${(q.duplicateRatio * 100).toFixed(2)}%)`],
    ["결측 컬럼", dataset.schemaDefinition.filter((c) => c.profile.nullCount > 0).length.toLocaleString()],
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line bg-surface p-3">
            <p className="text-xs text-muted">{k}</p>
            <p className="tabular text-lg font-semibold text-ink">{v}</p>
          </div>
        ))}
      </div>
      {q.issues.length === 0 ? (
        <p className="text-sm text-good">✓ 발견된 품질 문제가 없습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {q.issues.map((i, n) => (
            <li key={n} className="flex items-start gap-2 text-sm">
              <Badge tone={tone[i.severity]}>{label[i.severity]}</Badge>
              <span className="text-ink2">
                {i.column && <strong className="font-medium text-ink">{i.column} · </strong>}
                {i.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
