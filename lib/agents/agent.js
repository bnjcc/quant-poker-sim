import { estimateEquity, preflopStrength } from "@/lib/poker/equity";
import {
  ACTION_CLOCK_MS,
  decisionTimingBucket,
  SNAP_DECISION_MS,
  TANK_DECISION_MS,
} from "@/lib/simulation/timing";
export function freshMemory() {
  return {
    recentRaises: 0,
    handsObserved: 0,
    observedFolds: 0,
    observedCalls: 0,
  };
}
const POSITION_LOOSENESS = {
  UTG: -0.08,
  "UTG+1": -0.065,
  MP: -0.045,
  LJ: -0.03,
  HJ: -0.02,
  CO: 0.03,
  BTN: 0.08,
  SB: -0.02,
  BB: 0.02,
};
/**
 * Sample an action for an agent. Non-deterministic by design (styles are
 * probability distributions), but fully reproducible through the seeded RNG.
 */
export function decideAgentAction(profile, ctx, rng, memory) {
  if (profile.id === "random") return randomAction(ctx, rng, profile);
  if (ctx.street === "preflop") return preflopDecision(profile, ctx, rng);
  return postflopDecision(profile, ctx, rng, memory);
}
/** Virtual online-poker action time. Batch simulations record it but never wait for it. */
export function sampleAgentDecisionTiming(profile, ctx, action, rng) {
  // Rare distracted timeout; the caller converts it to the legal check/fold default.
  if (rng.chance(0.003 * (1 - profile.skill))) {
    return { decisionTimeMs: ACTION_CLOCK_MS, timedOut: true };
  }
  const simpleAction = action.type === "check" || action.type === "fold";
  // Genuine snap actions still occur, but most visible calibration decisions
  // should take long enough to read as a person considering the spot.
  const snapChance = simpleAction ? 0.16 : action.type === "call" ? 0.07 : 0.04;
  if (rng.chance(snapChance)) {
    return {
      decisionTimeMs: Math.round(700 + rng.next() * (SNAP_DECISION_MS - 700)),
      timedOut: false,
    };
  }
  const base = simpleAction ? 1_950 : action.type === "call" ? 3_000 : 3_900;
  const streetExtra =
    ctx.street === "preflop"
      ? 0
      : ctx.street === "flop"
        ? 500
        : ctx.street === "turn"
          ? 950
          : 1_400;
  const pressure = Math.min(
    1_800,
    ctx.numRaisesThisStreet * 350 + (ctx.betFaced > 0 ? 350 : 0),
  );
  if (rng.chance(0.05 + profile.skill * 0.035)) {
    return {
      decisionTimeMs: Math.round(
        TANK_DECISION_MS +
          rng.next() * (ACTION_CLOCK_MS - TANK_DECISION_MS - 350),
      ),
      timedOut: false,
    };
  }
  return {
    decisionTimeMs: Math.round(
      Math.max(
        900,
        Math.min(
          ACTION_CLOCK_MS - 250,
          rng.gaussian(base + streetExtra + pressure, 800),
        ),
      ),
    ),
    timedOut: false,
  };
}
function positionAdj(profile, ctx) {
  return (POSITION_LOOSENESS[ctx.position] ?? 0) * profile.positionalAwareness;
}
function stackAdj(profile, ctx) {
  // Short stacks tighten calling ranges, deep stacks loosen implied-odds hands.
  const bbDepth = ctx.effectiveStack / ctx.bigBlind;
  if (bbDepth < 40) return -0.05 * profile.stackAwareness;
  if (bbDepth > 150) return 0.03 * profile.stackAwareness;
  return 0;
}
/**
 * A deliberately weak timing tell, capped to a few equity points. Real timing
 * is noisy; learned-user reactions are modeled from observations instead.
 */
