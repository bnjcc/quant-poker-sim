import { describe, expect, it } from "vitest";
import { BehavioralPolicy, strengthBucket } from "@/lib/player-model/policy";
import {
  buildCalibratedPolicy,
  reviewAccuracy,
  sampleStoredUserDecisions,
  selectReviewDecisions,
} from "@/lib/player-model/review";
import { Rng } from "@/lib/poker/rng";
function context(
  handNumber,
  holeCards = [
    { rank: 7, suit: "c" },
    { rank: 2, suit: "d" },
  ],
) {
  return {
    handNumber,
    street: "preflop",
    position: "BB",
    holeCards,
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
function hand(handNumber) {
  return {
    handNumber,
    buttonSeat: 0,
    players: [
      {
        seat: 0,
        playerId: "user",
        name: "You",
        startingStack: 100,
        position: "BTN",
      },
      {
        seat: 1,
        playerId: "agent",
        name: "Villain",
        startingStack: 100,
        position: "BB",
      },
    ],
    holeCards: {
      0: [
        { rank: 7, suit: "c" },
        { rank: 2, suit: "d" },
      ],
    },
    board: [],
    actions: [],
    potsAwarded: [],
    rakeTaken: 0,
    results: [],
    manualSeat: null,
    seedState: "seed",
  };
}
function decision(handNumber, holeCards) {
  return {
    handNumber,
    street: "preflop",
    probs: { fold: 0.2, call: 0.8 },
    confidence: handNumber / 100,
    chosen: "call",
    actionIndex: 0,
    context: context(handNumber, holeCards),
  };
}
describe("strategy review sampling", () => {
  it("keeps review decisions spread across the full stored run", () => {
    const hands = Array.from({ length: 100 }, (_, index) => hand(index + 1));
    const decisions = Array.from({ length: 100 }, (_, index) =>
      decision(index + 1),
    );
    const sampled = sampleStoredUserDecisions(hands, decisions, 10);
    expect(sampled).toHaveLength(10);
    expect(sampled[0].handNumber).toBe(1);
    expect(sampled.at(-1)?.handNumber).toBe(100);
  });
  it("excludes decisions whose hand history was not stored", () => {
    const sampled = sampleStoredUserDecisions(
      [hand(2), hand(4)],
      [1, 2, 3, 4].map((handNumber) => decision(handNumber)),
    );
    expect(sampled.map((item) => item.handNumber)).toEqual([2, 4]);
  });
  it("selects reviewable decisions from distinct hands spread across the run", () => {
    const hands = Array.from({ length: 20 }, (_, index) => hand(index + 1));
    const decisions = Array.from({ length: 20 }, (_, index) =>
      decision(index + 1),
    );
    const selected = selectReviewDecisions(hands, decisions, 8);
    expect(selected).toHaveLength(8);
    expect(new Set(selected.map((item) => item.handNumber)).size).toBe(8);
    expect(selected[0].handNumber).toBe(1);
    expect(selected.at(-1)?.handNumber).toBe(20);
  });
  it("uses the requested review length instead of fixing reviews to eight hands", () => {
    const hands = Array.from({ length: 20 }, (_, index) => hand(index + 1));
    const decisions = Array.from({ length: 20 }, (_, index) =>
      decision(index + 1),
    );
    expect(selectReviewDecisions(hands, decisions, 3)).toHaveLength(3);
    expect(selectReviewDecisions(hands, decisions, 12)).toHaveLength(12);
    expect(selectReviewDecisions(hands, decisions, 0)).toEqual([]);
  });
  it("excludes every decision from hands outside an explicit range-first chart", () => {
    const aceKing = [
      { rank: 14, suit: "c" },
      { rank: 13, suit: "d" },
    ];
    const decisions = [
      decision(1, aceKing),
      decision(2),
      {
        ...decision(2),
        street: "flop",
        actionIndex: 4,
        context: { ...context(2), street: "flop" },
      },
    ];
    const selected = selectReviewDecisions([hand(1), hand(2)], decisions, 8, [
      "AKo",
    ]);
    expect(selected.map((item) => item.handNumber)).toEqual([1]);
  });
  it("leaves all-hands review sampling unchanged when no explicit range is supplied", () => {
    const selected = selectReviewDecisions(
      [hand(1), hand(2)],
      [decision(1), decision(2)],
      8,
    );
    expect(selected.map((item) => item.handNumber)).toEqual([1, 2]);
  });
  it("ignores legacy logs that do not contain decision context", () => {
    const legacy = {
      ...decision(1),
      context: undefined,
      actionIndex: undefined,
    };
    expect(selectReviewDecisions([hand(1)], [legacy])).toEqual([]);
  });
});
describe("review-driven calibration", () => {
  it("moves the learned policy toward the tester's corrected action", () => {
    const ctx = context(1);
    const base = new BehavioralPolicy();
    base.train(
      Array.from({ length: 18 }, () => ({
        context: ctx,
        action: { type: "call" },
        potFraction: null,
      })),
      new Rng("base"),
    );
    const serialized = base.serialize();
    const bucket = strengthBucket(ctx, new Rng("bucket"));
    const before = base.probabilities(ctx, bucket).probs.fold;
    const answer = {
      handNumber: 1,
      actionIndex: 0,
      context: ctx,
      modelAction: { type: "call" },
      reviewedAction: { type: "fold" },
      agreed: false,
      modelConfidence: 0.7,
      modelProbabilities: { call: 0.8, fold: 0.2 },
    };
    const round = {
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
    const calibrated = BehavioralPolicy.deserialize(
      buildCalibratedPolicy(serialized, [round]),
    );
    const after = calibrated.probabilities(ctx, bucket).probs.fold;
    expect(after).toBeGreaterThan(before);
    expect(calibrated.totalDecisions).toBe(serialized.totalDecisions + 6);
  });
  it("calculates weighted agreement from all reviewed answers", () => {
    const answers = [true, false, true].map((agreed, index) => ({
      handNumber: index + 1,
      actionIndex: 0,
      context: context(index + 1),
      modelAction: { type: "call" },
      reviewedAction: { type: agreed ? "call" : "fold" },
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
