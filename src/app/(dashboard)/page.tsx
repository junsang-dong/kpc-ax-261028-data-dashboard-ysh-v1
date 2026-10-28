"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Dataset } from "@/types/dataset";
import { deleteDataset, listDatasets } from "@/lib/storage/db";
import { importSample, SAMPLES } from "@/lib/samples";
import { Badge, Button, Card, CardHeader, EmptyState, Spinner } from "@/components/ui";

export default function WorkspacePage() {
  const [datasets, setDatasets] = useState<Dataset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listDatasets()
      .then((d) => setDatasets(d.sort((a, b) => b.lastUpdatedAt.localeCompare(a.lastUpdatedAt))))
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);
  useEffect(refresh, [refresh]);

  const load = async (file: string, name: string) => {
    setBusy(file);
    setError(null);
    try {
      await importSample(file, name);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const totalRows = datasets?.reduce((a, d) => a + d.rowCount, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">워크스페이스</h1>
        <p className="mt-1 text-sm text-ink2">
          Upload → Understand → Analyze → Visualize → Decide. 데이터를 올리면 스키마 인식, KPI, 차트, 근거 기반 인사이트가 자동으로 만들어집니다.
        </p>
      </div>

      {error && <p role="alert" className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-bad">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["등록 데이터셋", datasets?.length ?? "–"],
          ["전체 행 수", datasets ? totalRows.toLocaleString() : "–"],
          ["저장 위치", "이 브라우저 (IndexedDB)"],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-xs text-muted">{k}</p>
            <p className="tabular mt-1 text-xl font-semibold text-ink">{v}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader
          title="데이터셋"
          right={<Link href="/datasets" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">+ 데이터 가져오기</Link>}
        />
        <div className="p-4">
          {datasets === null ? (
            <Spinner />
          ) : datasets.length === 0 ? (
            <EmptyState title="아직 등록된 데이터셋이 없습니다">
              CSV·XLSX 파일을 올리거나 아래 샘플로 바로 시작해 보세요.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {datasets.map((d) => (
                <li key={d.datasetId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/analytics/${d.datasetId}`} className="truncate text-sm font-medium text-ink hover:underline">
                      {d.datasetName}
                    </Link>
                    <p className="tabular text-xs text-muted">
                      {d.rowCount.toLocaleString()}행 × {d.columnCount}열 · v{d.datasetVersion} · {new Date(d.lastUpdatedAt).toLocaleString("ko-KR")}
                    </p>
                  </div>
                  <Badge>{d.sourceType === "sample" ? "샘플" : d.sourceType.toUpperCase()}</Badge>
                  {d.dataQuality.issues.some((i) => i.severity !== "info") && <Badge tone="warn">품질 주의 {d.dataQuality.issues.filter((i) => i.severity !== "info").length}</Badge>}
                  <div className="flex gap-1.5">
                    <Link className="rounded-lg border border-line px-2.5 py-1 text-sm hover:bg-surface2" href={`/datasets/${d.datasetId}`}>프로파일</Link>
                    <Link className="rounded-lg border border-line px-2.5 py-1 text-sm hover:bg-surface2" href={`/insights/${d.datasetId}`}>인사이트</Link>
                    <Button
                      variant="danger"
                      onClick={async () => {
                        if (confirm(`'${d.datasetName}'과(와) 저장된 대시보드 설정을 삭제할까요? 되돌릴 수 없습니다.`)) {
                          await deleteDataset(d.datasetId);
                          refresh();
                        }
                      }}
                    >
                      삭제
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="샘플 데이터로 시작하기" sub="합성 데이터이며 실제 고객 정보가 아닙니다." />
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {SAMPLES.map((s) => (
            <div key={s.file} className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{s.name}</p>
                <p className="text-xs text-muted">{s.desc}</p>
              </div>
              <Button disabled={busy !== null} onClick={() => load(s.file, s.name)}>
                {busy === s.file ? "추가 중…" : "추가"}
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
