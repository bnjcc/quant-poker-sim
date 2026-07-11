"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { HandHistory } from "@/types/poker";
import { CalibrationDataset, Experiment } from "@/types/experiment";
import { runSimulation, SimulationProgress } from "@/lib/simulation/runner";
import { buildPoolConfig, RELIABLE_SAMPLE_THRESHOLD } from "@/lib/simulation/defaults";
import { riskOfRuin } from "@/lib/analytics/aggregate";
import { getStore } from "@/lib/storage/store";
import { BetSizeChart, BreakdownBars, EquityCurve, FrequencyBars, StartingHandHeatmap } from "@/components/charts";
import { HandReplayer } from "@/components/HandReplayer";
import { CardRow, Empty, PageHeader, Stat, WarningNote, fmtBB, fmtPct } from "@/components/ui";

const POSITION_ORDER = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

function download(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExperimentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [exp, setExp] = useState<Experiment | null | undefined>(undefined);
  const [cal, setCal] = useState<CalibrationDataset | null>(null);
  const [progress, setProgress] = useState<SimulationProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bankroll, setBankroll] = useState(2000);
  const cancelRef = useRef(false);

  // Hand explorer state
  const [hands, setHands] = useState<HandHistory[] | null>(null);
  const [replay, setReplay] = useState<HandHistory | null>(null);
  const [filterShowdown, setFilterShowdown] = useState(false);
  const [filterBigPots, setFilterBigPots] = useState(false);
  const [sortByLoss, setSortByLoss] = useState(false);

  useEffect(() => {
    (async () => {
      const store = getStore();
      const e = await store.getExperiment(id);
      setExp(e);
      if (e) setCal(await store.getCalibration(e.calibrationId));
    })();
  }, [id]);

  const run = useCallback(async () => {
    if (!exp || !cal) return;
    setRunning(true);
    setError(null);
    cancelRef.current = false;
    const store = getStore();
    try {
      await store.saveExperiment({ ...exp, status: "running" });
      const out = await runSimulation(
        {
          hands: exp.config.hands,
          seed: exp.config.seed,
          config: exp.config.table,
          pool: buildPoolConfig(exp.config.pool),
          userBuyInBB: exp.config.userBuyInBB,
          mode: exp.config.mode,
          sampleEvery: exp.config.sampleEvery,
        },
        cal.policy,
        (p) => setProgress({ ...p }),
        () => cancelRef.current,
      );
      const handIds = await store.saveHands(exp.id, out.hands);
      const updated: Experiment = {
        ...exp,
        status: out.cancelled ? "cancelled" : "complete",
        results: out.aggregates,
        handIds,
        userDecisionLog: out.userDecisionLog.slice(0, 5000),
      };
      await store.saveExperiment(updated);
      setExp(updated);
      setHands(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed.");
      await store.saveExperiment({ ...exp, status: "pending" });
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [exp, cal]);

  const loadHands = useCallback(async () => {
    if (!exp) return;
    setHands(await getStore().getHands(exp.id));
  }, [exp]);

  const filteredHands = useMemo(() => {
    if (!hands || !exp) return [];
    const bb = exp.config.table.bigBlind;
    let out = hands.filter((h) => {
      const r = h.results.find((x) => x.playerId === "user");
      if (!r) return false;
      if (filterShowdown && !r.showedDown) return false;
      if (filterBigPots) {
        const pot = h.potsAwarded.reduce((s, p) => s + p.amount, 0);
        if (pot < 40 * bb) return false;
      }
      return true;
    });
    if (sortByLoss) {
      out = [...out].sort((a, b) => {
        const na = a.results.find((x) => x.playerId === "user")?.net ?? 0;
        const nb = b.results.find((x) => x.playerId === "user")?.net ?? 0;
        return na - nb;
      });
    }
    return out.slice(0, 400);
  }, [hands, exp, filterShowdown, filterBigPots, sortByLoss]);

  if (exp === undefined) return <div className="text-muted text-sm">Loading…</div>;
  if (exp === null) return <Empty title="Experiment not found" body="It may have been deleted." action={{ href: "/experiments", label: "All experiments" }} />;

  const r = exp.results;
  const bb = exp.config.table.bigBlind;
  const avgConfidence =
    exp.userDecisionLog.length > 0
      ? exp.userDecisionLog.reduce((s, d) => s + d.confidence, 0) / exp.userDecisionLog.length
      : null;
  const ror = r && r.bb100 !== 0 ? riskOfRuin(r.bb100, r.stdDevBBPerHand, bankroll) : null;
  const manual = cal?.manualAggregates ?? null;

  return (
    <div>
      <PageHeader
        title={exp.config.name}
        sub={exp.config.description || undefined}
        right={
          <div className="flex gap-2">
            <Link href={`/experiments/new?duplicate=${exp.id}`} className="btn">
              Duplicate
            </Link>
            {r && (
              <button className="btn" onClick={() => download(`${exp.id}-summary.json`, { config: exp.config, calibrationId: exp.calibrationId, simulationVersion: exp.simulationVersion, results: r })}>
                Export summary
              </button>
            )}
            {r && (
              <button
                className="btn"
                onClick={async () => download(`${exp.id}-hands.json`, await getStore().getHands(exp.id))}
              >
                Export hands
              </button>
            )}
          </div>
        }
      />

      <div className="mono text-xs text-muted mb-5">
        seed <span className="text-ink">{exp.config.seed}</span> · engine v{exp.simulationVersion} ·{" "}
        {exp.config.hands.toLocaleString()} hands requested · blinds {exp.config.table.smallBlind}/{bb} · rake{" "}
        {(exp.config.table.rake.percentage * 100).toFixed(1)}% cap {exp.config.table.rake.cap} · mode {exp.config.mode}
      </div>

      {cal && cal.handsPlayed < RELIABLE_SAMPLE_THRESHOLD && (
        <div className="mb-4">
          <WarningNote>
            This experiment uses a model built from only {cal.handsPlayed} calibration hands — simulated behavior leans
            heavily on the prior, so results reflect your style only loosely.
          </WarningNote>
        </div>
      )}

      {!r || exp.status === "pending" ? (
        <div className="panel px-6 py-6 max-w-xl">
          {running ? (
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span>Simulating…</span>
                <span className="mono">
                  {progress ? `${progress.handsDone.toLocaleString()} / ${progress.handsTotal.toLocaleString()}` : ""}
                </span>
              </div>
              <div className="h-2 rounded bg-panel2 overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${progress ? (progress.handsDone / progress.handsTotal) * 100 : 0}%` }}
                />
              </div>
              {progress && (
                <div className="mono text-xs text-muted mt-2">
                  running net: {(progress.userNet / bb).toFixed(0)} bb
                </div>
              )}
              <button className="btn btn-danger mt-4" onClick={() => (cancelRef.current = true)}>
                Cancel (keeps partial results)
              </button>
            </div>
          ) : (
            <div>
              <div className="font-semibold mb-1">Ready to run</div>
              <p className="text-sm text-muted mb-4">
                Runs in your browser in chunks — the page stays responsive and you can cancel anytime.
              </p>
              {error && <div className="text-sm mb-3" style={{ color: "var(--loss)" }}>{error}</div>}
              <button className="btn btn-primary" onClick={run} disabled={!cal}>
                Run {exp.config.hands.toLocaleString()} hands
              </button>
              {!cal && <div className="text-xs mt-2" style={{ color: "var(--loss)" }}>Calibration dataset missing — it may have been deleted.</div>}
            </div>
          )}
        </div>
      ) : (
        <>
          {exp.status === "cancelled" && (
            <div className="mb-4">
              <WarningNote>Run was cancelled — results below cover the {r.totalHands.toLocaleString()} hands completed.</WarningNote>
            </div>
          )}

          {/* Headline stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 mb-4">
            <Stat
              label="Win rate"
              value={fmtBB(r.bb100) + "/100"}
              tone={r.bb100 >= 0 ? "gain" : "loss"}
              sub={r.statisticallySignificant ? "statistically significant" : "not significant"}
              title="Big blinds won per 100 hands"
            />
            <Stat label="95% CI" value={`${r.ciLow.toFixed(1)} … ${r.ciHigh.toFixed(1)}`} sub="bb/100" title="If the interval includes 0, the sample can't distinguish winning from losing" />
            <Stat label="Total" value={fmtBB(r.bbWon, 0)} tone={r.bbWon >= 0 ? "gain" : "loss"} sub={`${r.totalHands.toLocaleString()} hands`} />
            <Stat label="Std dev" value={`${r.stdDevBB100.toFixed(0)}`} sub="bb/100 per 100-hand block" />
            <Stat label="Max drawdown" value={`${r.maxDrawdownBB.toFixed(0)} bb`} tone="loss" />
            <Stat label="Rake paid" value={`${(r.rakePaid / bb).toFixed(0)} bb`} sub={fmtPct(r.rakePaid / Math.max(1, Math.abs(r.userNet) + r.rakePaid), 0) + " of gross"} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat label="Showdown winnings" value={fmtBB(r.showdownNetBB, 0)} tone={r.showdownNetBB >= 0 ? "gain" : "loss"} />
            <Stat label="Non-showdown" value={fmtBB(r.nonShowdownNetBB, 0)} tone={r.nonShowdownNetBB >= 0 ? "gain" : "loss"} title="Red-line: chips won without showdown" />
            <Stat label="Profit factor" value={r.profitFactor === Infinity ? "∞" : r.profitFactor.toFixed(2)} title="Gross winnings / gross losses" />
            <Stat
              label="Model confidence"
              value={avgConfidence !== null ? fmtPct(avgConfidence) : "—"}
              sub="avg. data-vs-prior weight per decision"
            />
          </div>

          {/* Risk of ruin */}
          <div className="panel px-5 py-4 mb-6 flex flex-wrap items-center gap-4">
            <div>
              <div className="label">Risk of ruin</div>
              <div className="mono text-xl font-bold" style={{ color: ror !== null && ror < 0.05 ? "var(--gain)" : "var(--loss)" }}>
                {ror === null ? "—" : ror >= 1 ? "certain (losing rate)" : fmtPct(ror, 2)}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted">
              with a bankroll of
              <input type="number" className="field w-28" value={bankroll} min={100} step={100} onChange={(e) => setBankroll(Number(e.target.value))} />
              bb
            </label>
            <div className="text-xs text-muted max-w-sm">
              Classical diffusion approximation from this run&apos;s win rate and variance — assumes both stay constant.
            </div>
          </div>

          {/* Curves */}
          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            <section className="panel px-5 py-4">
              <h2 className="font-semibold mb-2">Bankroll (bb)</h2>
              <EquityCurve points={r.cumulativeBB} stride={Math.max(1, Math.floor(r.totalHands / Math.max(1, r.cumulativeBB.length)))} />
            </section>
            <section className="panel px-5 py-4">
              <h2 className="font-semibold mb-2">Drawdown from peak (bb)</h2>
              <EquityCurve points={r.drawdownCurveBB.map((d) => -d)} stride={Math.max(1, Math.floor(r.totalHands / Math.max(1, r.drawdownCurveBB.length)))} label="drawdown bb" />
            </section>
          </div>

          {/* Breakdowns */}
          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            <section className="panel px-5 py-4">
              <h2 className="font-semibold mb-2">Win rate by position (bb/100)</h2>
              <BreakdownBars rows={r.byPosition} order={POSITION_ORDER} />
            </section>
            <section className="panel px-5 py-4">
              <h2 className="font-semibold mb-2">By pot type (bb/100)</h2>
              <BreakdownBars rows={r.byPotType} />
            </section>
            <section className="panel px-5 py-4">
              <h2 className="font-semibold mb-2">By your stack depth (bb/100)</h2>
              <BreakdownBars rows={r.byStackDepth} />
            </section>
            <section className="panel px-5 py-4">
              <h2 className="font-semibold mb-2">Simulated action mix</h2>
              <FrequencyBars counts={r.actionCounts} />
            </section>
            <section className="panel px-5 py-4">
              <h2 className="font-semibold mb-2">Bet sizing (fraction of pot)</h2>
              <BetSizeChart hist={r.betSizeHistogram} />
            </section>
            <section className="panel px-5 py-4">
              <h2 className="font-semibold mb-2">Starting hands (bb/100)</h2>
              <StartingHandHeatmap rows={r.byHoleCards} />
            </section>
          </div>

          {/* Manual vs simulated */}
          {manual && (
            <section className="panel px-5 py-4 mb-6">
              <h2 className="font-semibold mb-1">Manual play vs simulated model</h2>
              <p className="text-xs text-muted mb-3">
                Same metrics for your {cal!.handsPlayed} hand calibration session and this simulated run. Large gaps can
                mean the model hasn&apos;t captured your style — or that your small manual sample ran hot or cold.
              </p>
              <table className="w-full text-sm max-w-2xl">
                <thead>
                  <tr className="text-left border-b border-line">
                    <th className="label py-2 font-normal">Metric</th>
                    <th className="label py-2 font-normal text-right">Manual ({manual.totalHands} hands)</th>
                    <th className="label py-2 font-normal text-right">Simulated ({r.totalHands.toLocaleString()})</th>
                  </tr>
                </thead>
                <tbody className="mono">
                  {(
                    [
                      ["bb/100", manual.bb100.toFixed(1), r.bb100.toFixed(1)],
                      ["Showdown net (bb)", manual.showdownNetBB.toFixed(0), r.showdownNetBB.toFixed(0)],
                      ["Non-showdown net (bb)", manual.nonShowdownNetBB.toFixed(0), r.nonShowdownNetBB.toFixed(0)],
                      ["Hands won", fmtPct(manual.winRate), fmtPct(r.winRate)],
                      ["Std dev (bb/100)", manual.stdDevBB100.toFixed(0), r.stdDevBB100.toFixed(0)],
                    ] as const
                  ).map(([m, a, b]) => (
                    <tr key={m} className="border-b border-line last:border-0">
                      <td className="py-2 font-sans">{m}</td>
                      <td className="py-2 text-right">{a}</td>
                      <td className="py-2 text-right">{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-muted mt-2">
                Manual-sample intervals are extremely wide at this size; the comparison is directional only.
              </p>
            </section>
          )}

          {/* Hand explorer */}
          <section className="panel px-5 py-4 mb-6">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h2 className="font-semibold">Hand histories</h2>
              <span className="text-xs text-muted">
                {exp.handIds.length.toLocaleString()} stored{exp.config.mode === "high-speed" ? ` (sampled 1/${exp.config.sampleEvery})` : ""}
              </span>
              {hands && (
                <div className="flex items-center gap-3 ml-auto text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={filterShowdown} onChange={(e) => setFilterShowdown(e.target.checked)} />
                    showdowns only
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={filterBigPots} onChange={(e) => setFilterBigPots(e.target.checked)} />
                    big pots (40bb+)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={sortByLoss} onChange={(e) => setSortByLoss(e.target.checked)} />
                    biggest losses first
                  </label>
                </div>
              )}
            </div>
            {!hands ? (
              <button className="btn" onClick={loadHands}>
                Load stored hands
              </button>
            ) : filteredHands.length === 0 ? (
              <div className="text-sm text-muted">No hands match the filters.</div>
            ) : (
              <div className="max-h-96 overflow-y-auto divide-y divide-line">
                {filteredHands.map((h) => {
                  const res = h.results.find((x) => x.playerId === "user");
                  const hole = res?.holeCards ?? null;
                  const pot = h.potsAwarded.reduce((s, p) => s + p.amount, 0);
                  return (
                    <button
                      key={h.handNumber}
                      className="w-full flex items-center gap-4 px-2 py-2 text-left hover:bg-panel2/60 rounded"
                      onClick={() => setReplay(h)}
                    >
                      <span className="mono text-xs text-muted w-16">#{h.handNumber}</span>
                      <span className="w-20">{hole ? <CardRow cards={hole} size="sm" /> : <span className="text-xs text-muted">folded blind</span>}</span>
                      <span className="w-40">{h.board.length > 0 ? <CardRow cards={h.board} size="sm" /> : <span className="text-xs text-muted italic">no flop</span>}</span>
                      <span className="mono text-xs text-muted">pot {(pot / bb).toFixed(0)}bb</span>
                      <span
                        className="mono text-sm font-bold ml-auto"
                        style={{ color: (res?.net ?? 0) >= 0 ? "var(--gain)" : "var(--loss)" }}
                      >
                        {((res?.net ?? 0) / bb).toFixed(1)} bb
                      </span>
                      {res?.showedDown && <span className="text-[10px] text-info">SD</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <div className="text-xs text-muted max-w-3xl mb-8">
            Interpretation: opponents are heuristic archetypes, equities are Monte Carlo estimates, and your model is a
            statistical imitation of a small sample — a positive result here is evidence about this simulated pool, not
            a guarantee about live play.
          </div>
        </>
      )}

      {replay && <HandReplayer hand={replay} onClose={() => setReplay(null)} />}
    </div>
  );
}
