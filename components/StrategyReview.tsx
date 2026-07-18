"use client";

import { useEffect, useMemo, useState } from "react";
import { PokerTable, SeatView } from "./PokerTable";
import { ChosenAction } from "@/types/decision";
import {
  SimulatedUserDecision,
  StrategyReviewAnswer,
} from "@/types/experiment";
import { HandHistory, Street } from "@/types/poker";
import {
  DEFAULT_REVIEW_HAND_COUNT,
  ReviewableDecision,
  reviewAccuracy,
  selectReviewDecisions,
  simulatedAction,
} from "@/lib/player-model/review";

function stateBeforeAction(hand: HandHistory, upto: number) {
  const players = hand.players.map((player) => ({
    seat: player.seat,
    playerId: player.playerId,
    name: player.name,
    stack: player.startingStack,
    committed: 0,
    folded: false,
    allIn: false,
    lastAction: undefined as string | undefined,
  }));
  const bySeat = new Map(players.map((player) => [player.seat, player]));
  let street: Street = "preflop";
  let pot = 0;

  for (let index = 0; index < upto && index < hand.actions.length; index++) {
    const action = hand.actions[index];
    if (action.street !== street) {
      street = action.street;
      for (const player of players) player.committed = 0;
    }
    const player = bySeat.get(action.seat);
    if (!player) continue;
    if (action.type === "fold") player.folded = true;
    player.stack -= action.amount;
    player.committed += action.amount;
    pot += action.amount;
    if (action.allIn) player.allIn = true;
    player.lastAction = action.amount > 0 ? `${action.type} ${action.amount}` : action.type;
  }

  const next = hand.actions[upto];
  if (next && next.street !== street) {
    street = next.street;
    for (const player of players) player.committed = 0;
  }
  const boardCount = street === "preflop" ? 0 : street === "flop" ? 3 : street === "turn" ? 4 : 5;
  return { players, street, pot, board: hand.board.slice(0, boardCount) };
}

function formatAction(action: ChosenAction, bigBlind: number): string {
  if ((action.type === "bet" || action.type === "raise") && action.toAmount !== undefined) {
    return `${action.type} to ${(action.toAmount / bigBlind).toFixed(1)} bb`;
  }
  return action.type;
}

function defaultSizeBB(decision: ReviewableDecision, type: ChosenAction["type"], bigBlind: number): number {
  if (type === "bet" || type === "raise") {
    const legal = decision.context.legal;
    const minimum = type === "bet" ? legal.minBet : legal.minRaiseTo;
    const suggested = Math.round(decision.context.potSize * 0.66) + (type === "raise" ? legal.callAmount : 0);
    const chips = Math.min(legal.maxBetTo, Math.max(minimum, suggested));
    return Number((chips / bigBlind).toFixed(1));
  }
  return 0;
}

