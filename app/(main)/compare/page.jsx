"use client";
import { useEffect, useMemo, useState } from "react";
import { getStore } from "@/lib/storage/store";
import { Empty, PageHeader, fmtPct, fmtWinRatePct } from "@/components/ui";
import { AnalyticsGlossary } from "@/components/AnalyticsGlossary";
export default function ComparePage() {
  const [exps, setExps] = useState(null);
  const [picked, setPicked] = useState([]);
  useEffect(() => {
    getStore()
      .listExperiments()
      .then((all) => {
        const done = all.filter((e) => e.results);
        setExps(done);
        setPicked(done.slice(0, 2).map((e) => e.id));
      });
  }, []);
  const rows = useMemo(
    () => (exps ?? []).filter((e) => picked.includes(e.id)),
    [exps, picked],
  );
  if (exps === null) return <div className="text-muted text-sm">Loading…</div>;
  if (exps.length < 2) {
    return (
      <Empty
        title="Nothing to compare yet"
        body="Run at least two experiments — for example the same configuration with different rake, or the same seed against two different pools."
        action={{ href: "/experiments/new", label: "New experiment" }}
      />
    );
  }
  const toggle = (id) =>
    setPicked((p) =>
      p.includes(id)
        ? p.filter((x) => x !== id)
        : p.length < 4
          ? [...p, id]
          : p,
    );
  const metrics = [
    { label: "Hands", get: (e) => e.results.totalHands.toLocaleString() },
    {
      label: "Win rate",
      get: (e) => fmtWinRatePct(e.results.bb100),
      tone: (e) => (e.results.bb100 >= 0 ? "var(--gain)" : "var(--loss)"),
    },
    {
      label: "95% CI",
      get: (e) =>
        `${e.results.ciLow.toFixed(1)}% … ${e.results.ciHigh.toFixed(1)}%`,
    },
    {
      label: "Significant",
      get: (e) => (e.results.statisticallySignificant ? "yes" : "no"),
    },
    { label: "Volatility", get: (e) => `${e.results.stdDevBB100.toFixed(0)}%` },
    {
      label: "Max drawdown (bb)",
      get: (e) => e.results.maxDrawdownBB.toFixed(0),
    },
    {
      label: "Showdown net (bb)",
      get: (e) => e.results.showdownNetBB.toFixed(0),
    },
    {
      label: "Non-showdown net (bb)",
      get: (e) => e.results.nonShowdownNetBB.toFixed(0),
    },
    { label: "Hands won", get: (e) => fmtPct(e.results.winRate) },
    {
      label: "Rake paid (bb)",
      get: (e) => (e.results.rakePaid / e.config.table.bigBlind).toFixed(0),
    },
    { label: "Seed", get: (e) => e.config.seed },
    { label: "Pool skill ×", get: (e) => e.config.pool.skillShift.toFixed(2) },
    {
      label: "Rake",
      get: (e) =>
        `${(e.config.table.rake.percentage * 100).toFixed(1)}% cap ${e.config.table.rake.cap}`,
    },
  ];
  return (
    <div>
      <PageHeader
        title="Compare experiments"
        sub="Pick up to four completed runs. Differences smaller than the confidence intervals are noise, not signal."
      />
      <div className="flex flex-wrap gap-2 mb-5">
        {exps.map((e) => (
          <button
            key={e.id}
            className={`btn text-xs ${picked.includes(e.id) ? "btn-primary" : ""}`}
            onClick={() => toggle(e.id)}
          >
            {e.config.name}
          </button>
        ))}
      </div>
      {rows.length >= 2 && (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="label px-4 py-3 font-normal">Metric</th>
                {rows.map((e) => (
                  <th key={e.id} className="px-4 py-3 font-semibold">
                    {e.config.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr
                  key={m.label}
                  className="border-b border-line last:border-0"
                >
                  <td className="px-4 py-2.5 text-muted">{m.label}</td>
                  {rows.map((e) => (
                    <td
                      key={e.id}
                      className="px-4 py-2.5 mono"
                      style={{ color: m.tone?.(e) }}
                    >
                      {m.get(e)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-6">
        <AnalyticsGlossary
          groups={["analytics"]}
          title="Explain the advanced comparison metrics"
        />
      </div>
    </div>
  );
}
