"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalibrationDataset, Experiment } from "@/types/experiment";
import { getStore } from "@/lib/storage/store";
import { Empty, PageHeader, fmtWinRatePct } from "@/components/ui";

export default function ExperimentsPage() {
  const [exps, setExps] = useState<Experiment[] | null>(null);
  const [strategies, setStrategies] = useState<CalibrationDataset[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const store = getStore();
      const [savedExperiments, savedStrategies] = await Promise.all([
        store.listExperiments(),
        store.listCalibrations(),
      ]);
      setExps(savedExperiments);
      setStrategies(savedStrategies);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load previous experiments.");
      setExps([]);
      setStrategies([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm("Delete this experiment and its stored hands?")) return;
    try {
      await getStore().deleteExperiment(id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the experiment.");
    }
  };

  if (exps === null || strategies === null) return <div className="text-muted text-sm">Loading…</div>;
  if (exps.length === 0) {
    return (
      <div>
        {error && <div className="panel px-4 py-3 text-sm mb-4 text-loss">{error}</div>}
        <Empty
          title="No previous experiments"
          body="Completed, pending, and cancelled experiments will appear here and can be opened again at any time."
          action={{ href: "/experiments/new", label: "Create your first experiment" }}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Previous experiments"
        sub="Open any saved run to revisit its results, stored hands, and Simulated Hand Review. Pending and cancelled runs remain available too."
        right={
          <Link href="/experiments/new" className="btn btn-primary">
            New experiment
          </Link>
        }
      />
      {error && <div className="panel px-4 py-3 text-sm mb-4 text-loss">{error}</div>}
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="text-left border-b border-line">
              <th className="label px-4 py-3 font-normal">Name</th>
              <th className="label px-4 py-3 font-normal">Status</th>
              <th className="label px-4 py-3 font-normal">Strategy</th>
              <th className="label px-4 py-3 font-normal text-right">Hands</th>
              <th className="label px-4 py-3 font-normal text-right">Win rate</th>
              <th className="label px-4 py-3 font-normal text-right">95% CI</th>
              <th className="label px-4 py-3 font-normal">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {exps.map((e) => {
              const r = e.results;
              const strategy = strategies.find((candidate) => candidate.id === e.calibrationId);
              const strategyName = strategy?.name ?? e.strategyName ?? "Deleted strategy";
              return (
                <tr key={e.id} className="border-b border-line last:border-0 hover:bg-panel2/50">
                  <td className="px-4 py-3">
                    <Link href={`/experiments/${e.id}`} className="font-semibold hover:text-accent">
                      {e.config.name}
                    </Link>
                    <div className="text-[11px] text-muted mono">seed {e.config.seed}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-xs rounded-full px-2 py-0.5 border"
                      style={{
                        borderColor: e.status === "complete" ? "var(--gain)" : "var(--line)",
                        color: e.status === "complete" ? "var(--gain)" : "var(--muted)",
                      }}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {strategy ? (
                      <Link href={`/profile?strategy=${encodeURIComponent(strategy.id)}`} className="hover:text-accent hover:underline">
                        {strategyName}
                      </Link>
                    ) : (
                      <span className="text-muted" title="The saved strategy is no longer available, but this run keeps its original strategy name.">
                        {strategyName}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right mono">{r ? r.totalHands.toLocaleString() : e.config.hands.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right mono font-bold" style={{ color: r ? (r.bb100 >= 0 ? "var(--gain)" : "var(--loss)") : "var(--muted)" }}>
                    {r ? fmtWinRatePct(r.bb100) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right mono text-xs text-muted">
                    {r ? `${r.ciLow.toFixed(1)}% … ${r.ciHigh.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link href={`/experiments/${e.id}`} className="btn btn-primary text-xs px-2 py-1 mr-2">
                      View
                    </Link>
                    <Link href={`/experiments/new?duplicate=${e.id}`} className="btn text-xs px-2 py-1 mr-2">
                      Duplicate
                    </Link>
                    <button className="btn btn-danger text-xs px-2 py-1" onClick={() => remove(e.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
