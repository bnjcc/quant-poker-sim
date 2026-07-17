"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DecisionContext } from "@/types/decision";
import { CalibrationDataset } from "@/types/experiment";
import { HandEngine } from "@/lib/poker/engine";
import { visibleActionBySeat } from "@/lib/poker/action-display";
import { holeNotation } from "@/lib/poker/deck";
import { ALL_STARTING_HANDS, rangeComboCount } from "@/lib/poker/range";
import { Rng } from "@/lib/poker/rng";
import { ManualSession } from "@/lib/simulation/manual";
import {
  ACTION_CLOCK_MS,
  decisionTimingBucket,
  formatDecisionTime,
  timeoutAction,
} from "@/lib/simulation/timing";
import {
  buildPoolConfig,
  CALIBRATION_SIZES,
  DEFAULT_POOL_SETTINGS,
  DEFAULT_TABLE,
  RELIABLE_SAMPLE_THRESHOLD,
} from "@/lib/simulation/defaults";
import { BehavioralPolicy } from "@/lib/player-model/policy";
import { computeTendencies } from "@/lib/player-model/stats";
import { getStore, newId } from "@/lib/storage/store";
import { PokerTable, SeatView } from "@/components/PokerTable";
import { ActionClock } from "@/components/ActionClock";
import { StartingHandGrid } from "@/components/StartingHandGrid";
import { Empty, PageHeader, WarningNote, fmtChips } from "@/components/ui";

type Phase = "range" | "opponent-acting" | "playing" | "hand-done" | "done";

