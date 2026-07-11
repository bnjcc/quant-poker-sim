import { ChosenAction, DecisionContext } from "@/types/decision";
import { estimateEquity, preflopStrength } from "@/lib/poker/equity";
import { Rng } from "@/lib/poker/rng";
import { AgentProfile } from "./profiles";

/** Lightweight running memory of table events an agent can react to. */
export interface AgentMemory {
  /** Observed table aggression: raises per hand seen recently. */
  recentRaises: number;
  handsObserved: number;
  /** For adaptive agents: observed fold-to-cbet across the table. */
  observedFolds: number;
  observedCalls: number;
}

export function freshMemory(): AgentMemory {
  return { recentRaises: 0, handsObserved: 0, observedFolds: 0, observedCalls: 0 };
}

const POSITION_LOOSENESS: Record<string, number> = {
  UTG: -0.06, HJ: -0.02, CO: 0.03, BTN: 0.08, SB: -0.02, BB: 0.02,
};

/**
 * Sample an action for an agent. Non-deterministic by design (styles are
 * probability distributions), but fully reproducible through the seeded RNG.
 */
export function decideAgentAction(
  profile: AgentProfile,
  ctx: DecisionContext,
  rng: Rng,
  memory: AgentMemory,
): ChosenAction {
  if (profile.id === "random") return randomAction(ctx, rng, profile);
  if (ctx.street === "preflop") return preflopDecision(profile, ctx, rng);
  return postflopDecision(profile, ctx, rng, memory);
}

function positionAdj(profile: AgentProfile, ctx: DecisionContext): number {
  return (POSITION_LOOSENESS[ctx.position] ?? 0) * profile.positionalAwareness;
}

function stackAdj(profile: AgentProfile, ctx: DecisionContext): number {
  // Short stacks tighten calling ranges, deep stacks loosen implied-odds hands.
  const bbDepth = ctx.effectiveStack / ctx.bigBlind;
  if (bbDepth < 40) return -0.05 * profile.stackAwareness;
  if (bbDepth > 150) return 0.03 * profile.stackAwareness;
  return 0;
}

function sizeBet(profile: AgentProfile, ctx: DecisionContext, rng: Rng, raising: boolean): number {
  const frac = Math.max(0.25, rng.gaussian(profile.betSizeMean, profile.betSizeStd));
  if (ctx.street === "preflop") {
    if (!raising || ctx.betFaced <= ctx.bigBlind) {
      // Open raise: 2.2–3.5bb style
      const openTo = Math.round(ctx.bigBlind * Math.max(2, rng.gaussian(2.7, 0.4)));
      return clampTo(openTo, ctx);
    }
    // 3-bet+: ~3x the bet faced
    const to = Math.round((ctx.legal.callAmount + ctx.potSize) * Math.max(0.8, rng.gaussian(1.0, 0.15)));
    return clampTo(Math.max(to, ctx.legal.minRaiseTo), ctx);
  }
  if (raising) {
    const to = Math.round(ctx.legal.minRaiseTo + frac * ctx.potSize);
    return clampTo(to, ctx);
  }
  return clampTo(Math.max(ctx.legal.minBet, Math.round(frac * ctx.potSize)), ctx);
}

function clampTo(to: number, ctx: DecisionContext): number {
  return Math.min(Math.max(to, 1), ctx.legal.maxBetTo);
}

