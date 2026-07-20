const CHART_WIDTH = 720;
const CHART_HEIGHT = 240;
const CHART_PAD = { top: 14, right: 16, bottom: 28, left: 58 };

export function AnalyticsHighlights({ items, label = "Section highlights" }) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4 pt-3 border-t border-line"
      role="group"
      aria-label={label}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-line bg-panel2 px-3 py-2.5 min-w-0"
        >
          <div className="label">{item.label}</div>
          <div className="mono text-sm font-bold text-ink mt-1 break-words leading-snug">
            {item.value}
          </div>
          {item.detail && (
            <div className="text-[11px] text-muted mt-0.5 leading-relaxed">
              {item.detail}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function compactNumber(value) {
  const absolute = Math.abs(value);
  if (absolute >= 1000)
    return `${(value / 1000).toFixed(absolute >= 10000 ? 0 : 1)}k`;
  if (absolute >= 100) return value.toFixed(0);
  if (absolute >= 10) return value.toFixed(1);
  return value.toFixed(2);
}
function samplePoints(points, limit = 320) {
  if (points.length <= limit)
    return points.map((value, index) => ({ index, value }));
  return Array.from({ length: limit }, (_, position) => {
    const index = Math.round((position * (points.length - 1)) / (limit - 1));
    return { index, value: points[index] };
  });
}
export function EquityCurve({ points, stride, label = "cumulative bb" }) {
  if (points.length === 0) {
    return (
      <div className="native-line-chart flex items-center justify-center text-sm text-muted">
        No equity data yet.
      </div>
    );
  }
  const sampled = samplePoints(points);
  let minimum = Math.min(0, ...sampled.map((point) => point.value));
  let maximum = Math.max(0, ...sampled.map((point) => point.value));
  if (minimum === maximum) {
    minimum -= 1;
    maximum += 1;
  }
  const plotWidth = CHART_WIDTH - CHART_PAD.left - CHART_PAD.right;
  const plotHeight = CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;
  const xFor = (index) =>
    CHART_PAD.left + (index / Math.max(1, points.length - 1)) * plotWidth;
  const yFor = (value) =>
    CHART_PAD.top + ((maximum - value) / (maximum - minimum)) * plotHeight;
  const path = sampled
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${xFor(point.index).toFixed(1)},${yFor(point.value).toFixed(1)}`,
    )
    .join(" ");
  const last = points[points.length - 1];
  const gridValues = Array.from(
    { length: 5 },
    (_, index) => maximum - ((maximum - minimum) * index) / 4,
  );
  const finalHand = (points.length - 1) * stride;
  return (
    <div
      className="native-line-chart"
      role="img"
      aria-label={`${label}: ${compactNumber(last)} after ${finalHand.toLocaleString()} hands`}
    >
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {gridValues.map((value) => {
          const y = yFor(value);
          return (
            <g key={value}>
              <line
                className="native-chart-grid"
                x1={CHART_PAD.left}
                x2={CHART_WIDTH - CHART_PAD.right}
                y1={y}
                y2={y}
              />
              <text
                className="native-chart-axis"
                x={CHART_PAD.left - 8}
                y={y + 4}
                textAnchor="end"
              >
                {compactNumber(value)}
              </text>
            </g>
          );
        })}
        <line
          x1={CHART_PAD.left}
          x2={CHART_WIDTH - CHART_PAD.right}
          y1={yFor(0)}
          y2={yFor(0)}
          stroke="var(--muted)"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path}
          fill="none"
          stroke={last >= 0 ? "var(--gain)" : "var(--loss)"}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="native-chart-caption">
        <span>0 hands</span>
        <span>
          {label}: {compactNumber(last)} bb
        </span>
        <span>{finalHand.toLocaleString()} hands</span>
      </div>
    </div>
  );
}
export function BreakdownBars({ rows, metric = "bb100", order }) {
  const keys = order ? order.filter((key) => rows[key]) : Object.keys(rows);
  const data = keys.map((key) => ({
    name: key,
    value: metric === "bb100" ? rows[key].bb100 : rows[key].net,
    hands: rows[key].hands,
  }));
  const maximum = Math.max(1, ...data.map((row) => Math.abs(row.value)));
  return (
    <div
      className="native-bar-chart"
      role="img"
      aria-label={`${metric === "bb100" ? "Win rate" : "Net chips"} breakdown`}
    >
      {data.map((row) => {
        const width = (Math.abs(row.value) / maximum) * 50;
        const left = row.value >= 0 ? 50 : 50 - width;
        const value = `${row.value.toFixed(1)}${metric === "bb100" ? "%" : " chips"}`;
        return (
          <div
            className="native-bar-row"
            key={row.name}
            title={`${row.name}: ${value} over ${row.hands} hands`}
          >
            <span className="native-bar-label">{row.name}</span>
            <span className="native-bar-track native-bar-track-centered">
              <span
                className={`native-bar-fill ${row.value >= 0 ? "native-bar-fill-positive" : "native-bar-fill-negative"}`}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            </span>
            <span className="native-bar-value">{value}</span>
          </div>
        );
      })}
    </div>
  );
}
export function FrequencyBars({ counts, color = "var(--info)" }) {
  const total =
    Object.values(counts).reduce((sum, value) => sum + value, 0) || 1;
  const data = Object.entries(counts)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({
      name,
      percent: (value / total) * 100,
      count: value,
    }));
  return (
    <div
      className="native-bar-chart"
      role="img"
      aria-label="Frequency breakdown"
    >
      {data.map((row) => (
        <div
          className="native-bar-row"
          key={row.name}
          title={`${row.name}: ${row.percent.toFixed(1)}% (${row.count})`}
        >
          <span className="native-bar-label">{row.name}</span>
          <span className="native-bar-track">
            <span
              className="native-bar-fill"
              style={{ width: `${row.percent}%`, backgroundColor: color }}
            />
          </span>
          <span className="native-bar-value">
            {row.percent.toFixed(1)}% ({row.count})
          </span>
        </div>
      ))}
    </div>
  );
}
const BET_BUCKET_LABELS = ["<⅓ pot", "⅓–½", "½–¾", "¾–1x", "1–1.5x", ">1.5x"];
export function BetSizeChart({ hist }) {
  const counts = Object.fromEntries(
    BET_BUCKET_LABELS.map((label, index) => [label, hist[index] ?? 0]),
  );
  return <FrequencyBars counts={counts} color="var(--accent)" />;
}
const HM_RANKS = [
  "A",
  "K",
  "Q",
  "J",
  "T",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
];
/** 13x13 starting-hand grid: suited above the diagonal, offsuit below. */
export function StartingHandHeatmap({ rows }) {
  const max = Math.max(
    1,
    ...Object.values(rows).map((row) => Math.abs(row.bb100)),
  );
  return (
    <div>
      <div
        className="grid gap-px"
        style={{ gridTemplateColumns: "repeat(13, minmax(0,1fr))" }}
      >
        {HM_RANKS.map((rankOne, rowIndex) =>
          HM_RANKS.map((rankTwo, columnIndex) => {
            const key =
              rowIndex === columnIndex
                ? rankOne + rankTwo
                : rowIndex < columnIndex
                  ? rankOne + rankTwo + "s"
                  : rankTwo + rankOne + "o";
            const row = rows[key];
            const value = row ? row.bb100 : null;
            const alpha =
              value === null
                ? 0
                : Math.min(0.85, 0.15 + (Math.abs(value) / max) * 0.7);
            const background =
              value === null
                ? "var(--panel-2)"
                : value >= 0
                  ? `rgba(79,195,138,${alpha})`
                  : `rgba(226,99,91,${alpha})`;
            return (
              <div
                key={key}
                className="mono aspect-square flex items-center justify-center text-[9px] rounded-[2px] cursor-default"
                style={{
                  background,
                  color: value === null ? "var(--muted)" : "var(--ink)",
                }}
                title={
                  row
                    ? `${key}: ${row.bb100.toFixed(1)}% over ${row.hands} hands`
                    : `${key}: not dealt`
                }
              >
                {key}
              </div>
            );
          }),
        )}
      </div>
      <div className="text-[11px] text-muted mt-2">
        Green = won, red = lost (win rate %). Cells without data were never
        dealt. Per-hand samples are tiny — treat as descriptive, not predictive.
      </div>
    </div>
  );
}
