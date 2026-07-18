import { describe, expect, it } from "vitest";
import { decideAgentAction, sampleAgentDecisionTiming } from "@/lib/agents/agent";
import { getPreset } from "@/lib/agents/profiles";
import { BehavioralPolicy, SerializedPolicy, strengthBucket } from "@/lib/player-model/policy";
import { cardsFromString } from "@/lib/poker/deck";
import { HandEngine } from "@/lib/poker/engine";
import { visibleActionBySeat } from "@/lib/poker/action-display";
import { Rng } from "@/lib/poker/rng";
import { buildPoolConfig, DEFAULT_POOL_SETTINGS, DEFAULT_TABLE } from "@/lib/simulation/defaults";
import { runSimulation } from "@/lib/simulation/runner";
import { ManualSession } from "@/lib/simulation/manual";
import { ContextTracker, normalizeActionToLegal } from "@/lib/simulation/table";
import {
  ACTION_CLOCK_MS,
  decisionTimingBucket,
  OPPONENT_LIVE_DELAY_MS,
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
    const stackBeforeCall = engine.players.find((player) => player.seat === 1)!.stack;
    tracker.apply(1, { type: "check" });
    const applied = engine.actions.at(-1)!;
    expect(applied.type).toBe("call");
    expect(engine.players.find((player) => player.seat === 1)!.stack).toBe(stackBeforeCall - applied.amount);
  });

  it("removes stale check labels from every opponent still facing a bet", () => {
    const actions = [
      { seat: 1, type: "call", amount: 2, street: "preflop", allIn: false },
      { seat: 1, type: "check", amount: 0, street: "flop", allIn: false },
      { seat: 2, type: "check", amount: 0, street: "flop", allIn: false },
      { seat: 0, type: "bet", amount: 10, street: "flop", allIn: false },
    ] as const;

    const facingBet = visibleActionBySeat([...actions], "flop");
    expect([...facingBet.entries()].map(([seat, action]) => [seat, action.type])).toEqual([[0, "bet"]]);

    const afterFirstResponse = visibleActionBySeat(
      [...actions, { seat: 1, type: "call", amount: 10, street: "flop", allIn: false }],
      "flop",
    );
    expect([...afterFirstResponse.entries()].map(([seat, action]) => [seat, action.type])).toEqual([
      [0, "bet"],
      [1, "call"],
    ]);
    expect(afterFirstResponse.has(2)).toBe(false);
  });

  it("records only legal checks throughout manual calibration hands", () => {
    const session = new ManualSession({
      config: { ...DEFAULT_TABLE, rake: { percentage: 0, cap: 0, noFlopNoDrop: true } },
      pool: buildPoolConfig(DEFAULT_POOL_SETTINGS),
      seed: "manual-legal-responses",
      targetHands: 20,
      userBuyInBB: 100,
    });

    let guard = 0;
    while (guard++ < 1_000) {
      const step = session.step(false);
      if (step.kind === "session-complete") break;
      if (step.kind !== "awaiting-user") continue;

      const legal = step.context.legal;
      if (legal.types.includes("bet")) {
        session.submitUserAction(step.context, { type: "bet", toAmount: legal.minBet });
      } else if (legal.types.includes("raise")) {
        session.submitUserAction(step.context, { type: "raise", toAmount: legal.minRaiseTo });
      } else if (legal.types.includes("call")) {
        session.submitUserAction(step.context, { type: "call" });
      } else if (legal.types.includes("check")) {
        session.submitUserAction(step.context, { type: "check" });
      } else {
        session.submitUserAction(step.context, { type: "fold" });
      }
    }

    expect(session.handsPlayed).toBe(20);
    let opponentResponsesToUserBet = 0;
    for (const history of session.histories) {
      let street = history.actions[0]?.street;
      let highestCommitment = 0;
      let priceSetter: number | null = null;
      let committedBySeat = new Map<number, number>();

      for (const action of history.actions) {
        if (action.street !== street) {
          street = action.street;
          highestCommitment = 0;
          priceSetter = null;
          committedBySeat = new Map<number, number>();
        }
        const committedBefore = committedBySeat.get(action.seat) ?? 0;
        if (action.type === "check") {
          expect(committedBefore).toBe(highestCommitment);
        }
        if (
          action.seat !== history.manualSeat &&
          committedBefore < highestCommitment &&
          priceSetter === history.manualSeat
        ) {
          opponentResponsesToUserBet++;
          expect(["fold", "call", "raise", "all-in"]).toContain(action.type);
        }
        const committedAfter = committedBefore + action.amount;
        committedBySeat.set(action.seat, committedAfter);
        if (committedAfter > highestCommitment) {
          highestCommitment = committedAfter;
          priceSetter = action.type === "post-sb" || action.type === "post-bb" ? null : action.seat;
        }
      }
    }
    expect(opponentResponsesToUserBet).toBeGreaterThan(0);
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

  it("shows paced opponent turns for 500ms while preserving their simulated timing", () => {
    const session = new ManualSession({
      config: DEFAULT_TABLE,
      pool: buildPoolConfig(DEFAULT_POOL_SETTINGS),
      seed: "short-live-opponent-preview",
      targetHands: 5,
      userBuyInBB: 100,
    });

    let checkedOpponent = false;
    for (let guard = 0; guard < 500 && !checkedOpponent; guard++) {
      const step = session.step(true);
      if (step.kind === "opponent-acting") {
        expect(step.liveDelayMs).toBe(OPPONENT_LIVE_DELAY_MS);
        expect(step.liveDelayMs).toBe(500);
        session.completeOpponentAction();
        expect(step.engine.actions.at(-1)?.decisionTimeMs).toBe(step.decisionTimeMs);
        checkedOpponent = true;
      } else if (step.kind === "awaiting-user") {
        const legal = step.context.legal;
        const action = legal.types.includes("check")
          ? { type: "check" as const }
          : legal.types.includes("call")
            ? { type: "call" as const }
            : { type: "fold" as const };
        session.submitUserAction(step.context, action, 500);
      } else if (step.kind === "session-complete") {
        break;
      }
    }

    expect(checkedOpponent).toBe(true);
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
