"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DecisionContext } from "@/types/decision";
import { CalibrationDataset } from "@/types/experiment";
import { HandEngine } from "@/lib/poker/engine";
import { Rng } from "@/lib/poker/rng";
import { ManualSession } from "@/lib/simulation/manual";
import { buildPoolConfig, CALIBRATION_SIZES, DEFAULT_POOL_SETTINGS, DEFAULT_TABLE, RELIABLE_SAMPLE_THRESHOLD } from "@/lib/simulation/defaults";
import { BehavioralPolicy } from "@/lib/player-model/policy";
import { computeTendencies } from "@/lib/player-model/stats";
import { Aggregator } from "@/lib/analytics/aggregate";
import { getStore, newId } from "@/lib/storage/store";
import { PokerTable, SeatView } from "@/components/PokerTable";
import { Empty, PageHeader, WarningNote, fmtChips } from "@/components/ui";

type Phase = "setup" | "playing" | "hand-done" | "done";

export default function CalibratePage() {
  const router = useRouter();
  const sessionRef = useRef<ManualSession | null>(null);
  const [phase, setPhase] = useState<Phase>("setup");
  const [target, setTarget] = useState<number>(50);
  const [customTarget, setCustomTarget] = useState("");
  const [ctx, setCtx] = useState<DecisionContext | null>(null);
  const [engine, setEngine] = useState<HandEngine | null>(null);
  const [betTo, setBetTo] = useState(0);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, force] = useState(0);
  const rerender = () => force((x) => x + 1);

  const start = useCallback(() => {
    const hands = customTarget ? Math.max(5, Math.min(2000, Number(customTarget) || 50)) : target;
    const ms = new ManualSession({
      config: DEFAULT_TABLE,
      pool: buildPoolConfig(DEFAULT_POOL_SETTINGS),
      seed: `cal-${Date.now()}`,
      targetHands: hands,
      userBuyInBB: 100,
    });
    sessionRef.current = ms;
    setPhase("playing");
    advance(ms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, customTarget]);

  const advance = (ms: ManualSession) => {
    const step = ms.step();
    if (step.kind === "awaiting-user") {
      setCtx(step.context);
      setEngine(step.engine);
      const l = step.context.legal;
      setBetTo(l.callAmount > 0 ? l.minRaiseTo : Math.max(l.minBet, Math.round(step.context.potSize * 0.66)));
      setPhase("playing");
    } else if (step.kind === "hand-complete") {
      setEngine(step.engine);
      setCtx(null);
      const res = step.history.results.find((r) => r.seat === ms.userSeat);
      setLastResult(res ? `Hand #${step.history.handNumber}: ${fmtChips(res.net)} chips` : null);
      setPhase(ms.handsPlayed >= ms.targetHands ? "done" : "hand-done");
    } else {
      setPhase("done");
    }
    rerender();
  };

  const act = (type: "fold" | "check" | "call" | "bet" | "raise") => {
    const ms = sessionRef.current;
    if (!ms || !ctx) return;
    const action = type === "bet" || type === "raise" ? { type, toAmount: betTo } : { type };
    ms.submitUserAction(ctx, action);
    advance(ms);
  };

  const nextHand = () => {
    const ms = sessionRef.current;
    if (ms) advance(ms);
  };

  const save = async () => {
    const ms = sessionRef.current;
    if (!ms) return;
    setSaving(true);
    setError(null);
    try {
      const tendencies = computeTendencies(ms.decisions, ms.histories, ms.userSeatByHand);
      const policy = new BehavioralPolicy();
      policy.train(ms.decisions, new Rng("train"));
      const agg = new Aggregator(DEFAULT_TABLE.bigBlind);
      for (const h of ms.histories) agg.addHand(h, ms.userSeat, true);
      const dataset: CalibrationDataset = {
        id: newId("cal"),
        name: `Calibration ${new Date().toLocaleString()} (${ms.handsPlayed} hands)`,
        createdAt: new Date().toISOString(),
        method: "full-session",
        seed: "manual",
        handsPlayed: ms.handsPlayed,
        decisions: ms.decisions,
        histories: ms.histories.slice(0, 500),
        userSeatByHand: Object.fromEntries(ms.userSeatByHand),
        tendencies,
        policy: policy.serialize(),
        manualAggregates: agg.snapshot(),
      };
      await getStore().saveCalibration(dataset);
      router.push("/profile");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the calibration.");
      setSaving(false);
    }
  };

  const ms = sessionRef.current;
  const seats: SeatView[] = useMemo(() => {
    if (!engine || !ms) return [];
    const lastActionBySeat = new Map<number, string>();
    for (const a of engine.actions) {
      if (a.type === "post-sb" || a.type === "post-bb") continue;
      lastActionBySeat.set(a.seat, a.amount > 0 ? `${a.type} ${a.amount}` : a.type);
    }
    return engine.players.map((p) => ({
      seat: p.seat,
      name: p.seat === ms.userSeat ? "You" : p.name,
      stack: p.stack,
      committed: p.streetCommitted,
      folded: p.folded,
      allIn: p.allIn,
      isButton: p.seat === engine.buttonSeat,
      isActing: engine.currentSeat === p.seat,
      isUser: p.seat === ms.userSeat,
      holeCards: p.seat === ms.userSeat || engine.complete ? p.holeCards : null,
      lastAction: lastActionBySeat.get(p.seat),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, ms, ctx, phase]);

  if (phase === "setup") {
    return (
      <div>
        <PageHeader
          title="Calibration session"
          right={
            <Link href="/range-calibrate" className="btn">
              Choose my range first
            </Link>
          }
          sub="Play hands yourself so the system can learn your strategy. Every decision is recorded with its full context — position, stack, pot, action history — and turned into a behavioral model."
        />
        <div className="panel px-6 py-6 max-w-xl">
          <div className="label mb-3">How many hands will you play?</div>
          <div className="flex flex-wrap gap-2">
            {CALIBRATION_SIZES.map((n) => (
              <button
                key={n}
                className={`btn ${target === n && !customTarget ? "btn-primary" : ""}`}
                onClick={() => {
                  setTarget(n);
                  setCustomTarget("");
                }}
              >
                {n} hands
              </button>
            ))}
            <input
              className="field w-28"
              placeholder="Custom"
              inputMode="numeric"
              value={customTarget}
              onChange={(e) => setCustomTarget(e.target.value.replace(/\D/g, ""))}
              aria-label="Custom number of hands"
            />
          </div>
          <div className="mt-4 text-sm text-muted">
            More hands mean a more reliable model. Below {RELIABLE_SAMPLE_THRESHOLD} hands, estimates carry wide
            uncertainty and the profile will say so.
          </div>
          <button className="btn btn-primary mt-5" onClick={start}>
            Deal me in
          </button>
        </div>
        <div className="mt-4 max-w-xl">
          <WarningNote>
            Table: 6-max, blinds {DEFAULT_TABLE.smallBlind}/{DEFAULT_TABLE.bigBlind}, 100bb buy-in, 5% rake capped at{" "}
            {DEFAULT_TABLE.rake.cap}. Opponents are drawn from the default mixed pool.
          </WarningNote>
        </div>
      </div>
    );
  }

  if (!ms || !engine) {
    return <Empty title="Session ended" body="Start a new calibration session to continue." action={{ href: "/calibrate", label: "New session" }} />;
  }

  const legal = ctx?.legal;
  const progress = ms.handsPlayed / ms.targetHands;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="mono text-sm font-bold">
            Hand {Math.min(ms.handsPlayed + 1, ms.targetHands)} / {ms.targetHands}
          </span>
          <span className="text-xs text-muted ml-3">{ms.decisions.length} decisions recorded</span>
        </div>
        <div className="mono text-sm">
          Stack: <span className="text-accent font-bold">{ms.session.userStack.toLocaleString()}</span>
          {ms.session.userBuyIns > 1 && <span className="text-muted text-xs ml-2">({ms.session.userBuyIns} buy-ins)</span>}
        </div>
      </div>
      <div className="h-1.5 rounded bg-panel2 mb-5 overflow-hidden" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-accent rounded" style={{ width: `${progress * 100}%` }} />
      </div>

      <PokerTable
        seats={seats}
        board={engine.board}
        pot={engine.potSize}
        street={engine.street}
      />

      <div className="panel mt-5 px-5 py-4">
        {phase === "playing" && ctx && legal ? (
          <div className="flex flex-wrap items-center gap-3">
            {legal.types.includes("fold") && (
              <button className="btn btn-danger" onClick={() => act("fold")}>
                Fold
              </button>
            )}
            {legal.types.includes("check") && (
              <button className="btn" onClick={() => act("check")}>
                Check
              </button>
            )}
            {legal.types.includes("call") && (
              <button className="btn" onClick={() => act("call")}>
                Call {legal.callAmount}
              </button>
            )}
            {(legal.types.includes("bet") || legal.types.includes("raise")) && (
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  className="btn btn-primary"
                  onClick={() => act(legal.types.includes("bet") ? "bet" : "raise")}
                >
                  {legal.types.includes("bet") ? "Bet" : "Raise to"} {betTo}
                </button>
                <input
                  type="range"
                  min={legal.types.includes("bet") ? legal.minBet : legal.minRaiseTo}
                  max={legal.maxBetTo}
                  value={betTo}
                  onChange={(e) => setBetTo(Number(e.target.value))}
                  className="w-48"
                  aria-label="Bet size"
                />
                <div className="flex gap-1">
                  {[0.5, 0.66, 1].map((f) => (
                    <button
                      key={f}
                      className="btn text-xs px-2 py-1"
                      onClick={() =>
                        setBetTo(
                          Math.min(
                            legal.maxBetTo,
                            Math.max(
                              legal.types.includes("bet") ? legal.minBet : legal.minRaiseTo,
                              Math.round(ctx.potSize * f) + (legal.types.includes("raise") ? legal.callAmount : 0),
                            ),
                          ),
                        )
                      }
                    >
                      {f === 1 ? "pot" : `${Math.round(f * 100)}%`}
                    </button>
                  ))}
                  <button className="btn text-xs px-2 py-1" onClick={() => setBetTo(legal.maxBetTo)}>
                    all-in
                  </button>
                </div>
              </div>
            )}
            <div className="ml-auto text-xs text-muted mono">
              pot {ctx.potSize} · to call {legal.callAmount} · SPR {ctx.stackToPotRatio.toFixed(1)}
            </div>
          </div>
        ) : phase === "hand-done" ? (
          <div className="flex items-center gap-4">
            <span className="text-sm">{lastResult}</span>
            <button className="btn btn-primary" onClick={nextHand}>
              Next hand
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="font-semibold">Calibration complete — {ms.handsPlayed} hands, {ms.decisions.length} decisions.</div>
              {ms.handsPlayed < RELIABLE_SAMPLE_THRESHOLD && (
                <div className="text-xs text-muted mt-1">
                  Small sample: tendency estimates will carry wide confidence intervals. You can always add another
                  session later.
                </div>
              )}
              {error && <div className="text-xs mt-1" style={{ color: "var(--loss)" }}>{error}</div>}
            </div>
            <button className="btn btn-primary ml-auto" onClick={save} disabled={saving}>
              {saving ? "Building your model…" : "Build my strategy profile"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