export function StrategyReview({
  hands,
  decisions,
  bigBlind,
  roundNumber,
  preflopRange,
  disabled = false,
  onComplete,
}: {
  hands: HandHistory[];
  decisions: SimulatedUserDecision[];
  bigBlind: number;
  roundNumber: number;
  preflopRange?: readonly string[];
  disabled?: boolean;
  onComplete: (answers: StrategyReviewAnswer[]) => void | Promise<void>;
}) {
  const eligibleDecisions = useMemo(
    () => selectReviewDecisions(hands, decisions, Number.MAX_SAFE_INTEGER, preflopRange),
    [hands, decisions, preflopRange],
  );
  const [reviewCount, setReviewCount] = useState(() =>
    Math.min(DEFAULT_REVIEW_HAND_COUNT, Math.max(1, eligibleDecisions.length)),
  );
  const [reviewStarted, setReviewStarted] = useState(false);
  const sample = useMemo(
    () => selectReviewDecisions(hands, decisions, reviewCount, preflopRange),
    [hands, decisions, preflopRange, reviewCount],
  );
  const handByNumber = useMemo(
    () => new Map(hands.map((hand) => [hand.handNumber, hand])),
    [hands],
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, StrategyReviewAnswer>>({});
  const [correcting, setCorrecting] = useState(false);
  const [alternativeType, setAlternativeType] = useState<ChosenAction["type"]>("fold");
  const [alternativeSizeBB, setAlternativeSizeBB] = useState(0);
  const [replayStep, setReplayStep] = useState(0);

  useEffect(() => {
    setReviewCount((count) => Math.min(eligibleDecisions.length, Math.max(1, count)));
  }, [eligibleDecisions.length]);

  const current = sample[currentIndex];
  const hand = current ? handByNumber.get(current.handNumber) : undefined;
  const key = current ? `${current.handNumber}:${current.actionIndex}` : "";
  const answered = key ? answers[key] : undefined;

  useEffect(() => {
    if (!current) return;
    setReplayStep(current.actionIndex);
    setCorrecting(false);
    const legal = current.context.legal.types;
    const model = simulatedAction(current);
    const alternative = legal.find((type) => type !== model.type) ?? legal[0] ?? "fold";
    setAlternativeType(alternative);
    setAlternativeSizeBB(defaultSizeBB(current, alternative, bigBlind));
  }, [current, bigBlind]);

  if (eligibleDecisions.length === 0) {
    return (
      <div className="text-sm text-muted">
        {preflopRange
          ? "This run does not contain review-ready decisions from starting hands in your selected range."
          : "This run does not contain review-ready decision context. Run the experiment again with engine v1.3 or newer."}
      </div>
    );
  }

  if (!reviewStarted) {
    return (
      <div className="rounded-md border border-line bg-panel2 px-4 py-4 max-w-xl">
        <div className="font-semibold">Choose your review length</div>
        <p className="text-xs text-muted mt-1">
          {eligibleDecisions.length.toLocaleString()} review-ready {eligibleDecisions.length === 1 ? "hand is" : "hands are"} available.
          {preflopRange ? " Hands outside your selected starting range are excluded." : ""}
        </p>
        <div className="mt-3">
          <div className="label mb-2">Quick choices</div>
          <div className="flex flex-wrap gap-2">
            {[8, 16, 25, 50]
              .filter((count) => count <= eligibleDecisions.length)
              .map((count) => (
                <button
                  key={count}
                  type="button"
                  className={`btn text-xs px-3 py-1 ${reviewCount === count ? "btn-primary" : ""}`}
                  onClick={() => setReviewCount(count)}
                >
                  {count} hands
                </button>
              ))}
            {eligibleDecisions.length > DEFAULT_REVIEW_HAND_COUNT && (
              <button
                type="button"
                className={`btn text-xs px-3 py-1 ${reviewCount === eligibleDecisions.length ? "btn-primary" : ""}`}
                onClick={() => setReviewCount(eligibleDecisions.length)}
              >
                All {eligibleDecisions.length.toLocaleString()}
              </button>
            )}
          </div>
        </div>
        <label className="block mt-3 max-w-48">
          <span className="label">Or enter any amount</span>
          <input
            type="number"
            className="field mt-1"
            min={1}
            max={eligibleDecisions.length}
            step={1}
            value={reviewCount}
            onChange={(event) => {
              const requested = Number(event.target.value);
              if (!Number.isFinite(requested)) return;
              setReviewCount(Math.min(eligibleDecisions.length, Math.max(1, Math.floor(requested))));
            }}
          />
        </label>
        <button
          className="btn btn-primary mt-3"
          onClick={() => setReviewStarted(true)}
          disabled={disabled}
        >
          Begin {reviewCount}-hand review
        </button>
      </div>
    );
  }

  const record = (reviewedAction: ChosenAction, agreed: boolean) => {
    if (!current) return;
    const answer: StrategyReviewAnswer = {
      handNumber: current.handNumber,
      actionIndex: current.actionIndex,
      context: current.context,
      modelAction: simulatedAction(current),
      reviewedAction,
      agreed,
      modelConfidence: current.confidence,
      modelProbabilities: current.probs,
    };
    setAnswers((existing) => ({ ...existing, [key]: answer }));
    setCurrentIndex((index) => index + 1);
  };

  const saveCorrection = () => {
    if (!current) return;
    let action: ChosenAction = { type: alternativeType };
    if (alternativeType === "bet" || alternativeType === "raise") {
      const legal = current.context.legal;
      const minimum = alternativeType === "bet" ? legal.minBet : legal.minRaiseTo;
      const chips = Math.round(alternativeSizeBB * bigBlind);
      action = {
        type: alternativeType,
        toAmount: Math.min(legal.maxBetTo, Math.max(minimum, chips)),
      };
    }
    record(action, false);
  };

  if (currentIndex >= sample.length) {
    const ordered = sample
      .map((decision) => answers[`${decision.handNumber}:${decision.actionIndex}`])
      .filter((answer): answer is StrategyReviewAnswer => Boolean(answer));
    const stats = reviewAccuracy(ordered);
    return (
      <div>
        <div className="rounded-md border border-line bg-panel2 px-4 py-4">
          <div className="font-semibold">Review round {roundNumber} complete</div>
          <div className="grid grid-cols-3 gap-3 mt-3 max-w-lg text-sm">
            <div><span className="mono text-lg text-ink">{ordered.length}</span><div className="text-xs text-muted">decisions</div></div>
            <div><span className="mono text-lg" style={{ color: "var(--gain)" }}>{stats.agreedCount}</span><div className="text-xs text-muted">accurate</div></div>
            <div><span className="mono text-lg" style={{ color: "var(--loss)" }}>{stats.correctedCount}</span><div className="text-xs text-muted">corrections</div></div>
          </div>
          <p className="text-xs text-muted mt-3 max-w-2xl">
            {stats.correctedCount === 0
              ? "The model is accepted. Your feedback will be saved and no rerun is needed."
              : "Your feedback will be saved, added to this experiment's strategy model, and the simulation will rerun automatically."}
          </p>
        </div>
        <div className="flex gap-2 mt-3">
          <button className="btn" onClick={() => setCurrentIndex(sample.length - 1)} disabled={disabled}>
            Back
          </button>
          <button className="btn btn-primary" onClick={() => onComplete(ordered)} disabled={disabled || ordered.length !== sample.length}>
            {disabled ? "Saving…" : stats.correctedCount === 0 ? "Save & accept model" : "Save & rerun calibrated model"}
          </button>
        </div>
      </div>
    );
  }

  if (!current || !hand) return null;
  const tableState = stateBeforeAction(hand, replayStep);
  const userSeat = hand.players.find((player) => player.playerId === "user")?.seat;
  const atDecision = replayStep === current.actionIndex;
  const seats: SeatView[] = tableState.players.map((player) => ({
    seat: player.seat,
    name: player.playerId === "user" ? "You (model)" : player.name,
    stack: player.stack,
    committed: player.committed,
    folded: player.folded,
    allIn: player.allIn,
    isButton: player.seat === hand.buttonSeat,
    isActing: atDecision && player.seat === userSeat,
    isUser: player.seat === userSeat,
    holeCards: player.seat === userSeat ? (hand.holeCards[player.seat] ?? null) : null,
    lastAction: player.lastAction,
  }));
  const modelAction = simulatedAction(current);
  const sortedProbabilities = Object.entries(current.probs)
    .filter(([, probability]) => probability > 0)
    .sort((a, b) => b[1] - a[1]);
  const legal = current.context.legal;
  const sizeMinimum = alternativeType === "bet" ? legal.minBet : legal.minRaiseTo;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="font-semibold">Decision {currentIndex + 1} of {sample.length}</div>
          <div className="text-xs text-muted mono">hand #{current.handNumber} · {current.street} · review round {roundNumber}</div>
        </div>
        <div className="text-xs text-muted">{Object.keys(answers).length}/{sample.length} reviewed</div>
      </div>

      <PokerTable seats={seats} board={tableState.board} pot={tableState.pot} street={tableState.street} />

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button className="btn text-xs px-2 py-1" onClick={() => setReplayStep(0)} disabled={replayStep === 0}>Start</button>
        <button className="btn text-xs px-2 py-1" onClick={() => setReplayStep((step) => Math.max(0, step - 1))} disabled={replayStep === 0}>Back</button>
        <button className="btn text-xs px-2 py-1" onClick={() => setReplayStep((step) => Math.min(current.actionIndex, step + 1))} disabled={atDecision}>Forward</button>
        <button className="btn text-xs px-2 py-1" onClick={() => setReplayStep(current.actionIndex)} disabled={atDecision}>Decision</button>
        <span className="mono text-xs text-muted ml-auto">action {replayStep}/{current.actionIndex}</span>
      </div>

      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4 mt-4">
        <div className="rounded-md border border-line bg-panel2 px-4 py-3">
          <div className="label">Simulated decision</div>
          <div className="mono text-xl font-bold text-accent mt-1">{formatAction(modelAction, bigBlind)}</div>
          <div className="text-xs text-muted mt-2">
            pot {(current.context.potSize / bigBlind).toFixed(1)} bb · call {(current.context.betFaced / bigBlind).toFixed(1)} bb · model confidence {(current.confidence * 100).toFixed(0)}%
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {sortedProbabilities.map(([action, probability]) => (
              <span key={action} className="mono text-[11px] text-muted">{action} {(probability * 100).toFixed(0)}%</span>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-line px-4 py-3">
          <div className="font-semibold text-sm">Would you make this decision?</div>
          {answered && <div className="text-xs text-info mt-1">Previously marked: {answered.agreed ? "accurate" : formatAction(answered.reviewedAction, bigBlind)}</div>}
          {!correcting ? (
            <div className="flex flex-wrap gap-2 mt-3">
              <button className="btn btn-primary" onClick={() => record(modelAction, true)} disabled={disabled}>Yes, I would do this</button>
              <button className="btn" onClick={() => setCorrecting(true)} disabled={disabled}>No, make my decision</button>
            </div>
          ) : (
            <div className="mt-3">
              <label className="block">
                <span className="label">My decision</span>
                <select
                  className="field mt-1"
                  value={alternativeType}
                  onChange={(event) => {
                    const type = event.target.value as ChosenAction["type"];
                    setAlternativeType(type);
                    setAlternativeSizeBB(defaultSizeBB(current, type, bigBlind));
                  }}
                >
                  {legal.types.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              {(alternativeType === "bet" || alternativeType === "raise") && (
                <div className="mt-2">
                  <label className="block">
                    <span className="label">{alternativeType === "raise" ? "Raise to" : "Bet"} (bb)</span>
                    <input
                      type="number"
                      className="field mt-1"
                      min={sizeMinimum / bigBlind}
                      max={legal.maxBetTo / bigBlind}
                      step={0.5}
                      value={alternativeSizeBB}
                      onChange={(event) => setAlternativeSizeBB(Number(event.target.value))}
                    />
                  </label>
                  <input
                    type="range"
                    className="w-full mt-3"
                    min={sizeMinimum / bigBlind}
                    max={legal.maxBetTo / bigBlind}
                    step={0.5}
                    value={alternativeSizeBB}
                    onChange={(event) => setAlternativeSizeBB(Number(event.target.value))}
                    aria-label="Review bet size"
                  />
                  <div className="flex flex-wrap gap-1 mt-2">
                    {[0.5, 0.66, 1].map((fraction) => (
                      <button
                        type="button"
                        key={fraction}
                        className="btn text-xs px-2 py-1"
                        onClick={() => {
                          const chips = Math.min(
                            legal.maxBetTo,
                            Math.max(
                              sizeMinimum,
                              Math.round(current.context.potSize * fraction) +
                                (alternativeType === "raise" ? legal.callAmount : 0),
                            ),
                          );
                          setAlternativeSizeBB(Number((chips / bigBlind).toFixed(1)));
                        }}
                      >
                        {fraction === 1 ? "pot" : `${Math.round(fraction * 100)}%`}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="btn text-xs px-2 py-1"
                      onClick={() => setAlternativeSizeBB(Number((legal.maxBetTo / bigBlind).toFixed(1)))}
                    >
                      all-in
                    </button>
                  </div>
                  <p className="text-[11px] text-muted mt-2">Starts at 66% of the pot, matching calibration hands.</p>
                </div>
              )}
              <div className="flex gap-2 mt-3">
                <button className="btn btn-primary" onClick={saveCorrection} disabled={disabled}>Save my decision</button>
                <button className="btn" onClick={() => setCorrecting(false)} disabled={disabled}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between mt-3">
        <button className="btn text-xs" onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))} disabled={currentIndex === 0 || disabled}>Previous review hand</button>
        {answered && <button className="btn text-xs" onClick={() => setCurrentIndex((index) => index + 1)} disabled={disabled}>Keep saved answer & continue</button>}
      </div>
    </div>
  );
}
