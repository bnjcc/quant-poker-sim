import { describe, expect, it } from "vitest";
import { decideAgentAction, sampleAgentDecisionTiming } from "@/lib/agents/agent";
import { getPreset } from "@/lib/agents/profiles";
import { BehavioralPolicy, SerializedPolicy, strengthBucket } from "@/lib/player-model/policy";
import { cardsFromString } from "@/lib/poker/deck";
import { HandEngine } from "@/lib/poker/engine";
import { Rng } from "@/lib/poker/rng";
import { buildPoolConfig, DEFAULT_POOL_SETTINGS, DEFAULT_TABLE } from "@/lib/simulation/defaults";
import { runSimulation } from "@/lib/simulation/runner";
import { ContextTracker, normalizeActionToLegal } from "@/lib/simulation/table";
import {
  ACTION_CLOCK_MS,
  decisionTimingBucket,
  SNAP_DECISION_MS,
  timeoutAction,
} from "@/lib/simulation/timing";
import { DecisionContext, RecordedDecision } from "@/types/decision";

const baseContext: DecisionContext = {
  handNumber: 1,
  street: "preflop",
  position: "CO",
  holeCards: cardsFromString("AsQh"),
  board: [],
  potSize: 9,
  betFaced: 6,
  effectiveStack: 200,
  stackToPotRatio: 22.2,
  activePlayers: 5,
  numRaisesThisStreet: 1,
  facedRaisePreflop: true,
  isPreflopAggressor: false,
  legal: { types: ["fold", "call", "raise"], callAmount: 6, minBet: 0, minRaiseTo: 14, maxBetTo: 200 },
  bigBlind: 2,
  lastOpponentAction: { seat: 2, type: "raise", decisionTimeMs: 500, timedOut: false },
};

