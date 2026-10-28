"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ColumnSchema, Row } from "@/types/dataset";
import type { ChartSpec } from "@/lib/analytics/charts";
import { runQuery } from "@/lib/analytics/query";
import { formatValue } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui";

export interface Selection {
  field: string;
  value: string;
}

interface Props {
  spec: ChartSpec;
  rows: Row[];
  schema: ColumnSchema[];
  onSelect: (sel: Selection[]) => void;
}

const color = (i: number) => `var(--series-${(i % 8) + 1})`;
const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--ink)",
  fontSize: 12,
};
const NULL_LABEL = "(결측)";

interface TableData {
  headers: string[];
  body: string[][];
}

export function ChartCard({ spec, rows, schema, onSelect }: Props) {
  const [asTable, setAsTable] = useState(false);

  const computed = useMemo(() => build(spec, rows, schema), [spec, rows, schema]);
  const { table, sourceRows, empty } = computed;

  return (
    <Card className="flex flex-col">
      <CardHeader
        title={spec.title}
        sub={`${spec.reason} · 근거 ${sourceRows.toLocaleString()}행`}
        right={
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            className="shrink-0 rounded-md border border-line px-2 py-0.5 text-xs text-ink2 hover:bg-surface2"
            aria-pressed={asTable}
          >
            {asTable ? "차트" : "표"}
          </button>
        }
      />
      <div className="min-h-[280px] flex-1 px-2 pb-3 pt-2">
        {empty ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted">
            현재 필터 조건에 해당하는 데이터가 없습니다.
          </div>
        ) : asTable ? (
          <DataTableView table={table} />
        ) : (
          <Plot spec={spec} computed={computed} onSelect={onSelect} />
        )}
      </div>
    </Card>
  );
}

