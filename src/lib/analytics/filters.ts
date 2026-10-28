import type { Cell, Filter } from "@/types/dataset";

/** 차트 클릭(교차 필터): 같은 값을 다시 누르면 해제, 아니면 해당 필드를 그 값으로 제한 */
export function toggleSelection(filters: Filter[], sels: { field: string; value: string }[]): Filter[] {
  let next = filters;
  for (const { field, value } of sels) {
    const cur = next.find((f) => f.field === field && f.operator === "in");
    const same = cur && Array.isArray(cur.value) && cur.value.length === 1 && cur.value[0] === value;
    next = next.filter((f) => !(f.field === field && f.operator === "in"));
    if (!same) next = [...next, { field, operator: "in", value: [value] }];
  }
  return next;
}

export function setInFilter(filters: Filter[], field: string, values: Cell[]): Filter[] {
  const rest = filters.filter((f) => !(f.field === field && f.operator === "in"));
  return values.length ? [...rest, { field, operator: "in", value: values }] : rest;
}

export function setDateFilter(filters: Filter[], field: string, from: string, to: string): Filter[] {
  const rest = filters.filter((f) => !(f.operator === "between"));
  if (!from && !to) return rest;
  return [...rest, { field, operator: "between", value: [from || null, to || null] }];
}

export function describeFilter(f: Filter): string {
  if (f.operator === "between" && Array.isArray(f.value)) return `${f.field}: ${f.value[0] ?? "…"} ~ ${f.value[1] ?? "…"}`;
  if (Array.isArray(f.value)) return `${f.field}: ${f.value.join(", ")}`;
  return `${f.field} ${f.operator} ${f.value}`;
}