export default function RangeCalibratePage() {
  const router = useRouter();
  const sessionRef = useRef<ManualSession | null>(null);
  const advanceRef = useRef<(session: ManualSession) => void>(() => undefined);
  const opponentTimerRef = useRef<number | null>(null);
  const activeDecisionRef = useRef<DecisionContext | null>(null);
  const decisionStartedAtRef = useRef(0);
  const [phase, setPhase] = useState<Phase>("range");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [target, setTarget] = useState<number>(50);
  const [customTarget, setCustomTarget] = useState("");
  const [ctx, setCtx] = useState<DecisionContext | null>(null);
  const [engine, setEngine] = useState<HandEngine | null>(null);
  const [betTo, setBetTo] = useState(0);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisionRemainingMs, setDecisionRemainingMs] = useState(ACTION_CLOCK_MS);
  const [opponentRemainingMs, setOpponentRemainingMs] = useState(0);
  const [opponentTotalMs, setOpponentTotalMs] = useState(1);
  const [opponentDeadline, setOpponentDeadline] = useState(0);
  const [opponentName, setOpponentName] = useState("Opponent");
  const [, force] = useState(0);
  const rerender = () => force((value) => value + 1);

  const toggleHand = (notation: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(notation)) next.delete(notation);
      else next.add(notation);
      return next;
    });
  };

  const addGroup = (predicate: (hand: (typeof ALL_STARTING_HANDS)[number]) => boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const hand of ALL_STARTING_HANDS) if (predicate(hand)) next.add(hand.notation);
      return next;
    });
  };

  const advance = (session: ManualSession) => {
    const step = session.step(true);
    if (step.kind === "awaiting-user") {
      activeDecisionRef.current = step.context;
      decisionStartedAtRef.current = Date.now();
      setDecisionRemainingMs(ACTION_CLOCK_MS);
      setCtx(step.context);
      setEngine(step.engine);
      const legal = step.context.legal;
      setBetTo(
        legal.callAmount > 0
          ? legal.minRaiseTo
          : Math.max(legal.minBet, Math.round(step.context.potSize * 0.66)),
      );
      setPhase("playing");
    } else if (step.kind === "opponent-acting") {
      activeDecisionRef.current = null;
      setCtx(null);
      setEngine(step.engine);
      setOpponentName(step.engine.players.find((player) => player.seat === step.seat)?.name ?? "Opponent");
      setOpponentTotalMs(Math.max(1, step.decisionTimeMs));
      setOpponentRemainingMs(step.decisionTimeMs);
      setOpponentDeadline(Date.now() + step.decisionTimeMs);
      setPhase("opponent-acting");
      opponentTimerRef.current = window.setTimeout(() => {
        opponentTimerRef.current = null;
        session.completeOpponentAction();
        advanceRef.current(session);
      }, step.decisionTimeMs);
    } else if (step.kind === "hand-complete") {
      activeDecisionRef.current = null;
      setEngine(step.engine);
      setCtx(null);
      const result = step.history.results.find((item) => item.seat === session.userSeat);
      setLastResult(
        result ? `Hand #${step.history.handNumber}: ${fmtChips(result.net)} chips` : null,
      );
      setPhase(session.handsPlayed >= session.targetHands ? "done" : "hand-done");
    } else {
      activeDecisionRef.current = null;
      setPhase("done");
    }
    rerender();
  };
  advanceRef.current = advance;

  const start = useCallback(() => {
    if (selected.size === 0) return;
    const hands = customTarget ? Math.max(5, Math.min(2000, Number(customTarget) || 50)) : target;
    const session = new ManualSession({
      config: DEFAULT_TABLE,
      pool: buildPoolConfig(DEFAULT_POOL_SETTINGS),
      seed: `range-cal-${Date.now()}`,
      targetHands: hands,
      userBuyInBB: 100,
      startingHands: [...selected],
    });
    sessionRef.current = session;
    setPhase("playing");
    advanceRef.current(session);
  }, [customTarget, selected, target]);

  const act = (type: "fold" | "check" | "call" | "bet" | "raise") => {
    const session = sessionRef.current;
    if (!session || !ctx || activeDecisionRef.current !== ctx) return;
    activeDecisionRef.current = null;
    const action = type === "bet" || type === "raise" ? { type, toAmount: betTo } : { type };
    session.submitUserAction(ctx, action, Date.now() - decisionStartedAtRef.current);
    setCtx(null);
    advanceRef.current(session);
  };

  useEffect(() => {
    if (phase !== "playing" || !ctx) return;
    const deadline = decisionStartedAtRef.current + ACTION_CLOCK_MS;
    const update = () => setDecisionRemainingMs(Math.max(0, deadline - Date.now()));
    update();
    const interval = window.setInterval(update, 100);
    const timeout = window.setTimeout(() => {
      const session = sessionRef.current;
      if (!session || activeDecisionRef.current !== ctx) return;
      activeDecisionRef.current = null;
      session.submitUserAction(ctx, timeoutAction(ctx), ACTION_CLOCK_MS, true);
      setCtx(null);
      advanceRef.current(session);
    }, Math.max(0, deadline - Date.now()));
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [ctx, phase]);

  useEffect(() => {
    if (phase !== "opponent-acting" || opponentDeadline <= 0) return;
    const update = () => setOpponentRemainingMs(Math.max(0, opponentDeadline - Date.now()));
    update();
    const interval = window.setInterval(update, 100);
    return () => window.clearInterval(interval);
  }, [opponentDeadline, phase]);

  useEffect(
    () => () => {
      if (opponentTimerRef.current !== null) window.clearTimeout(opponentTimerRef.current);
    },
    [],
  );

  const nextHand = () => {
    const session = sessionRef.current;
    if (session) advanceRef.current(session);
  };

  const save = async () => {
    const session = sessionRef.current;
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const range = [...selected].sort();
      const tendencies = computeTendencies(session.decisions, session.histories, session.userSeatByHand);
      const policy = new BehavioralPolicy();
      policy.train(session.decisions, new Rng("range-train"));
      policy.setPreflopRange(range);
      const dataset: CalibrationDataset = {
        id: newId("cal"),
        name: `Range-first calibration ${new Date().toLocaleString()} (${range.length} hands)`,
        createdAt: new Date().toISOString(),
        method: "range-first",
        preflopRange: range,
        seed: "range-manual",
        handsPlayed: session.handsPlayed,
        decisions: session.decisions,
        histories: session.histories.slice(0, 500),
        userSeatByHand: Object.fromEntries(session.userSeatByHand),
        tendencies,
        policy: policy.serialize(),
        // The dealt sample is conditional on the chosen range, so its win rate is not an unbiased manual benchmark.
        manualAggregates: null,
      };
      await getStore().saveCalibration(dataset);
      router.push("/profile");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the calibration.");
      setSaving(false);
    }
  };

  const session = sessionRef.current;
  const seats: SeatView[] = useMemo(() => {
    if (!engine || !session) return [];
    const visibleActions = visibleActionBySeat(engine.actions, engine.street);
    const lastActionBySeat = new Map<number, string>();
    for (const action of visibleActions.values()) {
      lastActionBySeat.set(
        action.seat,
        `${action.amount > 0 ? `${action.type} ${action.amount}` : action.type}${
          formatDecisionTime(action.decisionTimeMs)
            ? ` · ${action.timedOut ? "timeout" : formatDecisionTime(action.decisionTimeMs)}`
            : ""
        }`,
      );
    }
    return engine.players.map((player) => ({
      seat: player.seat,
      name: player.seat === session.userSeat ? "You" : player.name,
      stack: player.stack,
      committed: player.streetCommitted,
      folded: player.folded,
      allIn: player.allIn,
      isButton: player.seat === engine.buttonSeat,
      isActing: engine.currentSeat === player.seat,
      isUser: player.seat === session.userSeat,
      holeCards: player.seat === session.userSeat || engine.complete ? player.holeCards : null,
      // Earlier checks disappear for every seat that still owes a response.
      lastAction:
        engine.currentSeat === player.seat && !engine.complete
          ? undefined
          : lastActionBySeat.get(player.seat),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, engine, phase, session]);

  if (phase === "range") {
    const combos = rangeComboCount(selected);
    const percentage = (combos / 1326) * 100;
    return (
      <div>
        <PageHeader
          title="Range-first calibration"
          sub="Choose the starting hands you play, then make online-paced decisions with a 15-second clock. The range is exact; actions, sizing, response time, and reactions to opponent timing are learned."
        />

        <div className="panel px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <div className="font-semibold">Pick your starting range</div>
              <div className="text-sm text-muted mt-1">
                Click individual hands or add a group. Selected hands are highlighted.
              </div>
            </div>
            <div className="text-right">
              <div className="mono font-bold text-accent">{selected.size} / 169 hands</div>
              <div className="text-xs text-muted mono">
                {combos} / 1,326 combos · {percentage.toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4" aria-label="Range shortcuts">
            <button className="btn text-xs" type="button" onClick={() => addGroup((hand) => hand.kind === "pair")}>
              + Pairs
            </button>
            <button className="btn text-xs" type="button" onClick={() => addGroup((hand) => hand.kind === "suited")}>
              + Suited
            </button>
            <button className="btn text-xs" type="button" onClick={() => addGroup((hand) => hand.highRank >= 10 && hand.lowRank >= 10)}>
              + Broadway
            </button>
            <button className="btn text-xs" type="button" onClick={() => addGroup((hand) => hand.kind !== "pair" && hand.gap === 0)}>
              + Connectors
            </button>
            <button
              className="btn text-xs"
              type="button"
              onClick={() =>
                addGroup(
                  (hand) =>
                    hand.kind === "suited" &&
                    (hand.gap <= 2 || (hand.highRank === 14 && hand.lowRank <= 5)),
                )
              }
            >
              + Suited straight potential
            </button>
            <button className="btn text-xs" type="button" onClick={() => setSelected(new Set(ALL_STARTING_HANDS.map((hand) => hand.notation)))}>
              Select all
            </button>
            <button className="btn text-xs" type="button" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
              Clear
            </button>
          </div>

          <StartingHandGrid selected={selected} onToggle={toggleHand} />
        </div>

        <div className="panel px-5 py-4 mt-4 max-w-2xl">
          <div className="label mb-3">How many selected hands will you play?</div>
          <div className="flex flex-wrap gap-2">
            {CALIBRATION_SIZES.map((count) => (
              <button
                type="button"
                key={count}
                className={`btn ${target === count && !customTarget ? "btn-primary" : ""}`}
                onClick={() => {
                  setTarget(count);
                  setCustomTarget("");
                }}
              >
                {count} hands
              </button>
            ))}
            <input
              className="field w-28"
              placeholder="Custom"
              inputMode="numeric"
              value={customTarget}
              onChange={(event) => setCustomTarget(event.target.value.replace(/\D/g, ""))}
              aria-label="Custom number of selected hands"
            />
          </div>
          <button className="btn btn-primary mt-5" type="button" onClick={start} disabled={selected.size === 0}>
            Next: calibrate my betting
          </button>
          {selected.size === 0 && <div className="text-xs text-muted mt-2">Select at least one hand to continue.</div>}
        </div>

        <div className="mt-4 max-w-2xl">
          <WarningNote>
            The selected range controls first-in preflop play. When the simulation faces a raise, your recorded reactions
            and the model prior still determine whether it folds, calls, or raises. Timeouts check when free and fold otherwise.
          </WarningNote>
        </div>
      </div>
    );
  }

  if (!session || !engine) {
    return (
      <Empty
        title="Session ended"
        body="Choose a starting range to begin another betting calibration."
        action={{ href: "/range-calibrate", label: "Choose a range" }}
      />
    );
  }

  const legal = ctx?.legal;
  const progress = session.handsPlayed / session.targetHands;
  const currentHand = ctx?.holeCards.length === 2 ? holeNotation(ctx.holeCards) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <span className="mono text-sm font-bold">
            Selected hand {Math.min(session.handsPlayed + 1, session.targetHands)} / {session.targetHands}
          </span>
          <span className="text-xs text-muted ml-3">{session.decisions.length} decisions recorded</span>
        </div>
        <div className="flex items-center gap-4">
          {currentHand && <span className="mono text-sm text-accent font-bold">{currentHand}</span>}
          <div className="mono text-sm">
            Stack: <span className="text-accent font-bold">{session.session.userStack.toLocaleString()}</span>
          </div>
        </div>
      </div>
      <div
        className="h-1.5 rounded bg-panel2 mb-5 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-accent rounded" style={{ width: `${progress * 100}%` }} />
      </div>

      <PokerTable seats={seats} board={engine.board} pot={engine.potSize} street={engine.street} />

      <div className="panel mt-5 px-5 py-4">
        {phase === "playing" && ctx && legal ? (
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-3 pb-3 border-b border-line">
              <ActionClock remainingMs={decisionRemainingMs} />
              <div className="text-xs text-muted">
                Timeout: <span className="text-ink">{legal.types.includes("check") ? "check" : "fold"}</span>
              </div>
              {ctx.lastOpponentAction && (
                <div className="ml-auto text-xs text-muted mono">
                  last opponent: {ctx.lastOpponentAction.type} · {formatDecisionTime(ctx.lastOpponentAction.decisionTimeMs)} ·{" "}
                  {decisionTimingBucket(ctx.lastOpponentAction.decisionTimeMs)}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
            {legal.types.includes("fold") && (
              <button className="btn btn-danger" type="button" onClick={() => act("fold")}>
                Fold
              </button>
            )}
            {legal.types.includes("check") && (
              <button className="btn" type="button" onClick={() => act("check")}>
                Check
              </button>
            )}
            {legal.types.includes("call") && (
              <button className="btn" type="button" onClick={() => act("call")}>
                Call {legal.callAmount}
              </button>
            )}
            {(legal.types.includes("bet") || legal.types.includes("raise")) && (
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => act(legal.types.includes("bet") ? "bet" : "raise")}
                >
                  {legal.types.includes("bet") ? "Bet" : "Raise to"} {betTo}
                </button>
                <input
                  type="range"
                  min={legal.types.includes("bet") ? legal.minBet : legal.minRaiseTo}
                  max={legal.maxBetTo}
                  value={betTo}
                  onChange={(event) => setBetTo(Number(event.target.value))}
                  className="w-48"
                  aria-label="Bet size"
                />
                <div className="flex gap-1">
                  {[0.5, 0.66, 1].map((fraction) => (
                    <button
                      type="button"
                      key={fraction}
                      className="btn text-xs px-2 py-1"
                      onClick={() =>
                        setBetTo(
                          Math.min(
                            legal.maxBetTo,
                            Math.max(
                              legal.types.includes("bet") ? legal.minBet : legal.minRaiseTo,
                              Math.round(ctx.potSize * fraction) +
                                (legal.types.includes("raise") ? legal.callAmount : 0),
                            ),
                          ),
                        )
                      }
                    >
                      {fraction === 1 ? "pot" : `${Math.round(fraction * 100)}%`}
                    </button>
                  ))}
                  <button className="btn text-xs px-2 py-1" type="button" onClick={() => setBetTo(legal.maxBetTo)}>
                    all-in
                  </button>
                </div>
              </div>
            )}
            <div className="ml-auto text-xs text-muted mono">
              pot {ctx.potSize} · to call {legal.callAmount} · SPR (stack/pot) {ctx.stackToPotRatio.toFixed(1)}
            </div>
            </div>
          </div>
        ) : phase === "opponent-acting" ? (
          <div className="flex items-center gap-4">
            <ActionClock remainingMs={opponentRemainingMs} totalMs={opponentTotalMs} label={opponentName} />
            <span className="text-sm text-muted">{opponentName} is thinking…</span>
          </div>
        ) : phase === "hand-done" ? (
          <div className="flex items-center gap-4">
            <span className="text-sm">{lastResult}</span>
            <button className="btn btn-primary" type="button" onClick={nextHand}>
              Next selected hand
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="font-semibold">
                Betting calibration complete — {session.handsPlayed} hands, {session.decisions.length} decisions.
              </div>
              {session.handsPlayed < RELIABLE_SAMPLE_THRESHOLD && (
                <div className="text-xs text-muted mt-1">
                  Small sample: action and sizing estimates will lean more heavily on the model prior.
                </div>
              )}
              {error && <div className="text-xs text-loss mt-1">{error}</div>}
            </div>
            <button className="btn btn-primary ml-auto" type="button" onClick={save} disabled={saving}>
              {saving ? "Building your range model…" : "Save range strategy"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
