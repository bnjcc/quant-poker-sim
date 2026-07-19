"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { visibleActionBySeat } from "@/lib/poker/action-display";
import { Rng } from "@/lib/poker/rng";
import { ManualSession } from "@/lib/simulation/manual";
import {
  ACTION_CLOCK_MS,
  decisionTimingBucket,
  formatDecisionTime,
  timeoutAction,
} from "@/lib/simulation/timing";
import {
  buildCalibrationLineup,
  buildPoolConfig,
  CALIBRATION_SIZES,
  DEFAULT_POOL_SETTINGS,
  DEFAULT_TABLE,
  RELIABLE_SAMPLE_THRESHOLD,
  threeBigBlindChipAmount,
} from "@/lib/simulation/defaults";
import { BehavioralPolicy } from "@/lib/player-model/policy";
import { computeTendencies } from "@/lib/player-model/stats";
import { Aggregator } from "@/lib/analytics/aggregate";
import { usePokerSounds } from "@/lib/audio/poker-sounds";
import { getStore, newId } from "@/lib/storage/store";
import { PokerTable } from "@/components/PokerTable";
import { ActionClock } from "@/components/ActionClock";
import { ChipAmountInput } from "@/components/ChipAmountInput";
import { CalibrationGameSelector } from "@/components/CalibrationGameSelector";
import { Empty, PageHeader, WarningNote, fmtChips } from "@/components/ui";
export default function CalibratePage() {
  const router = useRouter();
  const sessionRef = useRef(null);
  const advanceRef = useRef(() => undefined);
  const opponentTimerRef = useRef(null);
  const activeDecisionRef = useRef(null);
  const audibleCardsRef = useRef(null);
  const decisionStartedAtRef = useRef(0);
  const sounds = usePokerSounds();
  const [phase, setPhase] = useState("setup");
  const [tableConfig, setTableConfig] = useState(DEFAULT_TABLE);
  const [target, setTarget] = useState(50);
  const [customTarget, setCustomTarget] = useState("");
  const [ctx, setCtx] = useState(null);
  const [engine, setEngine] = useState(null);
  const [betTo, setBetTo] = useState(0);
  const [lastResult, setLastResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [decisionRemainingMs, setDecisionRemainingMs] =
    useState(ACTION_CLOCK_MS);
  const [opponentName, setOpponentName] = useState("Opponent");
  const [opponentCallAmount, setOpponentCallAmount] = useState(0);
  const [, force] = useState(0);
  const rerender = () => force((x) => x + 1);
  const start = useCallback(() => {
    sounds.unlock();
    audibleCardsRef.current = null;
    const hands = customTarget
      ? Math.max(5, Math.min(2000, Number(customTarget) || 50))
      : target;
    const ms = new ManualSession({
      config: tableConfig,
      pool: buildPoolConfig(DEFAULT_POOL_SETTINGS),
      seed: `cal-${Date.now()}`,
      targetHands: hands,
      userBuyInBB: 100,
      fixedLineup: buildCalibrationLineup(tableConfig.maxSeats),
    });
    sessionRef.current = ms;
    setPhase("playing");
    advanceRef.current(ms);
  }, [target, customTarget, sounds, tableConfig]);
  const advance = (ms) => {
    const step = ms.step(true);
    if ("engine" in step) {
      const previous = audibleCardsRef.current;
      if (!previous || previous.handNumber !== step.engine.handNumber) {
        sounds.playDeal(2);
      } else if (step.engine.board.length > previous.boardCount) {
        sounds.playDeal(step.engine.board.length - previous.boardCount);
      }
      audibleCardsRef.current = {
        handNumber: step.engine.handNumber,
        boardCount: step.engine.board.length,
      };
    }
    if (step.kind === "awaiting-user") {
      activeDecisionRef.current = step.context;
      decisionStartedAtRef.current = Date.now();
      setDecisionRemainingMs(ACTION_CLOCK_MS);
      setCtx(step.context);
      setEngine(step.engine);
      const l = step.context.legal;
      setBetTo(
        l.callAmount > 0
          ? l.minRaiseTo
          : Math.max(l.minBet, Math.round(step.context.potSize * 0.66)),
      );
      setPhase("playing");
    } else if (step.kind === "opponent-acting") {
      activeDecisionRef.current = null;
      setCtx(null);
      setEngine(step.engine);
      setOpponentName(
        step.engine.players.find((player) => player.seat === step.seat)?.name ??
          "Opponent",
      );
      setOpponentCallAmount(step.callAmount);
      setPhase("opponent-acting");
      opponentTimerRef.current = window.setTimeout(() => {
        opponentTimerRef.current = null;
        ms.completeOpponentAction();
        const applied = step.engine.actions.at(-1);
        if (
          applied &&
          applied.type !== "post-sb" &&
          applied.type !== "post-bb"
        ) {
          sounds.playDecision(
            applied.type === "all-in" ? "raise" : applied.type,
          );
        }
        advanceRef.current(ms);
      }, step.liveDelayMs);
    } else if (step.kind === "hand-complete") {
      activeDecisionRef.current = null;
      setEngine(step.engine);
      setCtx(null);
      const res = step.history.results.find((r) => r.seat === ms.userSeat);
      setLastResult(
        res
          ? `Hand #${step.history.handNumber}: ${fmtChips(res.net)} chips`
          : null,
      );
      setPhase(ms.handsPlayed >= ms.targetHands ? "done" : "hand-done");
    } else {
      activeDecisionRef.current = null;
      setPhase("done");
    }
    rerender();
  };
  advanceRef.current = advance;
  const act = (type) => {
    const ms = sessionRef.current;
    if (!ms || !ctx || activeDecisionRef.current !== ctx) return;
    activeDecisionRef.current = null;
    const action =
      type === "bet" || type === "raise" ? { type, toAmount: betTo } : { type };
    sounds.playDecision(type);
    ms.submitUserAction(ctx, action, Date.now() - decisionStartedAtRef.current);
    setCtx(null);
    advanceRef.current(ms);
  };
  const checkFold = () => {
    const ms = sessionRef.current;
    if (!ms || !ctx || activeDecisionRef.current !== ctx) return;
    activeDecisionRef.current = null;
    sounds.playDecision(timeoutAction(ctx).type);
    ms.submitCheckFoldForHand(ctx, Date.now() - decisionStartedAtRef.current);
    setCtx(null);
    advanceRef.current(ms);
  };
  useEffect(() => {
    if (phase !== "playing" || !ctx) return;
    const deadline = decisionStartedAtRef.current + ACTION_CLOCK_MS;
    const update = () =>
      setDecisionRemainingMs(Math.max(0, deadline - Date.now()));
    update();
    const interval = window.setInterval(update, 100);
    const timeout = window.setTimeout(
      () => {
        const ms = sessionRef.current;
        if (!ms || activeDecisionRef.current !== ctx) return;
        activeDecisionRef.current = null;
        const action = timeoutAction(ctx);
        sounds.playDecision(action.type);
        ms.submitUserAction(ctx, action, ACTION_CLOCK_MS, true);
        setCtx(null);
        advanceRef.current(ms);
      },
      Math.max(0, deadline - Date.now()),
    );
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [ctx, phase, sounds]);
  useEffect(
    () => () => {
      if (opponentTimerRef.current !== null)
        window.clearTimeout(opponentTimerRef.current);
    },
    [],
  );
  const nextHand = () => {
    const ms = sessionRef.current;
    if (!ms) return;
    const scrollLeft = window.scrollX;
    const scrollTop = window.scrollY;
    advanceRef.current(ms);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ left: scrollLeft, top: scrollTop, behavior: "auto" });
      });
    });
  };
  const save = async () => {
    const ms = sessionRef.current;
    if (!ms) return;
    setSaving(true);
    setError(null);
    try {
      const tendencies = computeTendencies(
        ms.decisions,
        ms.histories,
        ms.userSeatByHand,
      );
      const policy = new BehavioralPolicy();
      policy.train(ms.decisions, new Rng("train"));
      const agg = new Aggregator(ms.session.config.bigBlind);
      for (const h of ms.histories) agg.addHand(h, ms.userSeat, true);
      const dataset = {
        id: newId("cal"),
        name: `Calibration ${new Date().toLocaleString()} (${ms.handsPlayed} hands)`,
        createdAt: new Date().toISOString(),
        method: "full-session",
        calibrationDesign: "information-rich-v1",
        table: ms.session.config,
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
      setError(
        e instanceof Error ? e.message : "Could not save the calibration.",
      );
      setSaving(false);
    }
  };
  const ms = sessionRef.current;
  const seats = useMemo(() => {
    if (!engine || !ms) return [];
    const visibleActions = visibleActionBySeat(engine.actions, engine.street);
    const lastActionBySeat = new Map();
    for (const a of visibleActions.values()) {
      const elapsed = formatDecisionTime(a.decisionTimeMs);
      const timing = elapsed ? ` · ${a.timedOut ? "timeout" : elapsed}` : "";
      lastActionBySeat.set(
        a.seat,
        `${a.amount > 0 ? `${a.type} ${a.amount.toLocaleString()} chips` : a.type}${timing}`,
      );
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
      // The helper removes every action made before the latest wager; hiding
      // the current seat as well covers any remaining repeated-action edge.
      lastAction:
        engine.currentSeat === p.seat && !engine.complete
          ? undefined
          : lastActionBySeat.get(p.seat),
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
          sub="Play an online-paced table with a 45-second action clock so you have time to calculate odds. Measurement opponents vary calls, raises, postflop pressure, and timing so the model can observe more of your strategy."
        />
        <div className="panel px-6 py-6 max-w-xl">
          <CalibrationGameSelector
            table={tableConfig}
            onChange={setTableConfig}
          />
          <div className="label mt-5 mb-3">How many hands will you play?</div>
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
              onChange={(e) =>
                setCustomTarget(e.target.value.replace(/\D/g, ""))
              }
              aria-label="Custom number of hands"
            />
          </div>
          <div className="mt-4 text-sm text-muted">
            More hands mean a more reliable model. Below{" "}
            {RELIABLE_SAMPLE_THRESHOLD} hands, estimates carry wide uncertainty
            and the profile will say so.
          </div>
          <button className="btn btn-primary mt-5" onClick={start}>
            Deal me in
          </button>
        </div>
        <div className="mt-4 max-w-xl">
          <WarningNote>
            Table: {tableConfig.maxSeats}-player, blinds{" "}
            {tableConfig.smallBlind}/{tableConfig.bigBlind} chips,{" "}
            {(100 * tableConfig.bigBlind).toLocaleString()}-chip buy-in (100 big
            blinds), 5% rake capped at {DEFAULT_TABLE.rake.cap} chips. A timeout
            checks when checking is free and folds when facing a bet.
            Calibration opponents get a hand-strength-weighted chance to defend
            raises and create later streets; calls are never forced. Experiments
            still use the normal configured player pool. One selective aggressor
            at the calibration table sometimes raises or 3-bets playable hands
            to create realistic pressure decisions.
          </WarningNote>
        </div>
      </div>
    );
  }
  if (!ms || !engine) {
    return (
      <Empty
        title="Session ended"
        body="Start a new calibration session to continue."
        action={{ href: "/calibrate", label: "New session" }}
      />
    );
  }
  const legal = ctx?.legal;
  const progress = ms.handsPlayed / ms.targetHands;
  const minimumBetTo = legal
    ? legal.types.includes("bet")
      ? legal.minBet
      : legal.minRaiseTo
    : 0;
  const threeBigBlindChips = threeBigBlindChipAmount(
    ms.session.config.bigBlind,
  );
  const threeBigBlindIsLegal =
    threeBigBlindChips >= minimumBetTo &&
    threeBigBlindChips <= (legal?.maxBetTo ?? 0);
  return (
    <div className={phase === "done" ? "" : "calibration-play-layout"}>
      <div className="calibration-status-bar flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="calibration-session-summary">
          <span className="mono text-sm font-bold">
            Hand {Math.min(ms.handsPlayed + 1, ms.targetHands)} /{" "}
            {ms.targetHands}
          </span>
          <span className="text-xs text-muted ml-3">
            {ms.decisions.length} decisions recorded
          </span>
          <span className="text-xs text-muted ml-3 mono">
            {ms.session.config.maxSeats}-player · {ms.session.config.smallBlind}
            /{ms.session.config.bigBlind} chips
          </span>
        </div>
        <div className="calibration-session-tools flex items-center gap-3">
          <button
            className="btn text-xs px-2 py-1"
            type="button"
            onClick={sounds.toggle}
            aria-pressed={sounds.enabled}
          >
            {sounds.enabled ? "Sound on" : "Sound off"}
          </button>
          <div className="mono text-sm">
            Stack:{" "}
            <span className="text-accent font-bold">
              {ms.session.userStack.toLocaleString()} chips
            </span>
            {ms.session.userBuyIns > 1 && (
              <span className="text-muted text-xs ml-2">
                ({ms.session.userBuyIns} buy-ins)
              </span>
            )}
          </div>
        </div>
      </div>
      <div
        className="calibration-progress h-1.5 rounded bg-panel2 mb-5 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-accent rounded"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <div className="calibration-table-zone">
        <PokerTable
          seats={seats}
          board={engine.board}
          pot={engine.potSize}
          street={engine.street}
          fitViewport
          animateCards
          cardAnimationKey={engine.handNumber}
        />
      </div>

      <div className="panel calibration-controls mt-5 px-5 py-4">
        {phase === "playing" && ctx && legal ? (
          <div className="calibration-controls-panel">
            <div className="calibration-clock-row flex flex-wrap items-center gap-3 mb-3 pb-3 border-b border-line">
              <ActionClock remainingMs={decisionRemainingMs} />
              <div className="text-xs text-muted">
                Timeout:{" "}
                <span className="text-ink">
                  {legal.types.includes("check") ? "check" : "fold"}
                </span>
              </div>
              {ctx.lastOpponentAction && (
                <div className="ml-auto text-xs text-muted mono">
                  last opponent: {ctx.lastOpponentAction.type} ·{" "}
                  {formatDecisionTime(ctx.lastOpponentAction.decisionTimeMs)} ·{" "}
                  {decisionTimingBucket(ctx.lastOpponentAction.decisionTimeMs)}
                </div>
              )}
            </div>
            <div className="calibration-action-row flex flex-wrap items-center gap-3">
              <button className="btn" type="button" onClick={checkFold}>
                Check / Fold rest of hand
              </button>
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
                  Call {legal.callAmount.toLocaleString()} chips
                </button>
              )}
              {(legal.types.includes("bet") ||
                legal.types.includes("raise")) && (
                <div className="calibration-betting-controls flex items-center gap-3 flex-wrap">
                  <button
                    className="btn btn-primary"
                    onClick={() =>
                      act(legal.types.includes("bet") ? "bet" : "raise")
                    }
                  >
                    {legal.types.includes("bet") ? "Bet" : "Raise to"}{" "}
                    {betTo.toLocaleString()} chips
                  </button>
                  <input
                    type="range"
                    min={minimumBetTo}
                    max={legal.maxBetTo}
                    step={ms.session.config.smallBlind}
                    value={betTo}
                    onChange={(e) => setBetTo(Number(e.target.value))}
                    className="calibration-bet-slider w-48"
                    aria-label="Bet size in chips"
                  />
                  <ChipAmountInput
                    value={betTo}
                    min={minimumBetTo}
                    max={legal.maxBetTo}
                    step={ms.session.config.smallBlind}
                    onChange={setBetTo}
                  />
                  <div className="calibration-bet-shortcuts flex flex-wrap gap-1">
                    <button
                      className="btn text-xs px-2 py-1"
                      type="button"
                      disabled={!threeBigBlindIsLegal}
                      onClick={() => setBetTo(threeBigBlindChips)}
                      title="Set the total bet or raise to three times the big blind"
                    >
                      {threeBigBlindChips.toLocaleString()} chips (3× BB)
                    </button>
                    {[0.5, 0.66, 1].map((f) => (
                      <button
                        key={f}
                        className="btn text-xs px-2 py-1"
                        onClick={() =>
                          setBetTo(
                            Math.min(
                              legal.maxBetTo,
                              Math.max(
                                minimumBetTo,
                                Math.round(ctx.potSize * f) +
                                  (legal.types.includes("raise")
                                    ? legal.callAmount
                                    : 0),
                              ),
                            ),
                          )
                        }
                      >
                        {f === 1 ? "pot" : `${Math.round(f * 100)}%`}
                      </button>
                    ))}
                    <button
                      className="btn text-xs px-2 py-1"
                      onClick={() => setBetTo(legal.maxBetTo)}
                    >
                      all-in
                    </button>
                  </div>
                </div>
              )}
              <div
                className="calibration-pot-context ml-auto text-xs text-muted mono"
                title="SPR — stack-to-pot ratio"
              >
                pot {ctx.potSize.toLocaleString()} chips · to call{" "}
                {legal.callAmount.toLocaleString()} chips · SPR{" "}
                {ctx.stackToPotRatio.toFixed(1)}
              </div>
            </div>
          </div>
        ) : phase === "opponent-acting" ? (
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted">
              {opponentName} is thinking…{" "}
              {opponentCallAmount > 0
                ? `Facing ${opponentCallAmount.toLocaleString()} chips — check is unavailable. Chips move after the decision.`
                : "No bet to call."}
            </span>
          </div>
        ) : phase === "hand-done" ? (
          <div className="calibration-hand-done flex flex-wrap items-center justify-between gap-3">
            <span className="calibration-hand-result text-sm">{lastResult}</span>
            <button
              className="btn btn-primary calibration-next-hand"
              type="button"
              onClick={nextHand}
            >
              Next hand
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="font-semibold">
                Calibration complete — {ms.handsPlayed} hands,{" "}
                {ms.decisions.length} decisions.
              </div>
              {ms.handsPlayed < RELIABLE_SAMPLE_THRESHOLD && (
                <div className="text-xs text-muted mt-1">
                  Small sample: tendency estimates will carry wide confidence
                  intervals. You can always add another session later.
                </div>
              )}
              {error && (
                <div className="text-xs mt-1" style={{ color: "var(--loss)" }}>
                  {error}
                </div>
              )}
            </div>
            <button
              className="btn btn-primary ml-auto"
              onClick={save}
              disabled={saving}
            >
              {saving ? "Building your model…" : "Build my strategy profile"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
