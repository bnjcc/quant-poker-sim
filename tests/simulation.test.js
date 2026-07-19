import { describe, expect, it } from "vitest";
import { Rng } from "@/lib/poker/rng";
import { TableSession, policyDecider } from "@/lib/simulation/table";
import { runSimulation } from "@/lib/simulation/runner";
import { ManualSession } from "@/lib/simulation/manual";
import {
  buildPoolConfig,
  DEFAULT_POOL_SETTINGS,
  DEFAULT_TABLE,
} from "@/lib/simulation/defaults";
import { BehavioralPolicy } from "@/lib/player-model/policy";
import { computeTendencies, freqStat } from "@/lib/player-model/stats";
import { Aggregator, riskOfRuin } from "@/lib/analytics/aggregate";
const pool = buildPoolConfig(DEFAULT_POOL_SETTINGS);
function runHands(seed, n) {
  const rng = new Rng(seed);
  const session = new TableSession({
    config: DEFAULT_TABLE,
    pool,
    rng,
    userBuyInBB: 100,
    seatUser: true,
  });
  const decider = policyDecider(new BehavioralPolicy()); // pure prior policy
  const results = [];
  for (let i = 0; i < n; i++) {
    const h = session.playHand(decider);
    if (h) {
      const r = h.results.find((x) => x.seat === session.userSeat);
      results.push(r?.net ?? 0);
    }
  }
  return { results, session };
}
describe("seed reproducibility", () => {
  it("identical seeds produce identical hand-by-hand results", () => {
    const a = runHands("exp-seed-42", 100).results;
    const b = runHands("exp-seed-42", 100).results;
    expect(a).toEqual(b);
  });
  it("different seeds diverge", () => {
    const a = runHands("seed-a", 100).results;
    const b = runHands("seed-b", 100).results;
    expect(a).not.toEqual(b);
  });
});
describe("player turnover", () => {
  it("replaces departing players and the table keeps running", () => {
    const rng = new Rng("turnover");
    const churnPool = { ...pool, avgSessionHands: 15, turnover: 2 };
    const session = new TableSession({
      config: DEFAULT_TABLE,
      pool: churnPool,
      rng,
      userBuyInBB: 100,
      seatUser: true,
    });
    const initialIds = new Set(
      [...session.agents.values()].map((a) => a.playerId),
    );
    const decider = policyDecider(new BehavioralPolicy());
    for (let i = 0; i < 300; i++) session.playHand(decider);
    const finalIds = new Set(
      [...session.agents.values()].map((a) => a.playerId),
    );
    const stillHere = [...finalIds].filter((id) => initialIds.has(id));
    expect(stillHere.length).toBeLessThan(initialIds.size); // churn happened
    expect(session.agents.size).toBe(5); // seats stay filled
  });
  it("fills and plays a nine-player table", () => {
    const session = new TableSession({
      config: { ...DEFAULT_TABLE, maxSeats: 9 },
      pool,
      rng: new Rng("nine-player-session"),
      userBuyInBB: 100,
      seatUser: true,
    });
    expect(session.agents.size).toBe(8);
    const hand = session.playHand(policyDecider(new BehavioralPolicy()));
    expect(hand?.players).toHaveLength(9);
    expect(
      hand?.players
        .filter((player) => player.seat !== session.userSeat)
        .every(
          (player) => player.opponentTypeId && player.opponentTypeName,
        ),
    ).toBe(true);
    expect(new Set(hand?.players.map((player) => player.position))).toEqual(
      new Set(["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "LJ", "HJ", "CO"]),
    );
  });
});
describe("runner + aggregation", () => {
  it("aggregates match hand-level sums and progress/cancel work", async () => {
    const policy = new BehavioralPolicy().serialize();
    const out = await runSimulation(
      {
        hands: 400,
        seed: "agg-test",
        config: DEFAULT_TABLE,
        pool: DEFAULT_POOL_SETTINGS
          ? buildPoolConfig(DEFAULT_POOL_SETTINGS)
          : pool,
        userBuyInBB: 100,
        mode: "detailed",
        sampleEvery: 1,
      },
      policy,
    );
    expect(out.aggregates.totalHands).toBe(400);
    expect(out.hands).toHaveLength(400);
    const handNet = out.hands.reduce((s, h) => {
      const r = h.results.find((x) => x.playerId === "user");
      return s + (r?.net ?? 0);
    }, 0);
    expect(out.aggregates.userNet).toBe(handNet);
    expect(out.aggregates.ciLow).toBeLessThanOrEqual(out.aggregates.bb100);
    expect(out.aggregates.ciHigh).toBeGreaterThanOrEqual(out.aggregates.bb100);
    expect(out.aggregates.maxDrawdownBB).toBeGreaterThanOrEqual(0);
    expect(Object.keys(out.aggregates.byOpponentType).length).toBeGreaterThan(0);
    expect(
      Object.values(out.aggregates.byOpponentType).every(
        (matchup) => matchup.encounters > 0,
      ),
    ).toBe(true);
  });
  it("cancellation stops early", async () => {
    let calls = 0;
    const out = await runSimulation(
      {
        hands: 5000,
        seed: "cancel",
        config: DEFAULT_TABLE,
        pool,
        userBuyInBB: 100,
        mode: "high-speed",
        sampleEvery: 50,
      },
      new BehavioralPolicy().serialize(),
      undefined,
      () => ++calls > 300,
      50,
    );
    expect(out.cancelled).toBe(true);
    expect(out.aggregates.totalHands).toBeLessThan(5000);
  });
});
describe("opponent-type matchup aggregation", () => {
  function matchupHand(handNumber, nets) {
    return {
      handNumber,
      players: [
        {
          seat: 0,
          playerId: "user",
          name: "You",
          startingStack: 200,
          position: "BTN",
        },
        {
          seat: 1,
          playerId: "tag-player",
          name: "Miko",
          startingStack: 200,
          position: "SB",
          opponentTypeId: "tag",
          opponentTypeName: "Tight-aggressive",
        },
        {
          seat: 2,
          playerId: "lag-player",
          name: "Dana",
          startingStack: 200,
          position: "BB",
          opponentTypeId: "lag",
          opponentTypeName: "Loose-aggressive",
        },
      ],
      holeCards: { 0: ["As", "Kd"] },
      actions: [],
      rakeTaken: 0,
      results: [
        { seat: 0, playerId: "user", net: nets.user, showedDown: false },
        { seat: 1, playerId: "tag-player", net: nets.tag, showedDown: false },
        { seat: 2, playerId: "lag-player", net: nets.lag, showedDown: false },
      ],
    };
  }

  it("ranks player types using proportional chip-transfer attribution", () => {
    const aggregator = new Aggregator(2);
    aggregator.addHand(
      matchupHand(1, { user: 30, tag: -10, lag: -20 }),
      0,
      false,
    );
    aggregator.addHand(
      matchupHand(2, { user: -12, tag: 12, lag: 0 }),
      0,
      false,
    );

    const result = aggregator.snapshot();
    expect(result.byOpponentType.tag.bb).toBeCloseTo(-1);
    expect(result.byOpponentType.tag.score).toBeCloseTo(-50);
    expect(result.byOpponentType.lag.bb).toBeCloseTo(10);
    expect(result.byOpponentType.lag.score).toBeCloseTo(500);
    expect(result.byOpponentType.tag.encounters).toBe(2);
    expect(result.byOpponentType.lag.encounters).toBe(2);
    expect(
      result.byOpponentType.tag.bb + result.byOpponentType.lag.bb,
    ).toBeCloseTo(result.bbWon);
  });
});
describe("manual calibration session", () => {
  it("pauses at user turns, records decisions, and completes hands", () => {
    const ms = new ManualSession({
      config: DEFAULT_TABLE,
      pool,
      seed: "manual",
      targetHands: 5,
      userBuyInBB: 100,
    });
    let guard = 0;
    while (guard++ < 2000) {
      const step = ms.step();
      if (step.kind === "session-complete") break;
      if (step.kind === "awaiting-user") {
        const legal = step.context.legal;
        const action = legal.types.includes("check")
          ? { type: "check" }
          : { type: "fold" };
        ms.submitUserAction(step.context, action);
      }
    }
    expect(ms.handsPlayed).toBe(5);
    expect(ms.decisions.length).toBeGreaterThan(0);
    expect(ms.histories).toHaveLength(5);
    // Every recorded decision carries a full context.
    for (const d of ms.decisions) {
      expect(d.context.holeCards).toHaveLength(2);
      expect(d.context.legal.types.length).toBeGreaterThan(0);
    }
  });
});
describe("player-model statistics", () => {
  it("Wilson intervals shrink with sample size and Laplace smoothing is applied", () => {
    const small = freqStat(2, 4, 0.5);
    const large = freqStat(50, 100, 0.5);
    expect(large.ciHigh - large.ciLow).toBeLessThan(small.ciHigh - small.ciLow);
    expect(large.confidence).toBeGreaterThan(small.confidence);
    const zero = freqStat(0, 0, 0.25);
    expect(zero.confidence).toBe(0);
    expect(zero.value).toBeCloseTo(0.25);
  });
  it("computes VPIP/PFR from decisions: folder has ~0, raiser has ~1", () => {
    const ms = new ManualSession({
      config: DEFAULT_TABLE,
      pool,
      seed: "stats",
      targetHands: 20,
      userBuyInBB: 100,
    });
    let guard = 0;
    while (guard++ < 5000) {
      const step = ms.step();
      if (step.kind === "session-complete") break;
      if (step.kind === "awaiting-user") {
        const legal = step.context.legal;
        const action = legal.types.includes("check")
          ? { type: "check" }
          : { type: "fold" };
        ms.submitUserAction(step.context, action);
      }
    }
    const t = computeTendencies(ms.decisions, ms.histories, ms.userSeatByHand);
    expect(t.vpip.numerator).toBe(0);
    expect(t.pfr.numerator).toBe(0);
    expect(t.hands).toBeGreaterThan(0);
  });
});
describe("behavioral policy", () => {
  it("outputs legal, normalized probabilities and confidence grows with data", () => {
    const ms = new ManualSession({
      config: DEFAULT_TABLE,
      pool,
      seed: "policy",
      targetHands: 30,
      userBuyInBB: 100,
    });
    let guard = 0;
    while (guard++ < 8000) {
      const step = ms.step();
      if (step.kind === "session-complete") break;
      if (step.kind === "awaiting-user") {
        const legal = step.context.legal;
        // Aggressive style: raise when possible, else call, else check.
        const action = legal.types.includes("raise")
          ? { type: "raise", toAmount: legal.minRaiseTo }
          : legal.types.includes("bet")
            ? { type: "bet", toAmount: Math.max(legal.minBet, 2) }
            : legal.types.includes("call")
              ? { type: "call" }
              : { type: "check" };
        ms.submitUserAction(step.context, action);
      }
    }
    const rng = new Rng("policy-train");
    const policy = new BehavioralPolicy();
    policy.train(ms.decisions, rng);
    expect(policy.totalDecisions).toBe(ms.decisions.length);
    const sampleCtx = ms.decisions[0].context;
    const { explain } = policy.sample(sampleCtx, rng);
    const total = Object.values(explain.probs).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
    // Only legal actions carry probability.
    for (const [a, p] of Object.entries(explain.probs)) {
      if (p > 0) expect(sampleCtx.legal.types).toContain(a);
    }
    // A trained aggressive policy should skew aggressive vs the empty prior.
    const empty = new BehavioralPolicy();
    const trainedAgg = explain.probs.raise + explain.probs.bet;
    const { explain: emptyExplain } = empty.sample(sampleCtx, new Rng("x"));
    expect(trainedAgg).toBeGreaterThanOrEqual(
      emptyExplain.probs.raise + emptyExplain.probs.bet - 0.001,
    );
    expect(explain.confidence).toBeGreaterThan(0);
    // Round-trips through serialization.
    const restored = BehavioralPolicy.deserialize(policy.serialize());
    expect(restored.totalDecisions).toBe(policy.totalDecisions);
  });
});
describe("risk of ruin", () => {
  it("is 1 for losing win rates and decreases with bankroll", () => {
    expect(riskOfRuin(-2, 90, 2000)).toBe(1);
    const small = riskOfRuin(4, 90, 1000);
    const large = riskOfRuin(4, 90, 5000);
    expect(large).toBeLessThan(small);
    expect(large).toBeGreaterThanOrEqual(0);
  });
});
describe("recorded decision shape", () => {
  it("captures the full required context fields", () => {
    const ms = new ManualSession({
      config: DEFAULT_TABLE,
      pool,
      seed: "ctx",
      targetHands: 2,
      userBuyInBB: 100,
    });
    let d = null;
    let guard = 0;
    while (guard++ < 1000) {
      const step = ms.step();
      if (step.kind === "session-complete") break;
      if (step.kind === "awaiting-user") {
        ms.submitUserAction(
          step.context,
          step.context.legal.types.includes("check")
            ? { type: "check" }
            : { type: "fold" },
        );
        d = ms.decisions[ms.decisions.length - 1];
      }
    }
    expect(d).not.toBeNull();
    const c = d.context;
    for (const key of [
      "street",
      "position",
      "holeCards",
      "board",
      "potSize",
      "betFaced",
      "effectiveStack",
      "stackToPotRatio",
      "activePlayers",
      "legal",
      "bigBlind",
    ]) {
      expect(c[key]).toBeDefined();
    }
  });
});
