"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalibrationDataset } from "@/types/experiment";
import { FreqStat } from "@/lib/player-model/stats";
import { rangeComboCount } from "@/lib/poker/range";
import { RELIABLE_SAMPLE_THRESHOLD } from "@/lib/simulation/defaults";
import { getStore } from "@/lib/storage/store";
import { ConfidenceBar, Empty, PageHeader, Stat, WarningNote, fmtPct } from "@/components/ui";

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
      <ConfidenceBar value={stat.confidence} />
    </div>
  );
}

export default function ProfilePage() {
  const [cals, setCals] = useState<CalibrationDataset[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    getStore()
      .listCalibrations()
      .then((c) => {
        setCals(c);
        if (c.length) setSelected(c[0].id);
      });
  }, []);

  if (cals === null) return <div className="text-muted text-sm">Loading…</div>;
  if (cals.length === 0) {
    return (
      <Empty
        title="No strategy profile yet"
        body="Play a calibration session first. The system records every decision you make and estimates your tendencies with confidence intervals."
        action={{ href: "/calibrate", label: "Start calibrating" }}
      />
    );
  }

  const cal = cals.find((c) => c.id === selected) ?? cals[0];
  const t = cal.tendencies;
  const small = cal.handsPlayed < RELIABLE_SAMPLE_THRESHOLD;
  const rangeFirst = cal.method === "range-first" && Boolean(cal.preflopRange?.length);
  const rangeCombos = rangeFirst ? rangeComboCount(cal.preflopRange ?? []) : 0;

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
          <Link href="/experiments/new" className="btn btn-primary">
            Use in an experiment
          </Link>
        }
      />

      {cals.length > 1 && (
        <select className="field max-w-md mb-4" value={cal.id} onChange={(e) => setSelected(e.target.value)} aria-label="Calibration dataset">
          {cals.map((c) => (
            <option key={c.id} value={c.id}>
              {c.method === "range-first" ? `[Range-first] ${c.name}` : c.name}
            </option>
          ))}
        </select>
      )}

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
          <TendencyRow label={rangeFirst ? "VPIP when selected" : "VPIP"} stat={t.vpip} hint="Share of hands where you voluntarily put chips in preflop" />
          <TendencyRow label={rangeFirst ? "Raise when selected" : "Preflop raise (PFR)"} stat={t.pfr} hint="Share of hands you raised preflop" />
          <TendencyRow label="3-bet" stat={t.threeBet} hint="Re-raise frequency when facing one raise" />
          <TendencyRow label="Fold to 3-bet" stat={t.foldToThreeBet} hint="Fold frequency after raising and facing a 3-bet" />
          <TendencyRow label="Open-limp" stat={t.limp} hint="Entering unraised pots with a call instead of a raise" />
        </section>

        <section className="panel px-5 py-4">
          <h2 className="font-semibold mb-2">Postflop tendencies</h2>
          <TendencyRow label="Continuation bet" stat={t.cbet} hint="Betting the flop after raising preflop" />
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

      <div className="text-xs text-muted mt-6 max-w-3xl">
        How to read this: the model behind simulation is a bucketed behavioral policy (street × position × situation ×
        hand strength), shrunk toward a strength-aware prior when a bucket has few samples. The confidence bars show how
        much observed data — versus prior — drives each estimate.
      </div>
    </div>
  );
}
