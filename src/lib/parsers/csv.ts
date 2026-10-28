import Papa from "papaparse";
import type { RawTable } from "@/types/dataset";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export interface CsvParseResult extends RawTable {
  encoding: string;
  delimiter: string;
}

/** UTF-8(BOM 포함)을 우선 시도하고, 실패하면 한국어 환경에서 흔한 EUC-KR(CP949)로 해석한다. */
export function decodeText(buffer: ArrayBuffer): { text: string; encoding: string } {
  const bytes = new Uint8Array(buffer);
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    // TextDecoder는 BOM을 자동으로 제거하므로 바이트로 직접 확인한다
    const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    return { text: text.charCodeAt(0) === 0xfeff ? text.slice(1) : text, encoding: hasBom ? "UTF-8 (BOM)" : "UTF-8" };
  } catch {
    return { text: new TextDecoder("euc-kr").decode(bytes), encoding: "EUC-KR" };
  }
}

export function parseCsv(buffer: ArrayBuffer): CsvParseResult {
  const { text, encoding } = decodeText(buffer);
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t"],
  });
  const warnings: string[] = [];
  const data = result.data;
  if (!data.length) {
    return { headers: [], rows: [], warnings: ["데이터가 비어 있는 파일입니다."], encoding, delimiter: "," };
  }
  const headers = data[0].map((h) => String(h ?? ""));
  const rows = data.slice(1);
  const ragged = rows.filter((r) => r.length !== headers.length).length;
  if (ragged) {
    warnings.push(`컬럼 수가 헤더와 다른 행 ${ragged}건이 있어 빈 값으로 보정했습니다.`);
  }
  const delimiter = result.meta.delimiter;
  return { headers, rows, warnings, encoding, delimiter };
}

export function delimiterLabel(d: string): string {
  return d === "\t" ? "탭" : d === ";" ? "세미콜론(;)" : d === "," ? "쉼표(,)" : d;
}
