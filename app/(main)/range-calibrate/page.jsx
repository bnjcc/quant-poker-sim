"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { getStore, newId } from "@/lib/storage/store";
import { usePokerSounds } from "@/lib/audio/poker-sounds";
import { PokerTable } from "@/components/PokerTable";
import { ActionClock } from "@/components/ActionClock";
import { ChipAmountInput } from "@/components/ChipAmountInput";
import { CalibrationGameSelector } from "@/components/CalibrationGameSelector";
import { StartingHandGrid } from "@/components/StartingHandGrid";
import { Empty, PageHeader, WarningNote, fmtChips } from "@/components/ui";
import { POSITIONS_BY_COUNT, PREFLOP_POSITION_ORDER } from "@/types/poker";

function emptyPositionRanges() {
  return Object.fromEntries(
    PREFLOP_POSITION_ORDER.map((position) => [position, new Set()]),
  );
}

export default function RangeCalibratePage() {
  const router = useRouter();
  const sessionRef = useRef(null);
  const advanceRef = useRef(() => undefined);
  const opponentTimerRef = useRef(null);
  const activeDecisionRef = useRef(null);
  const audibleCardsRef = useRef(null);
  const decisionStartedAtRef = useRef(0);
  const sounds = usePokerSounds();
  const [phase, setPhase] = useState("range");
  const [tableConfig, setTableConfig] = useState(DEFAULT_TABLE);
  const [selected, setSelected] = useState(() => new Set());
  const [rangeMode, setRangeMode] = useState("shared");
  const [activePosition, setActivePosition] = useState("UTG");
  const [positionRanges, setPositionRanges] = useState(emptyPositionRanges);
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
  const rerender = () => force((value) => value + 1);
  const tablePositions = useMemo(
    () =>
      PREFLOP_POSITION_ORDER.filter((position) =>
        POSITIONS_BY_COUNT[tableConfig.maxSeats].includes(position),
      ),
    [tableConfig.maxSeats],
  );
  const activeRange =
    rangeMode === "position" ? positionRanges[activePosition] : selected;
  const updateTableConfig = (nextTable) => {
    setTableConfig(nextTable);
    const nextPositions = PREFLOP_POSITION_ORDER.filter((position) =>
      POSITIONS_BY_COUNT[nextTable.maxSeats].includes(position),
    );
    if (!nextPositions.includes(activePosition)) {
      setActivePosition(nextPositions[0]);
    }
  };
  const updateActiveRange = (updater) => {
    if (rangeMode === "shared") {
      setSelected(updater);
      return;
    }
    setPositionRanges((current) => ({
      ...current,
      [activePosition]: updater(current[activePosition] ?? new Set()),
    }));
  };
  const toggleHand = (notation) => {
    updateActiveRange((current) => {
      const next = new Set(current);
      if (next.has(notation)) next.delete(notation);
      else next.add(notation);
      return next;
    });
  };
  const setHandSelected = (notation, active) => {
    updateActiveRange((current) => {
      if (current.has(notation) === active) return current;
      const next = new Set(current);
      if (active) next.add(notation);
      else next.delete(notation);
      return next;
    });
  };
  const addGroup = (predicate) => {
    updateActiveRange((current) => {
      const next = new Set(current);
      for (const hand of ALL_STARTING_HANDS)
        if (predicate(hand)) next.add(hand.notation);
      return next;
    });
  };
  const enablePositionRanges = () => {
    setPositionRanges((current) => {
      const alreadyConfigured = Object.values(current).some(
        (range) => range.size > 0,
      );
      if (alreadyConfigured || selected.size === 0) return current;
      return Object.fromEntries(
        PREFLOP_POSITION_ORDER.map((position) => [position, new Set(selected)]),
      );
    });
    setRangeMode("position");
  };
  const copyActiveRangeToAllPositions = () => {
    setPositionRanges(
      Object.fromEntries(
        PREFLOP_POSITION_ORDER.map((position) => [
          position,
          new Set(activeRange),
        ]),
      ),
    );
  };
  const advance = (session) => {
    const step = session.step(true);
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
      setOpponentName(
        step.engine.players.find((player) => player.seat === step.seat)?.name ??
          "Opponent",
      );
      setOpponentCallAmount(step.callAmount);
      setPhase("opponent-acting");
      opponentTimerRef.current = window.setTimeout(() => {
        opponentTimerRef.current = null;
        session.completeOpponentAction();
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
        advanceRef.current(session);
      }, step.liveDelayMs);
    } else if (step.kind === "hand-complete") {
      activeDecisionRef.current = null;
      setEngine(step.engine);
      setCtx(null);
      const result = step.history.results.find(
        (item) => item.seat === session.userSeat,
      );
      setLastResult(
        result
          ? `Hand #${step.history.handNumber}: ${fmtChips(result.net)} chips`
          : null,
      );
      setPhase(
        session.handsPlayed >= session.targetHands ? "done" : "hand-done",
      );
    } else {
      activeDecisionRef.current = null;
      setPhase("done");
    }
    rerender();
  };
  advanceRef.current = advance;
  const start = useCallback(() => {
    const serializedPositionRanges = Object.fromEntries(
      tablePositions.map((position) => [
        position,
        [...positionRanges[position]],
      ]),
    );
    if (
      (rangeMode === "shared" && selected.size === 0) ||
      (rangeMode === "position" &&
        Object.values(serializedPositionRanges).some(
          (range) => range.length === 0,
        ))
    ) {
      return;
    }
    sounds.unlock();
    audibleCardsRef.current = null;
    const hands = customTarget
      ? Math.max(5, Math.min(2000, Number(customTarget) || 50))
      : target;
    const session = new ManualSession({
      config: tableConfig,
      pool: buildPoolConfig(DEFAULT_POOL_SETTINGS),
      seed: `range-cal-${Date.now()}`,
      targetHands: hands,
      userBuyInBB: 100,
      fixedLineup: buildCalibrationLineup(tableConfig.maxSeats),
      ...(rangeMode === "position"
        ? { startingHandsByPosition: serializedPositionRanges }
        : { startingHands: [...selected] }),
    });
    sessionRef.current = session;
    setPhase("playing");
    advanceRef.current(session);
  }, [
    customTarget,
    positionRanges,
    rangeMode,
    selected,
    target,
    sounds,
    tableConfig,
    tablePositions,
  ]);
  const act = (type) => {
    const session = sessionRef.current;
    if (!session || !ctx || activeDecisionRef.current !== ctx) return;
    activeDecisionRef.current = null;
    const action =
      type === "bet" || type === "raise" ? { type, toAmount: betTo } : { type };
    sounds.playDecision(type);
    session.submitUserAction(
      ctx,
      action,
      Date.now() - decisionStartedAtRef.current,
    );
    setCtx(null);
    advanceRef.current(session);
  };
  const checkFold = () => {
    const session = sessionRef.current;
    if (!session || !ctx || activeDecisionRef.current !== ctx) return;
    activeDecisionRef.current = null;
    sounds.playDecision(timeoutAction(ctx).type);
    session.submitCheckFoldForHand(
      ctx,
      Date.now() - decisionStartedAtRef.current,
    );
    setCtx(null);
    advanceRef.current(session);
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
        const session = sessionRef.current;
        if (!session || activeDecisionRef.current !== ctx) return;
        activeDecisionRef.current = null;
        const action = timeoutAction(ctx);
        sounds.playDecision(action.type);
        session.submitUserAction(ctx, action, ACTION_CLOCK_MS, true);
        setCtx(null);
        advanceRef.current(session);
      },
      Math.max(0, deadline - Date.now()),
    );
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [ctx, phase, sounds]);
  useEffect(() => {
    const sessionIsActive =
      phase === "playing" ||
      phase === "opponent-acting" ||
      phase === "hand-done";
    document.body.classList.toggle(
      "calibration-session-active",
      sessionIsActive,
    );
    return () => document.body.classList.remove("calibration-session-active");
  }, [phase]);
  useEffect(
    () => () => {
      if (opponentTimerRef.current !== null)
        window.clearTimeout(opponentTimerRef.current);
    },
    [],
  );
  const nextHand = () => {
    const session = sessionRef.current;
    if (!session) return;
    const scrollLeft = window.scrollX;
    const scrollTop = window.scrollY;
    advanceRef.current(session);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ left: scrollLeft, top: scrollTop, behavior: "auto" });
      });
    });
  };
  const save = async () => {
    const session = sessionRef.current;
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const preflopRangesByPosition =
        rangeMode === "position"
          ? Object.fromEntries(
              tablePositions.map((position) => [
                position,
                [...positionRanges[position]].sort(),
              ]),
            )
          : undefined;
      const range = [
        ...new Set(
          preflopRangesByPosition
            ? Object.values(preflopRangesByPosition).flat()
            : [...selected],
        ),
      ].sort();
      const tendencies = computeTendencies(
        session.decisions,
        session.histories,
        session.userSeatByHand,
      );
      const policy = new BehavioralPolicy();
      policy.train(session.decisions, new Rng("range-train"));
      policy.setPreflopRange(range);
      if (preflopRangesByPosition) {
        policy.setPreflopRangesByPosition(preflopRangesByPosition);
      }
      const dataset = {
        id: newId("cal"),
        name: `Range-first calibration ${new Date().toLocaleString()} (${preflopRangesByPosition ? "position ranges" : `${range.length} hands`})`,
        createdAt: new Date().toISOString(),
        method: "range-first",
        calibrationDesign: "information-rich-v1",
        table: session.session.config,
        preflopRange: range,
        ...(preflopRangesByPosition ? { preflopRangesByPosition } : {}),
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
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save the calibration.",
      );
      setSaving(false);
    }
  };
  const session = sessionRef.current;
  const seats = useMemo(() => {
    if (!engine || !session) return [];
    const visibleActions = visibleActionBySeat(engine.actions, engine.street);
    const lastActionBySeat = new Map();
    for (const action of visibleActions.values()) {
      lastActionBySeat.set(
        action.seat,
        `${action.amount > 0 ? `${action.type} ${action.amount.toLocaleString()} chips` : action.type}${
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
      holeCards:
        player.seat === session.userSeat || engine.complete
          ? player.holeCards
          : null,
      // Earlier checks disappear for every seat that still owes a response.
      lastAction:
        engine.currentSeat === player.seat && !engine.complete
          ? undefined
          : lastActionBySeat.get(player.seat),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, engine, phase, session]);
  if (phase === "range") {
    const combos = rangeComboCount(activeRange);
    const percentage = (combos / 1326) * 100;
    const missingPositions = tablePositions.filter(
      (position) => positionRanges[position].size === 0,
    );
    const rangeReady =
      rangeMode === "shared"
        ? selected.size > 0
        : missingPositions.length === 0;
    return (
      <div>
        <PageHeader
          title="Range-first calibration"
          right={
            <Link href="/calibrate" className="btn">
              Calibrate all hands
            </Link>
          }
          sub="Choose the starting hands you play, then make decisions with a 45-second clock so you have time to calculate odds. Measurement opponents keep more pots alive and vary pressure and timing so each hand teaches the model more."
        />

        <div className="panel px-5 py-5 mb-4 max-w-2xl">
          <CalibrationGameSelector
            table={tableConfig}
            onChange={updateTableConfig}
          />
        </div>

        <div className="panel px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <div className="font-semibold">Pick your starting range</div>
              <div className="text-sm text-muted mt-1">
                {rangeMode === "position"
                  ? `Editing your ${activePosition} first-in range. Switch positions to give every seat its own chart.`
                  : "Click individual hands or add a group. This shared chart applies at every position."}
              </div>
            </div>
            <div className="text-right">
              <div className="mono font-bold text-accent">
                {activeRange.size} / 169 hands
              </div>
              <div className="text-xs text-muted mono">
                {combos} / 1,326 combos · {percentage.toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div
              className="inline-flex rounded-lg border border-line bg-panel2 p-1"
              aria-label="Range position mode"
            >
              <button
                className={`btn text-xs min-h-0 px-3 py-1.5 ${rangeMode === "shared" ? "btn-primary" : ""}`}
                type="button"
                onClick={() => setRangeMode("shared")}
                aria-pressed={rangeMode === "shared"}
              >
                Same at every position
              </button>
              <button
                className={`btn text-xs min-h-0 px-3 py-1.5 ${rangeMode === "position" ? "btn-primary" : ""}`}
                type="button"
                onClick={enablePositionRanges}
                aria-pressed={rangeMode === "position"}
              >
                Set by position
              </button>
            </div>
            {rangeMode === "position" && (
              <button
                className="btn text-xs"
                type="button"
                onClick={copyActiveRangeToAllPositions}
                disabled={activeRange.size === 0}
              >
                Copy {activePosition} to all positions
              </button>
            )}
          </div>

          {rangeMode === "position" && (
            <div
              className={`grid grid-cols-3 gap-2 mb-4 ${tableConfig.maxSeats === 9 ? "sm:grid-cols-5 lg:grid-cols-9" : "sm:grid-cols-6"}`}
              role="tablist"
              aria-label="Choose a table position"
            >
              {tablePositions.map((position) => {
                const range = positionRanges[position];
                const positionCombos = rangeComboCount(range);
                return (
                  <button
                    key={position}
                    className={`btn min-h-0 px-2 py-2 flex-col gap-0 ${activePosition === position ? "btn-primary" : ""}`}
                    type="button"
                    role="tab"
                    aria-selected={activePosition === position}
                    onClick={() => setActivePosition(position)}
                  >
                    <span className="mono text-xs font-bold">{position}</span>
                    <span className="text-[10px] opacity-75">
                      {range.size === 0
                        ? "not set"
                        : `${((positionCombos / 1326) * 100).toFixed(1)}%`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div
            className="flex flex-wrap gap-2 mb-4"
            aria-label="Range shortcuts"
          >
            <button
              className="btn text-xs"
              type="button"
              onClick={() => addGroup((hand) => hand.kind === "pair")}
            >
              + Pairs
            </button>
            <button
              className="btn text-xs"
              type="button"
              onClick={() => addGroup((hand) => hand.highRank === 14)}
            >
              + Aces
            </button>
            <button
              className="btn text-xs"
              type="button"
              onClick={() =>
                addGroup(
                  (hand) =>
                    hand.highRank >= 11 &&
                    hand.highRank <= 13 &&
                    hand.lowRank >= 11,
                )
              }
            >
              + Face cards
            </button>
            <button
              className="btn text-xs"
              type="button"
              onClick={() => addGroup((hand) => hand.kind === "suited")}
            >
              + Suited
            </button>
            <button
              className="btn text-xs"
              type="button"
              onClick={() =>
                addGroup((hand) => hand.highRank >= 10 && hand.lowRank >= 10)
              }
            >
              + Broadway
            </button>
            <button
              className="btn text-xs"
              type="button"
              onClick={() =>
                addGroup((hand) => hand.kind !== "pair" && hand.gap === 0)
              }
            >
              + Connectors
            </button>
            <button
              className="btn text-xs"
              type="button"
              onClick={() =>
                addGroup(
                  (hand) =>
                    hand.kind === "suited" &&
                    (hand.gap <= 2 ||
                      (hand.highRank === 14 && hand.lowRank <= 5)),
                )
              }
            >
              + Suited straight potential
            </button>
            <button
              className="btn text-xs"
              type="button"
              onClick={() =>
                updateActiveRange(
                  () =>
                    new Set(ALL_STARTING_HANDS.map((hand) => hand.notation)),
                )
              }
            >
              Select all
            </button>
            <button
              className="btn text-xs"
              type="button"
              onClick={() => updateActiveRange(() => new Set())}
              disabled={activeRange.size === 0}
            >
              Clear
            </button>
          </div>

          <StartingHandGrid
            selected={activeRange}
            onToggle={toggleHand}
            onSetSelected={setHandSelected}
          />
        </div>

        <div className="panel px-5 py-4 mt-4 max-w-2xl">
          <div className="label mb-3">
            How many selected hands will you play?
          </div>
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
              onChange={(event) =>
                setCustomTarget(event.target.value.replace(/\D/g, ""))
              }
              aria-label="Custom number of selected hands"
            />
          </div>
          <button
            className="btn btn-primary mt-5"
            type="button"
            onClick={start}
            disabled={!rangeReady}
          >
            Next: calibrate my betting
          </button>
          {!rangeReady && (
            <div className="text-xs text-muted mt-2">
              {rangeMode === "position"
                ? `Set at least one hand for: ${missingPositions.join(", ")}. Start with one chart and use “Copy to all positions” if you want a quick baseline.`
                : "Select at least one hand to continue."}
            </div>
          )}
        </div>

        <div className="mt-4 max-w-2xl">
          <WarningNote>
            Table: {tableConfig.maxSeats}-player, blinds{" "}
            {tableConfig.smallBlind}/{tableConfig.bigBlind} chips with a{" "}
            {(100 * tableConfig.bigBlind).toLocaleString()}-chip buy-in.{" "}
            {rangeMode === "position"
              ? "Each chart controls first-in preflop play from its named seat. "
              : "The selected range controls first-in preflop play at every position. "}
            When the simulation faces a raise, your recorded reactions and the
            model prior still determine whether it folds, calls, or raises.
            Calibration opponents get a hand-strength-weighted chance to defend
            raises and create later streets; calls are never forced. Experiments
            use the normal configured player pool. Timeouts check when free and
            fold otherwise. One selective aggressor at the calibration table
            sometimes raises or 3-bets playable hands to create realistic
            pressure decisions.
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
  const minimumBetTo = legal
    ? legal.types.includes("bet")
      ? legal.minBet
      : legal.minRaiseTo
    : 0;
  const threeBigBlindChips = threeBigBlindChipAmount(
    session.session.config.bigBlind,
  );
  const threeBigBlindIsLegal =
    threeBigBlindChips >= minimumBetTo &&
    threeBigBlindChips <= (legal?.maxBetTo ?? 0);
  const userPlayer = engine.players.find(
    (player) => player.seat === session.userSeat,
  );
  const currentHand =
    userPlayer?.holeCards?.length === 2
      ? holeNotation(userPlayer.holeCards)
      : null;
  const currentPosition = engine.positionOf(session.userSeat);
  return (
    <div className={phase === "done" ? "" : "calibration-play-layout"}>
      <div className="calibration-status-bar flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="calibration-session-summary">
          <span className="mono text-sm font-bold">
            Selected hand{" "}
            {Math.min(session.handsPlayed + 1, session.targetHands)} /{" "}
            {session.targetHands}
          </span>
          <span className="text-xs text-muted ml-3">
            {session.decisions.length} decisions recorded
          </span>
          <span className="text-xs text-muted ml-3 mono">
            {session.session.config.maxSeats}-player ·{" "}
            {session.session.config.smallBlind}/
            {session.session.config.bigBlind} chips
          </span>
        </div>
        <div className="calibration-session-tools flex items-center gap-4">
          {currentHand && (
            <span className="mono text-sm text-accent font-bold">
              {currentPosition} · {currentHand}
            </span>
          )}
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
              {session.session.userStack.toLocaleString()} chips
            </span>
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
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={() => act("fold")}
                >
                  Fold
                </button>
              )}
              {legal.types.includes("check") && (
                <button
                  className="btn"
                  type="button"
                  onClick={() => act("check")}
                >
                  Check
                </button>
              )}
              {legal.types.includes("call") && (
                <button
                  className="btn"
                  type="button"
                  onClick={() => act("call")}
                >
                  Call {legal.callAmount.toLocaleString()} chips
                </button>
              )}
              {(legal.types.includes("bet") ||
                legal.types.includes("raise")) && (
                <div className="calibration-betting-controls flex items-center gap-3 flex-wrap">
                  <button
                    className="btn btn-primary"
                    type="button"
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
                    step={session.session.config.smallBlind}
                    value={betTo}
                    onChange={(event) => setBetTo(Number(event.target.value))}
                    className="calibration-bet-slider w-48"
                    aria-label="Bet size in chips"
                  />
                  <ChipAmountInput
                    value={betTo}
                    min={minimumBetTo}
                    max={legal.maxBetTo}
                    step={session.session.config.smallBlind}
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
                                minimumBetTo,
                                Math.round(ctx.potSize * fraction) +
                                  (legal.types.includes("raise")
                                    ? legal.callAmount
                                    : 0),
                              ),
                            ),
                          )
                        }
                      >
                        {fraction === 1
                          ? "pot"
                          : `${Math.round(fraction * 100)}%`}
                      </button>
                    ))}
                    <button
                      className="btn text-xs px-2 py-1"
                      type="button"
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
              Next selected hand
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="font-semibold">
                Betting calibration complete — {session.handsPlayed} hands,{" "}
                {session.decisions.length} decisions.
              </div>
              {session.handsPlayed < RELIABLE_SAMPLE_THRESHOLD && (
                <div className="text-xs text-muted mt-1">
                  Small sample: action and sizing estimates will lean more
                  heavily on the model prior.
                </div>
              )}
              {error && <div className="text-xs text-loss mt-1">{error}</div>}
            </div>
            <button
              className="btn btn-primary ml-auto"
              type="button"
              onClick={save}
              disabled={saving}
            >
              {saving ? "Building your range model…" : "Save range strategy"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
