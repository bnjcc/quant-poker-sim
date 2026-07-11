"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Experiment } from "@/types/experiment";
import { getStore } from "@/lib/storage/store";
import { Empty, PageHeader, fmtBB } from "@/components/ui";

export default function ExperimentsPage() {
  const [exps, setExps] = useState<Experiment[] | null>(null);

  const load = () => getStore().listExperiments().then(setExps);
  useEffect(() => {
    load();
  }, []);

  const remove = async (id: string) => {
    if (!confirm("Delete this experiment and its stored hands?")) return;
    await getStore().deleteExperiment(id);
    load();
  };

  if (exps === null) return <div className="text-muted text-sm">Loading…</div>;
  if (exps.length === 0) {
    return (
      <Empty
        title="No experiments yet"
        body="An experiment simulates your learned strategy over thousands of hands against a configurable opponent pool."
        action={{ href: "/experiments/new", label: "Create your first experiment" }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Experiments"
        sub="Each experiment stores its full configuration, seed, and version — re-running the same setup reproduces identical results."
        right={
          <Link href="/experiments/new" className="btn btn-primary">
            New experiment
          </Link>
        }
      />
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-line">
              <th className="label px-4 py-3 font-normal">Name</th>
              <th className="label px-4 py-3 font-normal">Status</th>
              <th className="label px-4 py-3 font-normal text-right">Hands</th>
              <th className="label px-4 py-3 font-normal text-right">bb/100</th>
              <th className="label px-4 py-3 font-normal text-right">95% CI</th>
              <th className="label px-4 py-3 font-normal">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {exps.map((e) => {
              const r = e.results;
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
                  <td className="px-4 py-3 text-right mono">{r ? r.totalHands.toLocaleString() : e.config.hands.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right mono font-bold" style={{ color: r ? (r.bb100 >= 0 ? "var(--gain)" : "var(--loss)") : "var(--muted)" }}>
                    {r ? fmtBB(r.bb100) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right mono text-xs text-muted">
                    {r ? `${r.ciLow.toFixed(1)} … ${r.ciHigh.toFixed(1)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
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
