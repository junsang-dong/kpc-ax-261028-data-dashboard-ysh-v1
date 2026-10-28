"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";
import { DatasetTabs } from "@/components/dashboard/Shell";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { InsightCards, ThresholdPanel } from "@/components/dashboard/InsightCards";
import { Card, EmptyState, Spinner } from "@/components/ui";
import { DEFAULT_INSIGHT_SETTINGS, generateInsights, type InsightSettings } from "@/lib/analytics/insights";
import { applyFilters } from "@/lib/analytics/query";
import { useDashboardState, useDataset, useStoredString } from "@/lib/hooks";

const KEY = "nxp-insight-settings";

export default function InsightsPage() {
  const { id } = useParams<{ id: string }>();
  const { dataset, loading, error } = useDataset(id);
  const state = useDashboardState(id);
  const [stored, setStored] = useStoredString(KEY);
  const settings = useMemo<InsightSettings>(() => {
    try {
      return stored ? { ...DEFAULT_INSIGHT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_INSIGHT_SETTINGS;
    } catch {
      return DEFAULT_INSIGHT_SETTINGS;
    }
  }, [stored]);
  const update = (s: InsightSettings) => setStored(JSON.stringify(s));

  const rows = useMemo(() => (dataset ? applyFilters(dataset.rows, state.filters) : []), [dataset, state.filters]);
  const insights = useMemo(
    () => (dataset ? generateInsights({ dataset, rows, filters: state.filters, settings }) : []),
    [dataset, rows, state.filters, settings],
  );

  if (loading || !state.ready) return <Spinner />;
  if (error || !dataset) return <EmptyState title={error ?? "데이터셋을 찾을 수 없습니다."} />;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{dataset.datasetName}</h1>
        <p className="mt-1 text-xs text-muted">
          규칙 기반 인사이트 {insights.length}건 · 모든 인사이트는 계산식·분석 기간·적용 필터를 함께 표시하며 상관을 인과로 단정하지 않습니다.
        </p>
      </div>
      <DatasetTabs id={id} active="insights" />
      <div className="space-y-5">
        <Card className="p-4">
          <FilterBar dataset={dataset} filters={state.filters} onChange={state.setFilters} />
        </Card>
        <ThresholdPanel settings={settings} onChange={update} onReset={() => update(DEFAULT_INSIGHT_SETTINGS)} />
        <InsightCards insights={insights} />
        <p className="rounded-xl border border-dashed border-line px-4 py-3 text-xs text-muted">
          자연어 질문과 GPT 기반 인사이트는 Phase 3에서 추가됩니다. AI가 실패해도 이 통계 분석은 독립적으로 동작하도록 설계되어 있습니다.
        </p>
      </div>
    </div>
  );
}
