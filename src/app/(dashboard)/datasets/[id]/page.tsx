"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import type { DataType } from "@/types/dataset";
import { buildDataset } from "@/lib/analytics/build";
import { useDataset } from "@/lib/hooks";
import { saveDataset } from "@/lib/storage/db";
import { DatasetTabs } from "@/components/dashboard/Shell";
import { DataTable } from "@/components/dashboard/DataTable";
import { QualityReport, SchemaTable } from "@/components/dashboard/SchemaTable";
import { Badge, Card, CardHeader, EmptyState, Spinner } from "@/components/ui";

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { dataset, loading, error, reload } = useDataset(id);
  const [saving, setSaving] = useState(false);

  if (loading) return <Spinner />;
  if (error || !dataset) return <EmptyState title={error ?? "데이터셋을 찾을 수 없습니다."} />;

  /** 타입 수정 → 원본 값에서 재정제하여 새 버전으로 저장 */
  const changeType = async (key: string, type: DataType) => {
    setSaving(true);
    const overrides = Object.fromEntries(dataset.schemaDefinition.map((c) => [c.key, c.dataType])) as Record<string, DataType>;
    overrides[key] = type;
    const rebuilt = buildDataset(
      { headers: dataset.schemaDefinition.map((c) => c.originalName), rows: dataset.rawRows, warnings: [] },
      {
        name: dataset.datasetName,
        fileName: dataset.originalFileName,
        sourceType: dataset.sourceType,
        datasetId: dataset.datasetId,
        workspaceId: dataset.workspaceId,
        version: dataset.datasetVersion + 1,
        typeOverrides: overrides,
      },
    );
    await saveDataset(rebuilt);
    reload();
    setSaving(false);
  };

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{dataset.datasetName}</h1>
        <p className="tabular mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge>{dataset.sourceType === "sample" ? "샘플" : dataset.sourceType.toUpperCase()}</Badge>
          {dataset.originalFileName} · {dataset.rowCount.toLocaleString()}행 × {dataset.columnCount}열 · v{dataset.datasetVersion} ·{" "}
          {new Date(dataset.lastUpdatedAt).toLocaleString("ko-KR")}
        </p>
      </div>
      <DatasetTabs id={id} active="profile" />
      <div className="space-y-5">
        <Card>
          <CardHeader title="컬럼 스키마" sub="타입을 바꾸면 원본 값에서 다시 정제하고 데이터셋 버전이 올라갑니다." right={saving ? <Badge>저장 중…</Badge> : undefined} />
          <div className="p-4"><SchemaTable schema={dataset.schemaDefinition} onTypeChange={changeType} /></div>
        </Card>
        <Card>
          <CardHeader title="데이터 품질 리포트" />
          <div className="p-4"><QualityReport dataset={dataset} /></div>
        </Card>
        <Card>
          <CardHeader title="데이터 미리보기" sub="정제 값 기준 · '원본 값 표시'로 업로드 당시 값을 확인할 수 있습니다." />
          <div className="p-4"><DataTable dataset={dataset} rows={dataset.rows} showRaw /></div>
        </Card>
      </div>
    </div>
  );
}
