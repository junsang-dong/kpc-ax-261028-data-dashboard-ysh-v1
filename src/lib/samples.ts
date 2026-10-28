import type { Dataset } from "@/types/dataset";
import { buildDataset } from "@/lib/analytics/build";
import { parseCsv } from "@/lib/parsers/csv";
import { saveDataset } from "@/lib/storage/db";

export const SAMPLES = [
  { file: "sales_pipeline.csv", name: "CRM 영업기회 (합성 샘플)", desc: "deal_stage·close_value 기반 CRM 템플릿 KPI가 자동 적용됩니다." },
  { file: "retail_orders.csv", name: "소매 주문 (합성 샘플)", desc: "날짜·지역·카테고리·매출이 있는 범용 분석 예시입니다." },
];

export async function importSample(file: string, name: string): Promise<Dataset> {
  const res = await fetch(`/samples/${file}`);
  if (!res.ok) throw new Error("샘플 파일을 불러오지 못했습니다.");
  const dataset = buildDataset(parseCsv(await res.arrayBuffer()), { name, fileName: file, sourceType: "sample" });
  await saveDataset(dataset);
  return dataset;
}