describe("online action timing", () => {
  it("never permits a bot to check while facing a bet", () => {
    const legal = baseContext.legal;
    expect(legal.types).not.toContain("check");
    expect(normalizeActionToLegal({ type: "check" }, legal)).toEqual({ type: "call" });

    const engine = new HandEngine({
      players: [0, 1].map((seat) => ({ seat, playerId: `p${seat}`, name: `P${seat}`, stack: 200 })),
      buttonSeat: 0,
      config: { ...DEFAULT_TABLE, rake: { percentage: 0, cap: 0, noFlopNoDrop: true } },
      rng: new Rng("legal-check-facing-bet"),
      handNumber: 1,
    });
    const tracker = new ContextTracker(engine);
    tracker.apply(0, { type: "call" });
    tracker.apply(1, { type: "check" });
    tracker.apply(1, { type: "check" });
    tracker.apply(0, { type: "bet", toAmount: 10 });

    expect(engine.getLegalActions(1).types).toEqual(["fold", "call", "raise"]);
    tracker.apply(1, { type: "check" });
    expect(engine.actions.at(-1)?.type).toBe("call");
  });

  it("classifies snaps and tanks and selects the legal timeout default", () => {
    expect(decisionTimingBucket(SNAP_DECISION_MS)).toBe("snap");
    expect(decisionTimingBucket(3_000)).toBe("normal");
    expect(decisionTimingBucket(8_000)).toBe("tank");
    expect(timeoutAction(baseContext).type).toBe("fold");
    expect(timeoutAction({ ...baseContext, legal: { ...baseContext.legal, types: ["check", "bet"] } }).type).toBe("check");
  });

  it("paces most visible bot actions like human decisions", () => {
    const profile = getPreset("tag");
    const rng = new Rng("human-paced-opponents");
    const samples = Array.from({ length: 500 }, () =>
      sampleAgentDecisionTiming(profile, baseContext, { type: "call" }, rng).decisionTimeMs,
    );
    const subSecond = samples.filter((sample) => sample < 1_000).length / samples.length;
    const average = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;

    expect(subSecond).toBeLessThan(0.2);
    expect(average).toBeGreaterThan(2_500);
    expect(samples.every((sample) => sample <= ACTION_CLOCK_MS)).toBe(true);
  });

  it("puts elapsed timing into actions and the next opponent context", () => {
    const engine = new HandEngine({
      players: [0, 1, 2].map((seat) => ({ seat, playerId: `p${seat}`, name: `P${seat}`, stack: 200 })),
      buttonSeat: 0,
      config: { ...DEFAULT_TABLE, rake: { percentage: 0, cap: 0, noFlopNoDrop: true } },
      rng: new Rng("timing-context"),
      handNumber: 1,
    });
    const tracker = new ContextTracker(engine);
    tracker.apply(0, { type: "raise", toAmount: 6 }, { decisionTimeMs: 420, timedOut: false });

    const recorded = engine.actions.at(-1)!;
    expect(recorded.decisionTimeMs).toBe(420);
    expect(tracker.buildContext(1).lastOpponentAction).toEqual({
      seat: 0,
      type: "raise",
      decisionTimeMs: 420,
      timedOut: false,
    });
  });

  it("learns different actions after snap and tank timing cues", () => {
    const decisions: RecordedDecision[] = [];
    for (let i = 0; i < 24; i++) {
      decisions.push({
        context: { ...baseContext, handNumber: i + 1 },
        action: { type: "fold" },
        potFraction: null,
        responseTimeMs: 350,
        timedOut: false,
      });
      decisions.push({
        context: {
          ...baseContext,
          handNumber: i + 101,
          lastOpponentAction: { seat: 2, type: "raise", decisionTimeMs: 9_000, timedOut: false },
        },
        action: { type: "call" },
        potFraction: null,
        responseTimeMs: 5_500,
        timedOut: false,
      });
    }

    const policy = new BehavioralPolicy();
    policy.train(decisions, new Rng("timing-train"));
    const snapBucket = strengthBucket(baseContext, new Rng("strength"));
    const tankContext = {
      ...baseContext,
      lastOpponentAction: { seat: 2, type: "raise" as const, decisionTimeMs: 9_000, timedOut: false },
    };
    const snap = policy.probabilities(baseContext, snapBucket);
    const tank = policy.probabilities(tankContext, snapBucket);

    expect(snap.probs.fold).toBeGreaterThan(tank.probs.fold);
    expect(tank.probs.call).toBeGreaterThan(snap.probs.call);
    expect(policy.serialize().version).toBe(2);

    const legacy = {
      ...policy.serialize(),
      version: 1 as const,
      buckets: Object.fromEntries(
        Object.entries(policy.serialize().buckets)
          .filter(([key]) => key.split("|").length === 4)
          .map(([key, bucket]) => [key, { counts: bucket.counts, total: bucket.total, sizings: bucket.sizings }]),
      ),
    } satisfies SerializedPolicy;
    expect(BehavioralPolicy.deserialize(legacy).sample(baseContext, new Rng("legacy")).decisionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("records virtual timing in fast batch simulation without waiting", async () => {
    const output = await runSimulation(
      {
        hands: 20,
        seed: "timed-batch",
        config: DEFAULT_TABLE,
        pool: buildPoolConfig(DEFAULT_POOL_SETTINGS),
        userBuyInBB: 100,
        mode: "detailed",
        sampleEvery: 1,
      },
      new BehavioralPolicy().serialize(),
    );
    const voluntaryActions = output.hands.flatMap((hand) =>
      hand.actions.filter((action) => action.type !== "post-sb" && action.type !== "post-bb"),
    );
    expect(voluntaryActions.length).toBeGreaterThan(0);
    expect(voluntaryActions.every((action) => action.decisionTimeMs !== undefined)).toBe(true);
    expect(voluntaryActions.every((action) => (action.decisionTimeMs ?? 0) <= ACTION_CLOCK_MS)).toBe(true);
    expect(output.userDecisionLog.every((decision) => decision.decisionTimeMs !== undefined)).toBe(true);
    expect(output.userDecisionLog.every((decision) => decision.context?.holeCards.length === 2)).toBe(true);
    expect(output.userDecisionLog.every((decision) => decision.actionIndex !== undefined)).toBe(true);
  });

  it("keeps heuristic timing reads small enough to preserve legal decisions", () => {
    const action = decideAgentAction(getPreset("tag"), baseContext, new Rng("agent-timing"), {
      recentRaises: 0,
      handsObserved: 0,
      observedFolds: 0,
      observedCalls: 0,
    });
    expect(baseContext.legal.types).toContain(action.type);
  });
});