function DataTableView({ table }: { table: TableData }) {
  return (
    <div className="max-h-[260px] overflow-auto px-2">
      <table className="tabular w-full text-left text-xs">
        <thead className="sticky top-0 bg-surface text-muted">
          <tr>
            {table.headers.map((h) => (
              <th key={h} className="py-1 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.body.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {r.map((c, j) => (
                <td key={j} className="py-1 pr-3 text-ink2">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Point = Record<string, string | number | null>;
interface Computed {
  data: Point[];
  table: TableData;
  sourceRows: number;
  empty: boolean;
  keys: { id: string; label: string }[];
  matrix?: { xs: string[]; ys: string[]; cells: Map<string, number>; max: number };
  scatter?: { x: number; y: number }[];
}

function build(spec: ChartSpec, rows: Row[], schema: ColumnSchema[]): Computed {
  const keys = spec.measures.map((m) => ({ id: m.id, label: m.label ?? m.id }));
  const fmt = (v: unknown) => (typeof v === "number" ? formatValue(v, spec.format) : String(v ?? ""));

  if (spec.type === "scatter" && spec.scatter) {
    const { x, y } = spec.scatter;
    const pts: { x: number; y: number }[] = [];
    for (const r of rows) {
      const a = r[x];
      const b = r[y];
      if (typeof a === "number" && typeof b === "number") pts.push({ x: a, y: b });
    }
    const step = Math.max(1, Math.ceil(pts.length / 1000));
    const sample = pts.filter((_, i) => i % step === 0);
    return {
      data: [],
      scatter: sample,
      keys,
      sourceRows: pts.length,
      empty: !pts.length,
      table: { headers: [x, y], body: sample.slice(0, 200).map((p) => [String(p.x), String(p.y)]) },
    };
  }

  if (spec.type === "heatmap" && spec.dimension && spec.dimension2) {
    const res = runQuery(rows, schema, {
      metrics: spec.measures,
      dimensions: [spec.dimension, spec.dimension2],
      limit: 1000,
    });
    const cells = new Map<string, number>();
    const xs = new Set<string>();
    const ys = new Set<string>();
    let max = 0;
    for (const r of res.rows) {
      const a = String(r[spec.dimension] ?? NULL_LABEL);
      const b = String(r[spec.dimension2] ?? NULL_LABEL);
      const v = (r[spec.measures[0].id] as number) ?? 0;
      xs.add(a);
      ys.add(b);
      cells.set(`${a}\u0001${b}`, v);
      max = Math.max(max, v);
    }
    const xl = [...xs].sort();
    const yl = [...ys].sort();
    return {
      data: [],
      keys,
      matrix: { xs: xl, ys: yl, cells, max },
      sourceRows: res.sourceRowCount,
      empty: !res.rows.length,
      table: {
        headers: [spec.dimension, ...yl],
        body: xl.map((a) => [a, ...yl.map((b) => String(cells.get(`${a}\u0001${b}`) ?? 0))]),
      },
    };
  }

  const dim = spec.dimension!;
  const isTime = spec.type === "line";
  const res = runQuery(rows, schema, {
    metrics: spec.measures,
    dimensions: [dim],
    timeGrain: spec.grain,
    limit: isTime ? undefined : spec.limit ?? 50,
    sortBy: isTime ? dim : spec.measures[0].id,
    sortDir: isTime ? "asc" : "desc",
  });
  const data: Point[] = res.rows
    .filter((r) => !(isTime && r[dim] === null))
    .map((r) => {
      const p: Point = { name: r[dim] === null ? NULL_LABEL : String(r[dim]) };
      for (const k of keys) p[k.id] = r[k.id] as number | null;
      return p;
    });
  return {
    data,
    keys,
    sourceRows: res.sourceRowCount,
    empty: !data.length,
    table: {
      headers: [dim, ...keys.map((k) => k.label)],
      body: data.map((p) => [String(p.name), ...keys.map((k) => fmt(p[k.id]))]),
    },
  };
}

function Plot({ spec, computed, onSelect }: { spec: ChartSpec; computed: Computed; onSelect: Props["onSelect"] }) {
  const { data, keys } = computed;
  const fmtShort = (v: number) => formatValue(v, spec.format, true);
  const fmtTip = (v: unknown) => formatValue(typeof v === "number" ? v : null, spec.format);

  if (spec.type === "line") {
    const multi = keys.length > 1;
    return (
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tickFormatter={fmtShort} tickLine={false} axisLine={false} width={56} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [fmtTip(v), n]} />
          {multi && <Legend iconType="plainline" />}
          {keys.map((k, i) => (
            <Line
              key={k.id}
              type="linear"
              dataKey={k.id}
              name={k.label}
              stroke={color(i)}
              strokeWidth={2}
              dot={data.length <= 24 ? { r: 3 } : false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)" }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (spec.type === "bar") {
    const k = keys[0];
    const height = Math.max(220, data.length * 28 + 24);
    return (
      <ResponsiveContainer width="100%" height={Math.min(height, 340)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" tickFormatter={fmtShort} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} interval={0} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} contentStyle={tooltipStyle} formatter={(v) => [fmtTip(v), k.label]} />
          <Bar
            dataKey={k.id}
            name={k.label}
            fill="var(--series-1)"
            radius={[0, 4, 4, 0]}
            barSize={14}
            cursor="pointer"
            onClick={(_, i) => spec.dimension && onSelect([{ field: spec.dimension, value: String(data[i].name) }])}
          />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (spec.type === "donut") {
    const k = keys[0];
    const total = data.reduce((a, p) => a + ((p[k.id] as number) ?? 0), 0);
    return (
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center">
        <div className="w-full sm:w-1/2">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [fmtTip(v), n]} />
              <Pie
                data={data}
                dataKey={k.id}
                nameKey="name"
                innerRadius="58%"
                outerRadius="90%"
                paddingAngle={2}
                stroke="var(--surface)"
                strokeWidth={2}
                cursor="pointer"
                onClick={(_, i) => spec.dimension && onSelect([{ field: spec.dimension, value: String(data[i].name) }])}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={color(i)} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="w-full space-y-1 px-2 text-xs sm:w-1/2">
          {data.map((p, i) => (
            <li key={String(p.name)}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-surface2"
                onClick={() => spec.dimension && onSelect([{ field: spec.dimension, value: String(p.name) }])}
              >
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: color(i) }} />
                <span className="min-w-0 flex-1 truncate text-ink">{String(p.name)}</span>
                <span className="tabular text-ink2">
                  {total ? `${((((p[k.id] as number) ?? 0) / total) * 100).toFixed(1)}%` : "–"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (spec.type === "scatter" && computed.scatter && spec.scatter) {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
          <CartesianGrid />
          <XAxis type="number" dataKey="x" name={spec.scatter.x} tickFormatter={(v) => formatValue(v, "number", true)} tickLine={false} axisLine={false} label={{ value: spec.scatter.x, position: "insideBottom", offset: -8, fill: "var(--ink-2)", fontSize: 12 }} />
          <YAxis type="number" dataKey="y" name={spec.scatter.y} tickFormatter={(v) => formatValue(v, "number", true)} tickLine={false} axisLine={false} width={56} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={tooltipStyle} />
          <Scatter data={computed.scatter} fill="var(--series-1)" fillOpacity={0.55} stroke="var(--surface)" />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (spec.type === "heatmap" && computed.matrix && spec.dimension && spec.dimension2) {
    const { xs, ys, cells, max } = computed.matrix;
    return (
      <div className="overflow-auto px-2">
        <div
          className="tabular grid gap-0.5 text-xs"
          style={{ gridTemplateColumns: `minmax(90px,auto) repeat(${ys.length}, minmax(56px,1fr))` }}
        >
          <div />
          {ys.map((y) => (
            <div key={y} className="truncate px-1 pb-1 text-center text-muted" title={y}>
              {y}
            </div>
          ))}
          {xs.map((x) => (
            <HeatRow key={x} x={x} ys={ys} cells={cells} max={max} onSelect={(y) => onSelect([{ field: spec.dimension!, value: x }, { field: spec.dimension2!, value: y }])} />
          ))}
        </div>
      </div>
    );
  }
  return null;
}

function HeatRow({
  x,
  ys,
  cells,
  max,
  onSelect,
}: {
  x: string;
  ys: string[];
  cells: Map<string, number>;
  max: number;
  onSelect: (y: string) => void;
}) {
  return (
    <>
      <div className="truncate pr-2 text-right text-ink2" title={x}>
        {x}
      </div>
      {ys.map((y) => {
        const v = cells.get(`${x}\u0001${y}`) ?? 0;
        const pct = max ? Math.round((v / max) * 100) : 0;
        return (
          <button
            key={y}
            type="button"
            title={`${x} × ${y}: ${v.toLocaleString()}`}
            onClick={() => onSelect(y)}
            className="rounded px-1 py-2 text-center text-ink hover:outline-2 hover:outline-accent"
            style={{ background: `color-mix(in srgb, var(--seq-1) ${pct}%, var(--seq-0))`, color: pct > 55 ? "#fff" : "var(--ink)" }}
          >
            {v.toLocaleString()}
          </button>
        );
      })}
    </>
  );
}
