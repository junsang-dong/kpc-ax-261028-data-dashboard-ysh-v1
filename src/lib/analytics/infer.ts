import type { Cell, DataType, SemanticType } from "@/types/dataset";

const MISSING = new Set(["", "null", "na", "n/a", "nan", "none", "-", "#n/a"]);
const BOOL_TRUE = new Set(["true", "yes", "y", "예"]);
const BOOL_FALSE = new Set(["false", "no", "n", "아니오"]);
const ID_NAME = /(^|[_\s-])(id|key|code|no|num)$|^(id|key)([_\s-]|$)|번호|코드|식별/i;

export function isMissing(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "number") return Number.isNaN(v);
  if (typeof v === "string") return MISSING.has(v.trim().toLowerCase());
  return false;
}

export function toISODate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseDate(v: unknown): string | null {
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  }
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (!m) return null;
  return toISODate(+m[1], +m[2], +m[3]);
}

/** 형태는 날짜(YYYY-MM-DD)이지만 실제로 존재하지 않는 날짜인지 */
export function looksLikeDate(v: unknown): boolean {
  return typeof v === "string" && /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(v.trim());
}

export function parseNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/^[$₩€£¥]\s*/, "").replace(/\s*(%|원)$/, "");
  if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

export function parseBoolean(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (BOOL_TRUE.has(s)) return true;
  if (BOOL_FALSE.has(s)) return false;
  return null;
}

export function inferType(values: unknown[]): DataType {
  const present = values.filter((v) => !isMissing(v));
  if (!present.length) return "string";
  const share = (fn: (v: unknown) => boolean) => present.filter(fn).length / present.length;
  // 0/1 숫자 컬럼은 boolean이 아닌 number로 유지 (true/false 계열 문자열만 boolean)
  if (share((v) => typeof v === "boolean" || (typeof v === "string" && parseBoolean(v) !== null)) >= 0.95) {
    return "boolean";
  }
  if (share((v) => v instanceof Date || parseDate(v) !== null) >= 0.9) return "date";
  if (share((v) => parseNumber(v) !== null) >= 0.9) return "number";
  return "string";
}

export function convertValue(v: unknown, type: DataType): { value: Cell; mismatch: boolean } {
  if (isMissing(v)) return { value: null, mismatch: false };
  switch (type) {
    case "number": {
      const n = parseNumber(v);
      return n === null ? { value: null, mismatch: true } : { value: n, mismatch: false };
    }
    case "date": {
      const d = parseDate(v);
      return d === null ? { value: null, mismatch: true } : { value: d, mismatch: false };
    }
    case "boolean": {
      const b = parseBoolean(v);
      return b === null ? { value: null, mismatch: true } : { value: b, mismatch: false };
    }
    default:
      return { value: v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim(), mismatch: false };
  }
}

export function inferSemanticType(
  name: string,
  dataType: DataType,
  cleaned: Cell[],
): SemanticType {
  if (dataType === "boolean") return "boolean";
  if (dataType === "date") return "temporal";
  const present = cleaned.filter((v) => v !== null);
  const unique = new Set(present).size;
  const uniqueRatio = present.length ? unique / present.length : 0;
  const idByName = ID_NAME.test(name.trim());
  if (dataType === "number") {
    const integers = present.every((v) => Number.isInteger(v));
    if (idByName && (uniqueRatio > 0.5 || !present.length)) return "identifier";
    if (integers && present.length > 20 && uniqueRatio > 0.98 && idByName) return "identifier";
    return "numeric";
  }
  if (idByName && uniqueRatio > 0.5) return "identifier";
  if (uniqueRatio > 0.9 && present.length > 20) {
    const avgLen = present.reduce((a: number, v) => a + String(v).length, 0) / present.length;
    return avgLen > 30 ? "text" : "identifier";
  }
  if (unique <= 100 || uniqueRatio <= 0.5) return "categorical";
  return "text";
}