function timingStrengthRead(profile, ctx) {
  const cue = ctx.lastOpponentAction;
  if (!cue || cue.timedOut) return 0;
  const bucket = decisionTimingBucket(cue.decisionTimeMs);
  let raw = 0;
  if (cue.type === "bet" || cue.type === "raise" || cue.type === "all-in") {
    raw = bucket === "tank" ? 0.03 : bucket === "snap" ? -0.012 : 0;
  } else if (cue.type === "check") {
    raw = bucket === "snap" ? -0.03 : bucket === "tank" ? 0.008 : 0;
  } else if (cue.type === "call" && bucket === "snap") {
    raw = 0.008;
  }
  return raw * (0.25 + profile.skill * 0.75);
}
function sizeBet(profile, ctx, rng, raising) {
  const frac = Math.max(
    0.25,
    rng.gaussian(profile.betSizeMean, profile.betSizeStd),
  );
  if (ctx.street === "preflop") {
    if (!raising || ctx.betFaced <= ctx.bigBlind) {
      // Open raise: 2.2–3.5bb style
      const openTo = Math.round(
        ctx.bigBlind * Math.max(2, rng.gaussian(2.7, 0.4)),
      );
      return clampTo(openTo, ctx);
    }
    // 3-bet+: ~3x the bet faced
    const to = Math.round(
      (ctx.legal.callAmount + ctx.potSize) *
        Math.max(0.8, rng.gaussian(1.0, 0.15)),
    );
    return clampTo(Math.max(to, ctx.legal.minRaiseTo), ctx);
  }
  if (raising) {
    const to = Math.round(ctx.legal.minRaiseTo + frac * ctx.potSize);
    return clampTo(to, ctx);
  }
  return clampTo(
    Math.max(ctx.legal.minBet, Math.round(frac * ctx.potSize)),
    ctx,
  );
}
function clampTo(to, ctx) {
  return Math.min(Math.max(to, 1), ctx.legal.maxBetTo);
}
function preflopDecision(profile, ctx, rng) {
  const strength = preflopStrength(ctx.holeCards);
  const loose = positionAdj(profile, ctx) + stackAdj(profile, ctx);
  // Skill noise: weaker players misjudge hand strength more.
  const noisy =
    strength +
    rng.gaussian(0, 0.08 * (1 - profile.skill)) -
    timingStrengthRead(profile, ctx);
  const canCheck = ctx.legal.types.includes("check");
  if (!ctx.facedRaisePreflop) {
    // Unopened or limped pot (or BB option).
    const playThreshold = 1 - (profile.vpip + loose);
    if (noisy < playThreshold && !canCheck) return { type: "fold" };
    if (noisy < playThreshold && canCheck) return { type: "check" };
    const raiseShare = profile.pfr / Math.max(profile.vpip, 0.01);
    const strongEnoughToRaise =
      noisy > playThreshold + (1 - playThreshold) * (1 - raiseShare);
    if (strongEnoughToRaise && !rng.chance(profile.limp)) {
      if (ctx.legal.types.includes("raise"))
        return { type: "raise", toAmount: sizeBet(profile, ctx, rng, true) };
      if (ctx.legal.types.includes("bet"))
        return { type: "bet", toAmount: sizeBet(profile, ctx, rng, false) };
    }
    if (ctx.legal.types.includes("call")) return { type: "call" };
    return canCheck ? { type: "check" } : { type: "fold" };
  }
  // Facing a raise.
  const defendThreshold = 1 - (profile.vpip * 0.55 + loose);
  const threeBetThreshold = 1 - profile.pfr * 0.35;
  const bbDepth = ctx.effectiveStack / ctx.bigBlind;
  if (ctx.numRaisesThisStreet >= 2) {
    // Facing a 3-bet or more.
    if (noisy > 0.93 || (bbDepth < 30 && noisy > 0.85)) {
      if (ctx.legal.types.includes("raise") && rng.chance(profile.threeBet)) {
        return { type: "raise", toAmount: sizeBet(profile, ctx, rng, true) };
      }
      return { type: "call" };
    }
    if (noisy > 0.82 && !rng.chance(profile.foldToThreeBet))
      return { type: "call" };
    return { type: "fold" };
  }
  if (
    noisy > threeBetThreshold &&
    rng.chance(profile.threeBet) &&
    ctx.legal.types.includes("raise")
  ) {
    return { type: "raise", toAmount: sizeBet(profile, ctx, rng, true) };
  }
  // Occasional light 3-bet bluff.
  if (
    rng.chance(profile.bluff * 0.15) &&
    ctx.legal.types.includes("raise") &&
    noisy > 0.5
  ) {
    return { type: "raise", toAmount: sizeBet(profile, ctx, rng, true) };
  }
  if (noisy > defendThreshold) {
    // Pot-odds sanity for very large bets.
    const potOdds = ctx.legal.callAmount / (ctx.potSize + ctx.legal.callAmount);
    if (potOdds > 0.45 && noisy < 0.9 && !rng.chance(0.2))
      return { type: "fold" };
    return { type: "call" };
  }
  return { type: "fold" };
}
function postflopDecision(profile, ctx, rng, memory) {
  // Cheap Monte Carlo equity, degraded by (lack of) skill.
  const iterations = 60 + Math.round(profile.skill * 80);
  const eq = estimateEquity(
    ctx.holeCards,
    ctx.board,
    Math.max(1, ctx.activePlayers - 1),
    rng,
    iterations,
  );
  const noisyEq = Math.max(
    0,
    Math.min(1, eq + rng.gaussian(0, 0.1 * (1 - profile.skill))),
  );
  const facingBet = ctx.legal.callAmount > 0;
  const timingRead = timingStrengthRead(profile, ctx);
  // Adaptive agents exploit a table that folds too much by bluffing more.
  let bluffBoost = 1;
  if (profile.adaptive && memory.observedFolds + memory.observedCalls > 20) {
    const foldRate =
      memory.observedFolds / (memory.observedFolds + memory.observedCalls);
    bluffBoost = foldRate > 0.55 ? 1.6 : foldRate < 0.35 ? 0.5 : 1;
  }
  if (!facingBet) {
    const isAggressor = ctx.isPreflopAggressor;
    const timingAggressionBoost = Math.max(0, -timingRead) * 3;
    const streetAggr =
      ctx.street === "flop"
        ? profile.aggression
        : ctx.street === "turn"
          ? profile.aggression * 0.9
          : profile.aggression * 0.85;
    // Value bet
    if (
      noisyEq > 0.62 &&
      rng.chance(streetAggr + 0.15 + timingAggressionBoost)
    ) {
      return { type: "bet", toAmount: sizeBet(profile, ctx, rng, false) };
    }
    // Continuation bet
    if (isAggressor && ctx.street === "flop" && rng.chance(profile.cbet)) {
      return { type: "bet", toAmount: sizeBet(profile, ctx, rng, false) };
    }
    // Bluff
    if (
      noisyEq < 0.4 &&
      rng.chance(profile.bluff * bluffBoost * 0.5 + timingAggressionBoost)
    ) {
      return { type: "bet", toAmount: sizeBet(profile, ctx, rng, false) };
    }
    return { type: "check" };
  }
  // Facing a bet.
  const potOdds = ctx.legal.callAmount / (ctx.potSize + ctx.legal.callAmount);
  const required =
    potOdds + profile.callPadding * 0.5 - stackAdj(profile, ctx) + timingRead;
  // Raise for value.
  if (
    noisyEq > 0.78 &&
    ctx.legal.types.includes("raise") &&
    rng.chance(profile.aggression)
  ) {
    return { type: "raise", toAmount: sizeBet(profile, ctx, rng, true) };
  }
  // Check-raise / bluff-raise occasionally.
  if (
    noisyEq < 0.45 &&
    ctx.legal.types.includes("raise") &&
    rng.chance(profile.bluff * bluffBoost * 0.2)
  ) {
    return { type: "raise", toAmount: sizeBet(profile, ctx, rng, true) };
  }
  if (noisyEq >= required) return { type: "call" };
  // Stations peel anyway sometimes.
  if (rng.chance(Math.max(0, -profile.callPadding))) return { type: "call" };
  return { type: "fold" };
}
function randomAction(ctx, rng, profile) {
  const types = ctx.legal.types;
  const pick = types[rng.int(types.length)];
  if (pick === "bet" || pick === "raise") {
    return {
      type: pick,
      toAmount: sizeBet(profile, ctx, rng, pick === "raise"),
    };
  }
  return { type: pick };
}