function preflopDecision(profile: AgentProfile, ctx: DecisionContext, rng: Rng): ChosenAction {
  const strength = preflopStrength(ctx.holeCards);
  const loose = positionAdj(profile, ctx) + stackAdj(profile, ctx);
  // Skill noise: weaker players misjudge hand strength more.
  const noisy = strength + rng.gaussian(0, 0.08 * (1 - profile.skill));
  const canCheck = ctx.legal.types.includes("check");

  if (!ctx.facedRaisePreflop) {
    // Unopened or limped pot (or BB option).
    const playThreshold = 1 - (profile.vpip + loose);
    if (noisy < playThreshold && !canCheck) return { type: "fold" };
    if (noisy < playThreshold && canCheck) return { type: "check" };

    const raiseShare = profile.pfr / Math.max(profile.vpip, 0.01);
    const strongEnoughToRaise = noisy > playThreshold + (1 - playThreshold) * (1 - raiseShare);
    if (strongEnoughToRaise && !rng.chance(profile.limp)) {
      if (ctx.legal.types.includes("raise")) return { type: "raise", toAmount: sizeBet(profile, ctx, rng, true) };
      if (ctx.legal.types.includes("bet")) return { type: "bet", toAmount: sizeBet(profile, ctx, rng, false) };
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
    if (noisy > 0.82 && !rng.chance(profile.foldToThreeBet)) return { type: "call" };
    return { type: "fold" };
  }

  if (noisy > threeBetThreshold && rng.chance(profile.threeBet) && ctx.legal.types.includes("raise")) {
    return { type: "raise", toAmount: sizeBet(profile, ctx, rng, true) };
  }
  // Occasional light 3-bet bluff.
  if (rng.chance(profile.bluff * 0.15) && ctx.legal.types.includes("raise") && noisy > 0.5) {
    return { type: "raise", toAmount: sizeBet(profile, ctx, rng, true) };
  }
  if (noisy > defendThreshold) {
    // Pot-odds sanity for very large bets.
    const potOdds = ctx.legal.callAmount / (ctx.potSize + ctx.legal.callAmount);
    if (potOdds > 0.45 && noisy < 0.9 && !rng.chance(0.2)) return { type: "fold" };
    return { type: "call" };
  }
  return { type: "fold" };
}

function postflopDecision(
  profile: AgentProfile,
  ctx: DecisionContext,
  rng: Rng,
  memory: AgentMemory,
): ChosenAction {
  // Cheap Monte Carlo equity, degraded by (lack of) skill.
  const iterations = 60 + Math.round(profile.skill * 80);
  const eq = estimateEquity(ctx.holeCards, ctx.board, Math.max(1, ctx.activePlayers - 1), rng, iterations);
  const noisyEq = Math.max(0, Math.min(1, eq + rng.gaussian(0, 0.1 * (1 - profile.skill))));
  const facingBet = ctx.legal.callAmount > 0;

  // Adaptive agents exploit a table that folds too much by bluffing more.
  let bluffBoost = 1;
  if (profile.adaptive && memory.observedFolds + memory.observedCalls > 20) {
    const foldRate = memory.observedFolds / (memory.observedFolds + memory.observedCalls);
    bluffBoost = foldRate > 0.55 ? 1.6 : foldRate < 0.35 ? 0.5 : 1;
  }

  if (!facingBet) {
    const isAggressor = ctx.isPreflopAggressor;
    const streetAggr =
      ctx.street === "flop" ? profile.aggression : ctx.street === "turn" ? profile.aggression * 0.9 : profile.aggression * 0.85;

    // Value bet
    if (noisyEq > 0.62 && rng.chance(streetAggr + 0.15)) {
      return { type: "bet", toAmount: sizeBet(profile, ctx, rng, false) };
    }
    // Continuation bet
    if (isAggressor && ctx.street === "flop" && rng.chance(profile.cbet)) {
      return { type: "bet", toAmount: sizeBet(profile, ctx, rng, false) };
    }
    // Bluff
    if (noisyEq < 0.4 && rng.chance(profile.bluff * bluffBoost * 0.5)) {
      return { type: "bet", toAmount: sizeBet(profile, ctx, rng, false) };
    }
    return { type: "check" };
  }

  // Facing a bet.
  const potOdds = ctx.legal.callAmount / (ctx.potSize + ctx.legal.callAmount);
  const required = potOdds + profile.callPadding * 0.5 - stackAdj(profile, ctx);

  // Raise for value.
  if (noisyEq > 0.78 && ctx.legal.types.includes("raise") && rng.chance(profile.aggression)) {
    return { type: "raise", toAmount: sizeBet(profile, ctx, rng, true) };
  }
  // Check-raise / bluff-raise occasionally.
  if (noisyEq < 0.45 && ctx.legal.types.includes("raise") && rng.chance(profile.bluff * bluffBoost * 0.2)) {
    return { type: "raise", toAmount: sizeBet(profile, ctx, rng, true) };
  }
  if (noisyEq >= required) return { type: "call" };
  // Stations peel anyway sometimes.
  if (rng.chance(Math.max(0, -profile.callPadding))) return { type: "call" };
  return { type: "fold" };
}

function randomAction(ctx: DecisionContext, rng: Rng, profile: AgentProfile): ChosenAction {
  const types = ctx.legal.types;
  const pick = types[rng.int(types.length)];
  if (pick === "bet" || pick === "raise") {
    return { type: pick, toAmount: sizeBet(profile, ctx, rng, pick === "raise") };
  }
  return { type: pick };
}
