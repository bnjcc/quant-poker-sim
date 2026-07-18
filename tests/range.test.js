import { describe, expect, it } from "vitest";
import { cardsFromString, holeNotation } from "@/lib/poker/deck";
import { HandEngine } from "@/lib/poker/engine";
import {
  ALL_STARTING_HANDS,
  cardsForStartingHand,
  parseStartingHand,
  rangeComboCount,
} from "@/lib/poker/range";
import { Rng } from "@/lib/poker/rng";
import { BehavioralPolicy, strengthBucket } from "@/lib/player-model/policy";
import { ManualSession } from "@/lib/simulation/manual";
import {
  buildPoolConfig,
  DEFAULT_POOL_SETTINGS,
  DEFAULT_TABLE,
} from "@/lib/simulation/defaults";
describe("starting-hand ranges", () => {
  it("builds the full 169-hand matrix covering all 1,326 combinations", () => {
    expect(ALL_STARTING_HANDS).toHaveLength(169);
    expect(new Set(ALL_STARTING_HANDS.map((hand) => hand.notation)).size).toBe(
      169,
    );
    expect(
      rangeComboCount(ALL_STARTING_HANDS.map((hand) => hand.notation)),
    ).toBe(1326);
    expect(parseStartingHand("AA")?.combos).toBe(6);
    expect(parseStartingHand("AKs")?.combos).toBe(4);
    expect(parseStartingHand("AKo")?.combos).toBe(12);
  });
  it("turns range notation into matching concrete cards", () => {
    const rng = new Rng("range-cards");
    for (const notation of ["AA", "AKs", "T9o", "54s"]) {
      for (let sample = 0; sample < 20; sample++) {
        expect(holeNotation(cardsForStartingHand(notation, rng))).toBe(
          notation,
        );
      }
    }
  });
  it("can force a user's cards without duplicating them in the deck", () => {
    const forced = cardsFromString("AsKs");
    const engine = new HandEngine({
      players: [
        { seat: 0, playerId: "user", name: "You", stack: 200 },
        { seat: 1, playerId: "villain", name: "Villain", stack: 200 },
      ],
      buttonSeat: 0,
      config: DEFAULT_TABLE,
      rng: new Rng("forced"),
      handNumber: 1,
      forcedHoleCards: { 0: forced },
    });
    expect(
      engine.players.find((player) => player.seat === 0)?.holeCards,
    ).toEqual(forced);
    const allCards = engine.players.flatMap((player) => player.holeCards ?? []);
    expect(
      new Set(allCards.map((card) => `${card.rank}${card.suit}`)).size,
    ).toBe(4);
  });
  it("deals every range-first calibration hand from the selected range", () => {
    const selected = new Set(["AKs", "77"]);
    const session = new ManualSession({
      config: DEFAULT_TABLE,
      pool: buildPoolConfig(DEFAULT_POOL_SETTINGS),
      seed: "range-manual",
      targetHands: 12,
      userBuyInBB: 100,
      startingHands: [...selected],
    });
    let guard = 0;
    while (guard++ < 5000) {
      const step = session.step();
      if (step.kind === "session-complete") break;
      if (step.kind === "awaiting-user") {
        const action = step.context.legal.types.includes("fold")
          ? { type: "fold" }
          : { type: "check" };
        session.submitUserAction(step.context, action);
      }
    }
    expect(session.histories).toHaveLength(12);
    for (const history of session.histories) {
      expect(
        selected.has(holeNotation(history.holeCards[session.userSeat])),
      ).toBe(true);
    }
  });
});
describe("explicit range policy", () => {
  const baseContext = {
    handNumber: 1,
    street: "preflop",
    position: "CO",
    holeCards: cardsFromString("7c2d"),
    board: [],
    potSize: 3,
    betFaced: 2,
    effectiveStack: 200,
    stackToPotRatio: 66.7,
    activePlayers: 6,
    numRaisesThisStreet: 0,
    facedRaisePreflop: false,
    isPreflopAggressor: false,
    legal: {
      types: ["fold", "call", "raise"],
      callAmount: 2,
      minBet: 0,
      minRaiseTo: 6,
      maxBetTo: 200,
    },
    bigBlind: 2,
  };
  it("folds excluded first-in hands and always continues selected hands", () => {
    const policy = new BehavioralPolicy().setPreflopRange(["AKs"]);
    const excluded = policy.sample(baseContext, new Rng("excluded"));
    expect(excluded.action.type).toBe("fold");
    expect(excluded.explain.confidence).toBe(1);
    const selectedContext = {
      ...baseContext,
      holeCards: cardsFromString("AsKs"),
    };
    const probabilities = policy.probabilities(
      selectedContext,
      strengthBucket(selectedContext, new Rng("strength")),
    );
    expect(probabilities.probs.fold).toBe(0);
    expect(
      Object.values(probabilities.probs).reduce((sum, value) => sum + value, 0),
    ).toBeCloseTo(1, 8);
    const restored = BehavioralPolicy.deserialize(policy.serialize());
    expect(restored.sample(baseContext, new Rng("restored")).action.type).toBe(
      "fold",
    );
  });
  it("does not treat the first-in range as a response-to-raise chart", () => {
    const policy = new BehavioralPolicy().setPreflopRange(["AKs"]);
    const facingRaise = {
      ...baseContext,
      facedRaisePreflop: true,
      numRaisesThisStreet: 1,
    };
    const sampled = policy.sample(facingRaise, new Rng("facing-raise"));
    expect(sampled.explain.bucketKey).not.toContain("explicit-range");
  });
});
