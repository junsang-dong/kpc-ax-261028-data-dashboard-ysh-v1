import type { Dataset, Filter } from "@/types/dataset";

/**
 * Phase 1 저장소: 브라우저 IndexedDB.
 * Phase 2에서 Neon PostgreSQL + Vercel Blob으로 교체할 수 있도록 함수 단위로 분리했다.
 */
const DB_NAME = "nxp-data-insight";
const DATASETS = "datasets";
const DASHBOARDS = "dashboards";

export interface DashboardConfig {
  datasetId: string;
  filters: Filter[];
  measureField?: string;
  agg: "sum" | "avg";
  savedAt: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DATASETS)) db.createObjectStore(DATASETS, { keyPath: "datasetId" });
      if (!db.objectStoreNames.contains(DASHBOARDS)) db.createObjectStore(DASHBOARDS, { keyPath: "datasetId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const saveDataset = (d: Dataset) => tx(DATASETS, "readwrite", (s) => s.put(d));
export const getDataset = (id: string) => tx<Dataset | undefined>(DATASETS, "readonly", (s) => s.get(id));
export const listDatasets = () => tx<Dataset[]>(DATASETS, "readonly", (s) => s.getAll());
export async function deleteDataset(id: string) {
  await tx(DATASETS, "readwrite", (s) => s.delete(id));
  await tx(DASHBOARDS, "readwrite", (s) => s.delete(id));
}
export const saveDashboard = (c: DashboardConfig) => tx(DASHBOARDS, "readwrite", (s) => s.put(c));
export const getDashboard = (id: string) => tx<DashboardConfig | undefined>(DASHBOARDS, "readonly", (s) => s.get(id));
