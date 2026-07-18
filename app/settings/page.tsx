"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { CalibrationDataset, Experiment } from "@/types/experiment";
import {
  getLocalStore,
  getStore,
  importBrowserData,
  type StorageSummary,
} from "@/lib/storage/store";
import { PageHeader } from "@/components/ui";
import { ThemeSelector } from "@/components/ThemeSelector";

export default function SettingsPage() {
  const [cals, setCals] = useState<CalibrationDataset[]>([]);
  const [exps, setExps] = useState<Experiment[]>([]);
  const [summary, setSummary] = useState<StorageSummary | null>(null);
  const [localCount, setLocalCount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const store = getStore();
      const [calibrations, experiments, storage] = await Promise.all([
        store.listCalibrations(),
        store.listExperiments(),
        store.getStorageSummary(),
      ]);
      setCals(calibrations);
      setExps(experiments);
      setSummary(storage);
      if (store.mode === "supabase") {
        const local = await getLocalStore().getStorageSummary();
        setLocalCount(local.calibrations + local.experiments + local.hands + local.reviews);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load storage details.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const deleteCal = async (id: string) => {
    const linkedExperiments = exps.filter((experiment) => experiment.calibrationId === id).length;
    const impact = linkedExperiments > 0
      ? ` ${linkedExperiments} linked experiment${linkedExperiments === 1 ? "" : "s"} will keep their results, but cannot be re-run from this saved strategy.`
      : "";
    if (!confirm(`Delete this saved strategy?${impact}`)) return;
    try {
      await getStore().deleteCalibration(id);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete the calibration.");
    }
  };

  const wipe = async () => {
    if (!confirm("Delete ALL calibrations, experiments, and stored hands? This cannot be undone.")) return;
    try {
      await getStore().deleteAll();
      setMessage("All data in the active storage mode was deleted.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete the data.");
    }
  };

  const importLocal = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await importBrowserData();
      setMessage(
        `Imported ${result.calibrations} calibrations, ${result.experiments} experiments, ${result.hands} hands, and ${result.reviews} strategy reviews. Skipped ${result.skipped} items already in the cloud; existing cloud data was not changed. The browser copy was kept as a backup.`,
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import browser data.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Settings & data"
        sub={summary?.mode === "supabase"
          ? "Your private cloud data is stored in Supabase and separated from every other user by row-level security."
          : "Supabase is not configured, so this zero-setup build keeps data in this browser."}
      />
      {message && <div className="panel px-4 py-3 text-sm mb-4 max-w-4xl">{message}</div>}
      <div className="grid lg:grid-cols-2 gap-4 max-w-4xl">
        <ThemeSelector />
        <section className="panel px-5 py-4">
          <h2 className="font-semibold mb-2">{summary?.mode === "supabase" ? "Cloud storage" : "Browser storage"}</h2>
          <div className="text-sm text-muted space-y-1">
            <div>Storage: <span className="mono text-ink">{summary?.usageLabel ?? "Loading…"}</span></div>
            <div>Saved strategies: <span className="mono text-ink">{summary?.calibrations ?? 0}</span></div>
            <div>Experiments: <span className="mono text-ink">{summary?.experiments ?? 0}</span></div>
            <div>Saved hands: <span className="mono text-ink">{summary?.hands ?? 0}</span></div>
            <div>Strategy reviews: <span className="mono text-ink">{summary?.reviews ?? 0}</span></div>
          </div>
          <p className="text-xs text-muted mt-3">{summary?.description}</p>
          {summary?.mode === "supabase" && localCount > 0 && (
            <div className="mt-4 rounded-md border border-line bg-panel2 px-3 py-3">
              <div className="text-sm font-semibold">Browser data found</div>
              <p className="text-xs text-muted mt-1">
                Import items that are not already in this account. Existing cloud records are never overwritten, and the local backup is retained.
              </p>
              <button className="btn mt-3" onClick={importLocal} disabled={busy}>
                {busy ? "Importing…" : "Import browser data"}
              </button>
            </div>
          )}
          <button className="btn btn-danger mt-4" onClick={wipe}>Delete all {summary?.mode === "supabase" ? "cloud" : "browser"} data</button>
        </section>
        <section className="panel px-5 py-4">
          <h2 className="font-semibold mb-2">Saved strategies</h2>
          {cals.length === 0 ? (
            <div className="text-sm text-muted">None yet.</div>
          ) : (
            <div className="divide-y divide-line">
              {cals.map((calibration) => (
                <div key={calibration.id} className="py-2 flex items-center gap-3">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{calibration.name}</div>
                    <div className="text-[11px] text-muted mono">
                      {calibration.handsPlayed} hands · {calibration.decisions.length} decisions
                    </div>
                  </div>
                  <Link className="btn text-xs px-2 py-1 ml-auto" href={`/profile?strategy=${encodeURIComponent(calibration.id)}`}>View</Link>
                  <button className="btn btn-danger text-xs px-2 py-1" onClick={() => deleteCal(calibration.id)}>Delete</button>
                </div>
              ))}
            </div>
          )}
          <div className="text-xs text-muted mt-3">{exps.length} experiment{exps.length === 1 ? "" : "s"} in this storage mode.</div>
        </section>
      </div>
    </div>
  );
}
