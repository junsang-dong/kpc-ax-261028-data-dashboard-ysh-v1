"use client";

import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { DataTable } from "@/components/dashboard/DataTable";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { DatasetTabs } from "@/components/dashboard/Shell";
import { Badge, Button, Card, CardHeader, EmptyState, selectCls, Spinner } from "@/components/ui";
import { applyFilters } from "@/lib/analytics/query";
import { recommendCharts } from "@/lib/analytics/charts";
import { toggleSelection } from "@/lib/analytics/filters";
import { genericKpis, measureColumns } from "@/lib/analytics/kpi";
import { crmKpis, isCrmPipeline } from "@/lib/analytics/templates/crm";
import { downloadCsv } from "@/lib/export/csv";
import { useDashboardState, useDataset } from "@/lib/hooks";

export default function AnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const { dataset, loading, error } = useDataset(id);
  const state = useDashboardState(id);
  const [saved, setSaved] = useState(false);

  const rows = useMemo(() => (dataset ? applyFilters(dataset.rows, state.filters) : []), [dataset, state.filters]);
  const crm = dataset ? isCrmPipeline(dataset.schemaDefinition) : false;
  const kpis = useMemo(
    () => (dataset ? (crm ? crmKpis(rows) : genericKpis(dataset.schemaDefinition, rows)) : []),
    [dataset, rows, crm],
  );
  const charts = useMemo(
    () => (dataset ? recommendCharts(dataset.schemaDefinition, { measureField: state.measureField, agg: state.agg }) : []),
    [dataset, state.measureField, state.agg],
  );

  if (loading || !state.ready) return <Spinner />;
  if (error || !dataset) return <EmptyState title={error ?? "데이터셋을 찾을 수 없습니다."} />;

  const measures = measureColumns(dataset.schemaDefinition);
  const asOf = dataset.lastUpdatedAt.slice(0, 10);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">{dataset.datasetName}</h1>
          <p className="tabular mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge>{crm ? "CRM 템플릿" : "자동 분석"}</Badge>
            출처 {dataset.originalFileName} · 기준일 {asOf} · v{dataset.datasetVersion} · 필터 후 {rows.length.toLocaleString()} / {dataset.rowCount.toLocaleString()}행
          </p>
        </div>
        <div className="flex items-center gap-2">
          {state.savedAt && <span className="text-xs text-muted">저장됨 {new Date(state.savedAt).toLocaleTimeString("ko-KR")}</span>}
          <Button
            onClick={async () => {
              await state.save();
              setSaved(true);
              setTimeout(() => setSaved(false), 1500);
            }}
          >
            {saved ? "✓ 저장했습니다" : "대시보드 설정 저장"}
          </Button>
          <Button onClick={() => downloadCsv(`${dataset.datasetName}_filtered.csv`, dataset.schemaDefinition, rows)}>CSV 내보내기</Button>
        </div>
      </div>
      <DatasetTabs id={id} active="analytics" />

      <div className="space-y-5">
        <Card className="p-4">
          <FilterBar dataset={dataset} filters={state.filters} onChange={state.setFilters} />
        </Card>

        {rows.length === 0 ? (
          <EmptyState title="필터 조건에 맞는 데이터가 없습니다">
            <button type="button" className="underline" onClick={() => state.setFilters([])}>필터 초기화</button>
          </EmptyState>
        ) : (
          <>
            <KpiCards kpis={kpis} />

            {!crm && measures.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 text-sm text-ink2">
                <label className="flex items-center gap-2">
                  분석 지표
                  <select className={selectCls} value={state.measureField ?? measures[0].key} onChange={(e) => state.setMeasureField(e.target.value)}>
                    {measures.map((m) => <option key={m.key}>{m.key}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  집계
                  <select className={selectCls} value={state.agg} onChange={(e) => state.setAgg(e.target.value as "sum" | "avg")}>
                    <option value="sum">합계</option>
                    <option value="avg">평균</option>
                  </select>
                </label>
                <span className="text-xs text-muted">차트의 막대·원을 클릭하면 모든 차트에 교차 필터가 적용됩니다.</span>
              </div>
            )}
            {crm && <p className="text-xs text-muted">차트의 막대·원·셀을 클릭하면 모든 차트에 교차 필터가 적용됩니다. 수주금액은 Won 거래 기준입니다.</p>}

            {charts.length === 0 ? (
              <EmptyState title="추천할 차트가 없습니다">수치·날짜·범주형 컬럼이 부족합니다. 프로파일 화면에서 컬럼 타입을 확인하세요.</EmptyState>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {charts.map((c) => (
                  <ChartCard
                    key={c.id}
                    spec={c}
                    rows={rows}
                    schema={dataset.schemaDefinition}
                    onSelect={(sel) => state.setFilters(toggleSelection(state.filters, sel))}
                  />
                ))}
              </div>
            )}

            <Card>
              <CardHeader title="상세 데이터" sub="현재 필터가 적용된 원본 행 (Drill-down)" />
              <div className="p-4"><DataTable dataset={dataset} rows={rows} showRaw /></div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
