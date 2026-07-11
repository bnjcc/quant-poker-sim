"use client";

import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { BreakdownRow } from "@/lib/analytics/aggregate";

const AXIS = { stroke: "var(--muted)", fontSize: 11, fontFamily: "var(--font-mono)" };
const TOOLTIP_STYLE = {
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--ink)",
};

export function EquityCurve({ points, stride, label = "cumulative bb" }: { points: number[]; stride: number; label?: string }) {
  const data = points.map((y, i) => ({ x: i * stride, y: Number(y.toFixed(1)) }));
  const last = points[points.length - 1] ?? 0;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" />
        <XAxis dataKey="x" {...AXIS} tickLine={false} />
        <YAxis {...AXIS} tickLine={false} width={54} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v} bb`, label]} labelFormatter={(l) => `hand ${l}`} />
        <ReferenceLine y={0} stroke="var(--muted)" strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="y"
          stroke={last >= 0 ? "var(--gain)" : "var(--loss)"}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BreakdownBars({
  rows,
  metric = "bb100",
  order,
}: {
  rows: Record<string, BreakdownRow>;
  metric?: "bb100" | "net";
  order?: string[];
}) {
  const keys = order ? order.filter((k) => rows[k]) : Object.keys(rows);
  const data = keys.map((k) => ({
    name: k,
    value: Number((metric === "bb100" ? rows[k].bb100 : rows[k].net).toFixed(1)),
    hands: rows[k].hands,
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="name" {...AXIS} tickLine={false} />
        <YAxis {...AXIS} tickLine={false} width={54} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v, _n, item) => [`${v} ${metric === "bb100" ? "bb/100" : "chips"} · ${item?.payload?.hands} hands`, ""]}
        />
        <ReferenceLine y={0} stroke="var(--muted)" />
        <Bar dataKey="value" isAnimationActive={false} radius={[3, 3, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.value >= 0 ? "var(--gain)" : "var(--loss)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function FrequencyBars({ counts, color = "var(--info)" }: { counts: Record<string, number>; color?: string }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const data = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([name, v]) => ({ name, pct: Number(((v / total) * 100).toFixed(1)), n: v }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="name" {...AXIS} tickLine={false} />
        <YAxis {...AXIS} tickLine={false} width={40} unit="%" />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, _n, item) => [`${v}% (${item?.payload?.n})`, ""]} />
        <Bar dataKey="pct" fill={color} isAnimationActive={false} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const BET_BUCKET_LABELS = ["<⅓ pot", "⅓–½", "½–¾", "¾–1x", "1–1.5x", ">1.5x"];
export function BetSizeChart({ hist }: { hist: number[] }) {
  const counts = Object.fromEntries(BET_BUCKET_LABELS.map((l, i) => [l, hist[i] ?? 0]));
  return <FrequencyBars counts={counts} color="var(--accent)" />;
}

const HM_RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

/** 13x13 starting-hand grid: suited above the diagonal, offsuit below. */
export function StartingHandHeatmap({ rows }: { rows: Record<string, BreakdownRow> }) {
  const max = Math.max(1, ...Object.values(rows).map((r) => Math.abs(r.bb100)));
  return (
    <div>
      <div className="grid gap-px" style={{ gridTemplateColumns: "repeat(13, minmax(0,1fr))" }}>
        {HM_RANKS.map((r1, i) =>
          HM_RANKS.map((r2, j) => {
            const key = i === j ? r1 + r2 : i < j ? r1 + r2 + "s" : r2 + r1 + "o";
            const row = rows[key];
            const v = row ? row.bb100 : null;
            const alpha = v === null ? 0 : Math.min(0.85, 0.15 + (Math.abs(v) / max) * 0.7);
            const bg =
              v === null
                ? "var(--panel-2)"
                : v >= 0
                  ? `rgba(79,195,138,${alpha})`
                  : `rgba(226,99,91,${alpha})`;
            return (
              <div
                key={key}
                className="mono aspect-square flex items-center justify-center text-[9px] rounded-[2px] cursor-default"
                style={{ background: bg, color: v === null ? "var(--muted)" : "var(--ink)" }}
                title={row ? `${key}: ${row.bb100.toFixed(1)} bb/100 over ${row.hands} hands` : `${key}: not dealt`}
              >
                {key}
              </div>
            );
          }),
        )}
      </div>
      <div className="text-[11px] text-muted mt-2">
        Green = won, red = lost (bb/100). Cells without data were never dealt. Per-hand samples are tiny — treat as
        descriptive, not predictive.
      </div>
    </div>
  );
}
