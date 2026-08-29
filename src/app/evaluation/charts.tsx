"use client";

import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

/**
 * The two charts the tables cannot show.
 *
 * A table is the right way to read six configurations against seven metrics,
 * and it stays. What a table hides is shape: how the configurations converge as
 * k grows, and what reranking actually costs to buy the quality it buys. Both
 * of those are the argument this page is making, so both get drawn.
 *
 * Colours come from the same CSS variables as the rest of the site, passed
 * straight through to SVG, so the charts follow the light and dark themes
 * without a second palette to keep in sync.
 */

export interface ConfigPoint {
  name: string;
  recallAt: Record<string, number>;
  ndcg: number;
  mrr: number;
  medianLatencyMs: number;
}

const SERIES_COLOURS = [
  "var(--fg-faint)",
  "var(--accent)",
  "color-mix(in srgb, var(--accent) 55%, transparent)",
  "var(--near)",
  "color-mix(in srgb, var(--accent) 80%, transparent)",
  "var(--verified)",
];

const AXIS = {
  stroke: "var(--fg-faint)",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
};

const TOOLTIP_STYLE = {
  background: "var(--elevated)",
  border: "1px solid var(--line-strong)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--fg)",
  padding: "8px 10px",
} as const;

export function RecallCurve({ configs }: { configs: ConfigPoint[] }) {
  // One row per k, one column per configuration — the shape Recharts wants for
  // a multi-line chart.
  const data = [1, 3, 5, 10].map((k) => {
    const row: Record<string, number | string> = { k: `@${k}` };
    for (const config of configs) row[config.name] = +(config.recallAt[String(k)] * 100).toFixed(1);
    return row;
  });

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="k" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ stroke: "var(--line-strong)" }}
            // Recharts types the formatter's value as possibly undefined, so
            // the narrowing is done here rather than asserted away.
            formatter={(value, name) => [
              typeof value === "number" ? `${value}%` : String(value ?? "—"),
              String(name ?? ""),
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="plainline"
            iconSize={14}
          />
          {configs.map((config, i) => (
            <Line
              key={config.name}
              type="monotone"
              dataKey={config.name}
              stroke={SERIES_COLOURS[i % SERIES_COLOURS.length]}
              strokeWidth={2}
              dot={{ r: 2.5, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function QualityAgainstLatency({ configs }: { configs: ConfigPoint[] }) {
  // Latency spans four orders of magnitude — one millisecond for a flat scan,
  // eleven seconds for a model call — so the axis is logarithmic. On a linear
  // axis every configuration except the reranked one collapses onto zero.
  const data = configs.map((config, i) => ({
    x: Math.max(config.medianLatencyMs, 1),
    y: +(config.ndcg * 100).toFixed(1),
    name: config.name,
    fill: SERIES_COLOURS[i % SERIES_COLOURS.length],
  }));

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 12, right: 20, bottom: 20, left: -12 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="x"
            scale="log"
            domain={[1, 20000]}
            ticks={[1, 10, 100, 1000, 10000]}
            tick={AXIS}
            tickLine={false}
            axisLine={{ stroke: "var(--line)" }}
            tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}s` : `${v}ms`)}
            label={{
              value: "median latency (log scale)",
              position: "insideBottom",
              offset: -12,
              fill: "var(--fg-faint)",
              fontSize: 11,
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}`}
          />
          <ZAxis range={[130, 130]} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ strokeDasharray: "3 3", stroke: "var(--line-strong)" }}
            formatter={(value, key) => {
              const n = typeof value === "number" ? value : Number(value ?? 0);
              return key === "x"
                ? [n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n} ms`, "latency"]
                : [`${n}`, "nDCG@10 ×100"];
            }}
            labelFormatter={() => ""}
          />
          <Scatter data={data} isAnimationActive={false}>
            {data.map((point) => (
              <Cell key={point.name} fill={point.fill} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
