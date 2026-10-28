"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Dataset, Filter } from "@/types/dataset";
import { getDashboard, getDataset, saveDashboard } from "@/lib/storage/db";

export function useDataset(id: string) {
  const [state, setState] = useState<{ dataset?: Dataset; loading: boolean; error?: string }>({ loading: true });
  const load = useCallback(() => {
    getDataset(id)
      .then((dataset) =>
        setState(dataset ? { dataset, loading: false } : { loading: false, error: "데이터셋을 찾을 수 없습니다." }),
      )
      .catch((e) => setState({ loading: false, error: String(e?.message ?? e) }));
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load };
}

export interface DashboardState {
  filters: Filter[];
  setFilters: (f: Filter[]) => void;
  measureField?: string;
  setMeasureField: (m?: string) => void;
  agg: "sum" | "avg";
  setAgg: (a: "sum" | "avg") => void;
  save: () => Promise<void>;
  savedAt?: string;
  ready: boolean;
}

/** 필터·지표 선택 상태. 저장된 대시보드 설정이 있으면 복원한다. */
export function useDashboardState(datasetId: string): DashboardState {
  const [filters, setFilters] = useState<Filter[]>([]);
  const [measureField, setMeasureField] = useState<string | undefined>();
  const [agg, setAgg] = useState<"sum" | "avg">("sum");
  const [savedAt, setSavedAt] = useState<string | undefined>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    getDashboard(datasetId)
      .then((c) => {
        if (!alive) return;
        if (c) {
          setFilters(c.filters);
          setMeasureField(c.measureField);
          setAgg(c.agg);
          setSavedAt(c.savedAt);
        }
      })
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [datasetId]);

  const save = useCallback(async () => {
    const savedAt = new Date().toISOString();
    await saveDashboard({ datasetId, filters, measureField, agg, savedAt });
    setSavedAt(savedAt);
  }, [datasetId, filters, measureField, agg]);

  return { filters, setFilters, measureField, setMeasureField, agg, setAgg, save, savedAt, ready };
}

const storageListeners = new Set<() => void>();

/** localStorage 문자열 값 (서버·미지원 환경에서는 null). 쓰기 실패는 무시한다. */
export function useStoredString(key: string): [string | null, (v: string | null) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      storageListeners.add(cb);
      return () => storageListeners.delete(cb);
    },
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const set = useCallback(
    (v: string | null) => {
      try {
        if (v === null) localStorage.removeItem(key);
        else localStorage.setItem(key, v);
      } catch {}
      storageListeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set];
}
