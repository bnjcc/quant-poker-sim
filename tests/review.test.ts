import { describe, expect, it } from "vitest";
import type { DecisionContext } from "@/types/decision";
import type {
  SimulatedUserDecision,
  StrategyReviewAnswer,
  StrategyReviewRound,
} from "@/types/experiment";
import type { HandHistory } from "@/types/poker";
import { BehavioralPolicy, strengthBucket } from "@/lib/player-model/policy";
import {
  buildCalibratedPolicy,
  reviewAccuracy,
  selectReviewDecisions,
} from "@/lib/player-model/review";
import { Rng } from "@/lib/poker/rng";

function context(handNumber: number): DecisionContext {
  return {
    handNumber,
    street: "preflop",
    position: "BB",
    holeCards: [{ rank: 7, suit: "c" }, { rank: 2, suit: "d" }],
    board: [],
    potSize: 3,
    betFaced: 2,
    effectiveStack: 98,
    stackToPotRatio: 98 / 3,
    activePlayers: 2,
    numRaisesThisStreet: 1,
    facedRaisePreflop: true,
    isPreflopAggressor: false,
    legal: {
      types: ["fold", "call", "raise"],
      callAmount: 2,
      minBet: 2,
      minRaiseTo: 6,
      maxBetTo: 100,
    },
    bigBlind: 2,
    lastOpponentAction: null,
  };
}

function hand(handNumber: number): HandHistory {
  return {
    handNumber,
    buttonSeat: 0,
    players: [
      { seat: 0, playerId: "user", name: "You", startingStack: 100, position: "BTN" },
      { seat: 1, playerId: "agent", name: "Villain", startingStack: 100, position: "BB" },
    ],
    holeCards: { 0: [{ rank: 7, suit: "c" }, { rank: 2, suit: "d" }] },
    board: [],
    actions: [],
    potsAwarded: [],
    rakeTaken: 0,
    results: [],
    manualSeat: null,
    seedState: "seed",
  };
}

function decision(handNumber: number): SimulatedUserDecision {
  return {
    handNumber,
    street: "preflop",
    probs: { fold: 0.2, call: 0.8 },
    confidence: handNumber / 100,
    chosen: "call",
    actionIndex: 0,
    context: context(handNumber),
  };
}

describe("strategy review sampling", () => {
  it("selects reviewable decisions from distinct hands spread across the run", () => {
    const hands = Array.from({ length: 20 }, (_, index) => hand(index + 1));
    const decisions = Array.from({ length: 20 }, (_, index) => decision(index + 1));

    const selected = selectReviewDecisions(hands, decisions, 8);

    expect(selected).toHaveLength(8);
    expect(new Set(selected.map((item) => item.handNumber)).size).toBe(8);
    expect(selected[0].handNumber).toBe(1);
    expect(selected.at(-1)?.handNumber).toBe(20);
  });

  it("ignores legacy logs that do not contain decision context", () => {
    const legacy = { ...decision(1), context: undefined, actionIndex: undefined };
    expect(selectReviewDecisions([hand(1)], [legacy])).toEqual([]);
  });
});

describe("review-driven calibration", () => {
  it("moves the learned policy toward the tester's corrected action", () => {
    const ctx = context(1);
    const base = new BehavioralPolicy();
    base.train(
      Array.from({ length: 18 }, () => ({ context: ctx, action: { type: "call" as const }, potFraction: null })),
      new Rng("base"),
    );
    const serialized = base.serialize();
    const bucket = strengthBucket(ctx, new Rng("bucket"));
    const before = base.probabilities(ctx, bucket).probs.fold;
    const answer: StrategyReviewAnswer = {
      handNumber: 1,
      actionIndex: 0,
      context: ctx,
      modelAction: { type: "call" },
      reviewedAction: { type: "fold" },
      agreed: false,
      modelConfidence: 0.7,
      modelProbabilities: { call: 0.8, fold: 0.2 },
    };
    const round: StrategyReviewRound = {
      id: "review_1",
      experimentId: "exp_1",
      calibrationId: "cal_1",
      roundNumber: 1,
      createdAt: "2026-07-17T00:00:00.000Z",
      simulationVersion: "1.3.0",
      seed: "test",
      answers: [answer],
      agreedCount: 0,
      correctedCount: 1,
      accuracy: 0,
      accepted: false,
    };

    const calibrated = BehavioralPolicy.deserialize(buildCalibratedPolicy(serialized, [round]));
    const after = calibrated.probabilities(ctx, bucket).probs.fold;

    expect(after).toBeGreaterThan(before);
    expect(calibrated.totalDecisions).toBe(serialized.totalDecisions + 6);
  });

  it("calculates weighted agreement from all reviewed answers", () => {
    const answers = [true, false, true].map((agreed, index) => ({
      handNumber: index + 1,
      actionIndex: 0,
      context: context(index + 1),
      modelAction: { type: "call" as const },
      reviewedAction: { type: agreed ? "call" as const : "fold" as const },
      agreed,
      modelConfidence: 0.5,
      modelProbabilities: { call: 0.5, fold: 0.5 },
    }));

    expect(reviewAccuracy(answers)).toEqual({
      agreedCount: 2,
      correctedCount: 1,
      accuracy: 2 / 3,
    });
  });
});
