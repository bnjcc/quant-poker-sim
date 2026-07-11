"use client";

import { useEffect, useState } from "react";
import { CalibrationDataset, Experiment } from "@/types/experiment";
import { getStore } from "@/lib/storage/store";
import { PageHeader } from "@/components/ui";

export default function SettingsPage() {
  const [cals, setCals] = useState<CalibrationDataset[]>([]);
  const [exps, setExps] = useState<Experiment[]>([]);
  const [usage, setUsage] = useState<string>("");

  const load = async () => {
    const store = getStore();
    setCals(await store.listCalibrations());
    setExps(await store.listExperiments());
    try {
      let bytes = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith("psim:")) bytes += (localStorage.getItem(k) ?? "").length * 2;
      }
      setUsage(`${(bytes / 1024 / 1024).toFixed(2)} MB`);
    } catch {
      setUsage("unknown");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const deleteCal = async (id: string) => {
    if (!confirm("Delete this calibration? Experiments built from it will keep their results but can't be re-run.")) return;
    await getStore().deleteCalibration(id);
    load();
  };

  const wipe = async () => {
    if (!confirm("Delete ALL calibrations, experiments, and stored hands? This cannot be undone.")) return;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith("psim:")) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    load();
  };

  return (
    <div>
      <PageHeader
        title="Settings & data"
        sub="Everything lives in this browser's local storage — nothing is sent to a server. Export what you want to keep before clearing."
      />
      <div className="grid lg:grid-cols-2 gap-4 max-w-4xl">
        <section className="panel px-5 py-4">
          <h2 className="font-semibold mb-2">Storage</h2>
          <div className="text-sm text-muted space-y-1">
            <div>Local storage used: <span className="mono text-ink">{usage}</span></div>
            <div>Calibrations: <span className="mono text-ink">{cals.length}</span></div>
            <div>Experiments: <span className="mono text-ink">{exps.length}</span></div>
          </div>
          <p className="text-xs text-muted mt-3">
            Browsers cap local storage around 5–10 MB, so hand histories are limited to ~3,000 per experiment and large
            runs use sampled storage. A database backend (see docs/ARCHITECTURE.md) removes these limits.
          </p>
          <button className="btn btn-danger mt-4" onClick={wipe}>
            Delete all data
          </button>
        </section>
        <section className="panel px-5 py-4">
          <h2 className="font-semibold mb-2">Calibration datasets</h2>
          {cals.length === 0 ? (
            <div className="text-sm text-muted">None yet.</div>
          ) : (
            <div className="divide-y divide-line">
              {cals.map((c) => (
                <div key={c.id} className="py-2 flex items-center gap-3">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{c.name}</div>
                    <div className="text-[11px] text-muted mono">{c.handsPlayed} hands · {c.decisions.length} decisions</div>
                  </div>
                  <button className="btn btn-danger text-xs px-2 py-1 ml-auto" onClick={() => deleteCal(c.id)}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
