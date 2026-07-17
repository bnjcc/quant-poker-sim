"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalibrationDataset, Experiment } from "@/types/experiment";
import { getStore } from "@/lib/storage/store";
import { PageHeader, Stat, fmtBB } from "@/components/ui";

function StepCard({
  n,
  title,
  body,
  href,
  cta,
  done,
  secondary,
}: {
  n: number;
  title: string;
  body: string;
  href: string;
  cta: string;
  done: boolean;
  secondary?: { href: string; label: string };
}) {
  return (
    <div className={`panel px-5 py-4 flex flex-col ${done ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-2">
        <span
          className="mono text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center border"
          style={{ borderColor: done ? "var(--gain)" : "var(--accent)", color: done ? "var(--gain)" : "var(--accent)" }}
        >
          {done ? "✓" : n}
        </span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      <p className="text-sm text-muted mt-2 flex-1">{body}</p>
      <div className="flex flex-wrap gap-2 mt-4">
        <Link href={href} className={`btn self-start ${done ? "" : "btn-primary"}`}>
          {cta}
        </Link>
        {secondary && (
          <Link href={secondary.href} className="btn self-start">
            {secondary.label}
          </Link>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [cals, setCals] = useState<CalibrationDataset[] | null>(null);
  const [exps, setExps] = useState<Experiment[] | null>(null);

  useEffect(() => {
    const store = getStore();
    store.listCalibrations().then(setCals);
    store.listExperiments().then(setExps);
  }, []);

  if (cals === null || exps === null) return <div className="text-muted text-sm">Loading…</div>;

  const completed = exps.filter((e) => e.results);
  const totalHands = completed.reduce((s, e) => s + (e.results?.totalHands ?? 0), 0);
  const latest = completed[0];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        sub="Play a small sample yourself, let the system learn your strategy, then backtest it over hundreds of thousands of simulated hands against pools you design."
      />

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <StepCard
          n={1}
          title="Calibrate"
          body="Play 25–250 hands at a simulated 6-max table. Every decision is recorded with full context: position, stack depth, pot odds, action history."
          href="/calibrate"
          cta={cals.length ? "Add another session" : "Start playing"}
          done={cals.length > 0}
          secondary={{ href: "/range-calibrate", label: "Choose range first" }}
        />
        <StepCard
          n={2}
          title="Review your profile"
          body="See the tendencies the model learned — VPIP, PFR, 3-bet, c-bet, sizing — each with a confidence interval that's honest about sample size."
          href="/profile"
          cta="View profile"
          done={cals.length > 0}
        />
        <StepCard
          n={3}
          title="Run experiments"
          body="Simulate your model against configurable opponent pools with realistic seat turnover, rake, and reproducible seeds. Analyze like a quant."
          href="/experiments/new"
          cta={completed.length ? "New experiment" : "Configure one"}
          done={completed.length > 0}
          secondary={exps.length > 0 ? { href: "/experiments", label: "Previous experiments" } : undefined}
        />
      </div>

      {completed.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat label="Experiments run" value={String(completed.length)} />
            <Stat label="Hands simulated" value={totalHands.toLocaleString()} />
            {latest?.results && (
              <>
                <Stat
                  label="Latest win rate"
                  value={fmtBB(latest.results.bb100) + "/100"}
                  tone={latest.results.bb100 >= 0 ? "gain" : "loss"}
                  sub={latest.config.name}
                />
                <Stat
                  label="Latest 95% CI"
                  value={`${latest.results.ciLow.toFixed(1)} … ${latest.results.ciHigh.toFixed(1)}`}
                  sub="bb/100"
                />
              </>
            )}
          </div>
          <div className="panel px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">Recent experiments</h2>
              <Link href="/experiments" className="text-sm text-accent hover:underline">
                All experiments →
              </Link>
            </div>
            <div className="divide-y divide-line">
              {exps.slice(0, 5).map((e) => (
                <Link key={e.id} href={`/experiments/${e.id}`} className="flex items-center gap-4 py-2.5 hover:bg-panel2/50 rounded px-2">
                  <span className="font-medium truncate">{e.config.name}</span>
                  <span className="text-xs text-muted mono">{e.status}</span>
                  {e.results && (
                    <span className="mono text-sm font-bold ml-auto" style={{ color: e.results.bb100 >= 0 ? "var(--gain)" : "var(--loss)" }}>
                      {fmtBB(e.results.bb100)}/100
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      <p className="text-xs text-muted mt-8 max-w-3xl">
        A note on honesty: simulated opponents are heuristic archetypes and your model is a statistical imitation of a
        small sample. Results measure how your learned style fares in this synthetic ecosystem — useful for comparing
        strategies, rake structures, and pool compositions, not for predicting live win rates.
      </p>
    </div>
  );
}
