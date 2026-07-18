"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalibrationDataset } from "@/types/experiment";
import { FreqStat } from "@/lib/player-model/stats";
import { rangeComboCount } from "@/lib/poker/range";
import { RELIABLE_SAMPLE_THRESHOLD } from "@/lib/simulation/defaults";
import { formatDecisionTime, SNAP_DECISION_MS } from "@/lib/simulation/timing";
import { getStore } from "@/lib/storage/store";
import { Empty, PageHeader, PercentageBar, Stat, WarningNote, fmtPct } from "@/components/ui";
import { AnalyticsGlossary } from "@/components/AnalyticsGlossary";

function TendencyRow({ label, stat, hint }: { label: string; stat: FreqStat; hint: string }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-line last:border-0" title={hint}>
      <div className="w-56 text-sm">{label}</div>
      <div className="mono text-sm font-bold w-16">{fmtPct(stat.value, 1)}</div>
      <div className="text-[11px] text-muted mono w-32">
        CI {fmtPct(stat.ciLow)}–{fmtPct(stat.ciHigh)}
      </div>
      <div className="text-[11px] text-muted mono w-24">
        {stat.numerator}/{stat.denominator}
      </div>
      <PercentageBar value={stat.value} label={fmtPct(stat.value, 1)} />
    </div>
  );
}

