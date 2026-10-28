export type ValueFormat = "number" | "currency" | "percent" | "days" | "ratio";

const compact = new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 });
const compactEn = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
const full = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });

export function formatValue(v: number | null | undefined, kind: ValueFormat = "number", short = false): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  switch (kind) {
    case "percent":
      return `${v.toFixed(1)}%`;
    case "days":
      return `${v.toFixed(1)}일`;
    case "ratio":
      return v.toFixed(2);
    case "currency":
      return short && Math.abs(v) >= 10_000 ? `$${compactEn.format(v)}` : `$${full.format(Math.round(v))}`;
    default:
      // 1만 미만은 '3천'처럼 줄이지 않고 전체 자릿수를 보여준다
      if (!short) return full.format(v);
      return Math.abs(v) >= 10_000 ? compact.format(v) : v % 1 ? full.format(v) : whole.format(v);
  }
}

export function daysBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000;
}
