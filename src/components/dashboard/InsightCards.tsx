"use client";

import type { Insight, InsightSettings } from "@/lib/analytics/insights";
import { Badge, Card } from "@/components/ui";

const SEV = { high: ["높음", "bad"], medium: ["보통", "warn"], low: ["참고", "neutral"] } as const;
const CAT: Record<Insight["category"], string> = {
  concentration: "집중도",
  trend: "추세",
  quality: "데이터 품질",
  performance: "성과",
  outlier: "이상치",
  correlation: "상관",
};

export function InsightCards({ insights }: { insights: Insight[] }) {
  if (!insights.length) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
        현재 임계값과 필터 기준으로 감지된 인사이트가 없습니다.
      </p>
    );
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {insights.map((i) => (
        <Card key={i.id} className="p-4">
          <div className="flex items-center gap-2">
            <Badge tone={SEV[i.severity][1]}>{SEV[i.severity][0]}</Badge>
            <Badge>{CAT[i.category]}</Badge>
          </div>
          <h3 className="mt-2 text-sm font-semibold text-ink">{i.title}</h3>
          <p className="mt-1 text-sm text-ink2">{i.summary}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-surface2 p-2.5 text-xs">
            {i.evidence.map((e, n) => (
              <div key={n} className="contents">
                <dt className="text-muted">{e.label}</dt>
                <dd className="tabular text-right font-medium text-ink">{e.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-ink">
            <span className="text-muted">제안 · </span>
            {i.recommendation}
          </p>
          <details className="mt-2 text-xs text-muted">
            <summary className="cursor-pointer select-none hover:text-ink2">계산 근거 · 한계</summary>
            <ul className="mt-1.5 space-y-0.5 text-ink2">
              <li>계산식: {i.basis.formula}</li>
              <li>분석 기간: {i.basis.period}</li>
              <li>적용 필터: {i.basis.filters.length ? i.basis.filters.join("; ") : "없음"}</li>
              <li>사용 행: {i.basis.sourceRows.toLocaleString()}</li>
              {i.limitations.map((l, n) => (
                <li key={n}>한계: {l}</li>
              ))}
            </ul>
          </details>
        </Card>
      ))}
    </div>
  );
}

const FIELDS: { key: keyof InsightSettings; label: string; step: number; scale?: number; unit: string }[] = [
  { key: "concentrationShare", label: "집중도 비중", step: 5, scale: 100, unit: "%" },
  { key: "periodChange", label: "기간 대비 변화", step: 5, scale: 100, unit: "%" },
  { key: "missingRatio", label: "결측률", step: 5, scale: 100, unit: "%" },
  { key: "duplicateRatio", label: "중복 행 비율", step: 1, scale: 100, unit: "%" },
  { key: "outlierRatio", label: "이상치 비율", step: 1, scale: 100, unit: "%" },
  { key: "correlation", label: "상관계수 |r|", step: 5, scale: 100, unit: "/100" },
  { key: "winRateGapPt", label: "수주율 격차", step: 1, unit: "%p" },
  { key: "minGroupSize", label: "그룹 최소 거래 수", step: 5, unit: "건" },
];

export function ThresholdPanel({
  settings,
  onChange,
  onReset,
}: {
  settings: InsightSettings;
  onChange: (s: InsightSettings) => void;
  onReset: () => void;
}) {
  return (
    <details className="rounded-xl border border-line bg-surface">
      <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-ink">임계값 설정</summary>
      <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
        {FIELDS.map((f) => (
          <label key={f.key} className="text-xs text-muted">
            {f.label} ({f.unit})
            <input
              type="number"
              min={0}
              step={f.step}
              className="tabular mt-0.5 block w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink"
              value={Math.round(settings[f.key] * (f.scale ?? 1) * 100) / 100}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 0) onChange({ ...settings, [f.key]: n / (f.scale ?? 1) });
              }}
            />
          </label>
        ))}
        <div className="flex items-end">
          <button type="button" onClick={onReset} className="text-sm text-ink2 underline hover:text-ink">
            기본값으로 되돌리기
          </button>
        </div>
      </div>
    </details>
  );
}