export default function ProfilePage() {
  const [cals, setCals] = useState<CalibrationDataset[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getStore()
      .listCalibrations()
      .then((c) => {
        setCals(c);
        if (c.length) {
          const requested = new URLSearchParams(window.location.search).get("strategy");
          const initial = c.find((strategy) => strategy.id === requested) ?? c[0];
          setSelected(initial.id);
          setDraftName(initial.name);
        }
      });
  }, []);

  if (cals === null) return <div className="text-muted text-sm">Loading…</div>;
  if (cals.length === 0) {
    return (
      <Empty
        title="No strategy profile yet"
        body="Play a calibration session first. The system records every decision you make and estimates your tendencies with confidence intervals."
        action={{ href: "/range-calibrate", label: "Start calibrating" }}
      />
    );
  }

  const cal = cals.find((c) => c.id === selected) ?? cals[0];
  const t = cal.tendencies;
  const small = cal.handsPlayed < RELIABLE_SAMPLE_THRESHOLD;
  const rangeFirst = cal.method === "range-first" && Boolean(cal.preflopRange?.length);
  const rangeCombos = rangeFirst ? rangeComboCount(cal.preflopRange ?? []) : 0;
  const timedDecisions = cal.decisions.filter(
    (decision): decision is typeof decision & { responseTimeMs: number } =>
      decision.responseTimeMs !== undefined && Number.isFinite(decision.responseTimeMs),
  );
  const sortedTimes = timedDecisions.map((decision) => decision.responseTimeMs).sort((a, b) => a - b);
  const averageTime = sortedTimes.length
    ? sortedTimes.reduce((sum, time) => sum + time, 0) / sortedTimes.length
    : null;
  const medianTime = sortedTimes.length ? sortedTimes[Math.floor(sortedTimes.length / 2)] : null;
  const snapCount = timedDecisions.filter((decision) => decision.responseTimeMs <= SNAP_DECISION_MS).length;
  const timeoutCount = timedDecisions.filter((decision) => decision.timedOut).length;
  const timingCueCount = timedDecisions.filter((decision) => decision.context.lastOpponentAction).length;

  const selectStrategy = (id: string) => {
    const next = cals.find((strategy) => strategy.id === id);
    setSelected(id);
    setDraftName(next?.name ?? "");
    setMessage(null);
  };

  const renameStrategy = async () => {
    const name = draftName.trim();
    if (!name || name.length > 120) {
      setMessage("Strategy names must contain 1–120 characters.");
      return;
    }
    if (name === cal.name) return;
    setSavingName(true);
    setMessage(null);
    try {
      const updated = { ...cal, name };
      await getStore().saveCalibration(updated);
      setCals((current) => current?.map((strategy) => (strategy.id === updated.id ? updated : strategy)) ?? null);
      setMessage("Strategy name saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not rename the strategy.");
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Strategy profile"
        sub={
          rangeFirst
            ? "Your chosen preflop range is exact. Betting tendencies are estimated only from the selected hands you played."
            : "Estimated from your calibration play. Every figure is a smoothed frequency with a 95% Wilson interval — not a fixed label."
        }
        right={
          <Link href={`/experiments/new?strategy=${encodeURIComponent(cal.id)}`} className="btn btn-primary">
            Use in an experiment
          </Link>
        }
      />

      <section className="panel px-5 py-4 mb-4 max-w-3xl">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-64 flex-1">
            <span className="label">Saved strategy</span>
            <select className="field mt-1" value={cal.id} onChange={(event) => selectStrategy(event.target.value)} aria-label="Saved strategy">
              {cals.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.method === "range-first" ? `[Range-first] ${strategy.name}` : strategy.name}
                </option>
              ))}
            </select>
          </label>
          <Link href="/range-calibrate" className="btn">Add strategy</Link>
          <Link href="/settings" className="btn">Manage saved data</Link>
        </div>
        <div className="flex flex-wrap items-end gap-2 mt-3 pt-3 border-t border-line">
          <label className="block min-w-64 flex-1">
            <span className="label">Strategy name</span>
            <input
              className="field mt-1"
              value={draftName}
              maxLength={120}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void renameStrategy();
              }}
            />
          </label>
          <button className="btn" onClick={renameStrategy} disabled={savingName || draftName.trim() === cal.name}>
            {savingName ? "Saving…" : "Save name"}
          </button>
        </div>
        <div className="text-xs text-muted mt-2">
          {message ?? `${cals.length} saved strateg${cals.length === 1 ? "y" : "ies"} in this account.`}
        </div>
      </section>

      {small && (
        <div className="mb-4">
          <WarningNote>
            Only {cal.handsPlayed} calibration hands. {rangeFirst ? "Betting estimates" : "Estimates below"} have wide
            intervals and the simulated model will lean heavily on its prior. {RELIABLE_SAMPLE_THRESHOLD}+ hands are
            recommended before trusting the profile.
          </WarningNote>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label={rangeFirst ? "Betting samples" : "Calibration hands"} value={String(cal.handsPlayed)} sub={`${cal.decisions.length} decisions`} />
        {rangeFirst ? (
          <>
            <Stat label="Selected hands" value={`${cal.preflopRange?.length ?? 0} / 169`} sub="explicit first-in range" />
            <Stat label="Range coverage" value={fmtPct(rangeCombos / 1326, 1)} sub={`${rangeCombos} card combinations`} />
          </>
        ) : (
          <>
            <Stat label="VPIP" value={fmtPct(t.vpip.value, 1)} sub="voluntarily put money in" />
            <Stat label="PFR" value={fmtPct(t.pfr.value, 1)} sub="preflop raise" />
          </>
        )}
        <Stat
          label="Aggression factor"
          value={t.aggressionFactor.toFixed(2)}
          sub="(bets + raises) / calls"
        />
      </div>

      {timedDecisions.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <Stat
              label="Decision time"
              value={formatDecisionTime(averageTime) ?? "—"}
              sub={`median ${formatDecisionTime(medianTime) ?? "—"}`}
            />
            <Stat
              label="Snap decisions"
              value={fmtPct(snapCount / timedDecisions.length, 1)}
              sub={`≤ ${(SNAP_DECISION_MS / 1_000).toFixed(1)}s · ${snapCount}/${timedDecisions.length}`}
            />
            <Stat
              label="Timeouts"
              value={fmtPct(timeoutCount / timedDecisions.length, 1)}
              sub={`${timeoutCount} auto check/folds`}
            />
            <Stat
              label="Timing reads"
              value={String(timingCueCount)}
              sub="decisions after opponent timing cues"
            />
          </div>
          <p className="text-xs text-muted mb-6 max-w-3xl">
            The simulated policy samples your observed response times by action and situation. Its action frequencies
            also condition on whether the previous opponent action was a snap, normal decision, or tank when enough
            matching observations exist.
          </p>
        </>
      )}

      {rangeFirst && (
        <section className="panel px-5 py-4 mb-4">
          <h2 className="font-semibold">Explicit preflop range</h2>
          <p className="text-xs text-muted mt-1 mb-3">
            Unselected hands fold first-in (or check a free big-blind option). Selected hands continue; the learned
            model chooses how. Responses to raises still use your recorded decisions and the model prior.
          </p>
          <div className="mono text-xs leading-relaxed text-ink">{cal.preflopRange?.join(" · ")}</div>
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="panel px-5 py-4">
          <h2 className="font-semibold mb-2">{rangeFirst ? "Actions within the selected range" : "Preflop tendencies"}</h2>
          <TendencyRow label={rangeFirst ? "VPIP — play when selected" : "VPIP — voluntarily play"} stat={t.vpip} hint="Share of hands where you voluntarily put chips in preflop" />
          <TendencyRow label={rangeFirst ? "PFR — raise when selected" : "PFR — preflop raise"} stat={t.pfr} hint="Share of hands you raised preflop" />
          <TendencyRow label="3-bet — preflop re-raise" stat={t.threeBet} hint="Re-raise frequency when facing one raise" />
          <TendencyRow label="Fold to 3-bet" stat={t.foldToThreeBet} hint="Fold frequency after raising and facing a 3-bet" />
          <TendencyRow label="Open-limp" stat={t.limp} hint="Entering unraised pots with a call instead of a raise" />
        </section>

        <section className="panel px-5 py-4">
          <h2 className="font-semibold mb-2">Postflop tendencies</h2>
          <TendencyRow label="C-bet — continuation bet" stat={t.cbet} hint="Betting the flop after raising preflop" />
          <TendencyRow label="Fold to c-bet" stat={t.foldToCbet} hint="Folding the flop when facing a continuation bet" />
          <TendencyRow label="Raise vs bet (check-raise proxy)" stat={t.checkRaise} hint="Raising when facing a postflop bet" />
          <TendencyRow label="River call" stat={t.riverCall} hint="Calling frequency when facing a river bet" />
          <TendencyRow label="Aggression frequency" stat={t.aggressionFrequency} hint="Share of all decisions that were bets or raises" />
        </section>

        <section className="panel px-5 py-4">
          <h2 className="font-semibold mb-2">Showdown behavior</h2>
          <TendencyRow label="Went to showdown (saw flop)" stat={t.wentToShowdown} hint="Reaching showdown after seeing a flop" />
          <TendencyRow label="Won money at showdown" stat={t.wonAtShowdown} hint="Winning share of showdowns reached" />
          <TendencyRow label="Late-street bluff proxy" stat={t.bluffProxy} hint="Heuristic: turn/river aggression showed down with no pair" />
        </section>

        <section className="panel px-5 py-4">
          <h2 className="font-semibold mb-2">Positional looseness (VPIP by position)</h2>
          {Object.entries(t.positionalVpip).map(([pos, stat]) => (
            <TendencyRow key={pos} label={pos} stat={stat} hint={`VPIP from ${pos}`} />
          ))}
          <h2 className="font-semibold mb-2 mt-4">Bet sizing</h2>
          <div className="text-sm text-muted">
            Postflop bets average <span className="mono text-ink">{(t.betSizing.mean * 100).toFixed(0)}% of pot</span>{" "}
            (σ {(t.betSizing.std * 100).toFixed(0)}%, {t.betSizing.samples.length} sized bets). The simulated model
            samples from your observed sizes when enough exist, blended with a ⅔-pot prior.
          </div>
        </section>
      </div>

      <div className="mt-8">
        <AnalyticsGlossary groups={["poker", "positions", "model"]} title="Explain the detailed strategy statistics" />
      </div>

      <div className="text-xs text-muted mt-6 max-w-3xl">
        How to read this: the model behind simulation is a bucketed behavioral policy (street × position × situation ×
        hand strength × opponent timing), shrunk toward a strength-aware prior when a bucket has few samples. The
        percentage bars mirror the displayed tendency. Read them together with the opportunity count and 95% interval
        to judge how much evidence supports each estimate.
      </div>
    </div>
  );
}
