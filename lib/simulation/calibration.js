import {
  decideAgentAction,
  sampleAgentDecisionTiming,
} from "@/lib/agents/agent";
import { preflopStrength } from "@/lib/poker/equity";
import { cardsForStartingHand, startingHandCombos } from "@/lib/poker/range";
import { ACTION_CLOCK_MS, SNAP_DECISION_MS, TANK_DECISION_MS } from "./timing";

const AGGRESSIVE_ACTIONS = new Set(["bet", "raise", "all-in"]);
const STREET_INDEX = { preflop: 0, flop: 1, turn: 2, river: 3 };

// Each six-hand block balances passive and pressure situations while timing
// cues rotate independently. Preflop actions remain hand-strength-driven.
const SCENARIOS = [
  { postflop: "passive", timing: "snap" },
  { postflop: "pressure", timing: "normal" },
  { postflop: "passive", timing: "tank" },
  { postflop: "pressure", timing: "snap" },
  { postflop: "passive", timing: "normal" },
  { postflop: "pressure", timing: "tank" },
];

export function calibrationScenario(handNumber) {
  return SCENARIOS[(Math.max(1, handNumber) - 1) % SCENARIOS.length];
}

/**
 * Deals a shuffled bag of starting-hand classes in exact combo proportions.
 * This retains the natural 4/6/12 weighting while avoiding the repeat-heavy
 * independent draws that waste a short calibration sample.
 */
export class CalibrationRangeSampler {
  rng;
  bags = new Map();
  constructor(rng) {
    this.rng = rng;
  }
  nextNotation(range, key = "shared") {
    const signature = [...range].sort().join(",");
    let state = this.bags.get(key);
    if (!state || state.signature !== signature || state.bag.length === 0) {
      // All Hold'em combo counts share a factor of two: suited=2 units,
      // pairs=3 units, offsuit=6 units. Dividing keeps the bag compact.
      const bag = range.flatMap((notation) =>
        Array.from(
          { length: Math.max(1, startingHandCombos(notation) / 2) },
          () => notation,
        ),
      );
      for (let i = bag.length - 1; i > 0; i--) {
        const j = this.rng.int(i + 1);
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      state = { signature, bag };
      this.bags.set(key, state);
    }
    return state.bag.pop();
  }
  nextCards(range, key = "shared") {
    return cardsForStartingHand(this.nextNotation(range, key), this.rng);
  }
}

function lastAggressionBy(actions, street, seat) {
  for (let index = actions.length - 1; index >= 0; index--) {
    const action = actions[index];
    if (
      action.street === street &&
      action.seat === seat &&
      AGGRESSIVE_ACTIONS.has(action.type)
    ) {
      return { action, index };
    }
  }
  return null;
}

function hasContinuedAfter(actions, street, index, userSeat) {
  return actions
    .slice(index + 1)
    .some(
      (action) =>
        action.street === street &&
        action.seat !== userSeat &&
        ["call", "raise", "all-in"].includes(action.type),
    );
}

function clampProbability(value, minimum = 0.02, maximum = 0.65) {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Extra calibration defend chance for a bot whose normal policy chose fold.
 * Better hands, looser profiles, and better prices defend more often; weak
 * hands and large commitments retain a very small chance and usually fold.
 */
export function calibrationDefendChance(profile, ctx) {
  const strength = preflopStrength(ctx.holeCards);
  const potOdds =
    ctx.legal.callAmount / Math.max(1, ctx.potSize + ctx.legal.callAmount);
  const stackCommitment =
    ctx.legal.callAmount / Math.max(1, ctx.effectiveStack);
  return clampProbability(
    0.04 +
      strength * 0.72 +
      profile.vpip * 0.22 -
      potOdds * 0.42 -
      Math.max(0, stackCommitment - 0.12) * 0.9,
  );
}

function calibrationPreflopResponse(profile, ctx, proposed, rng) {
  if (proposed.type !== "fold" || !ctx.legal.types.includes("call")) {
    return proposed;
  }
  return rng.chance(calibrationDefendChance(profile, ctx))
    ? { type: "call" }
    : proposed;
}

function calibratedPostflopBet(ctx, fraction = 0.55) {
  return {
    type: "bet",
    toAmount: Math.min(
      Math.max(ctx.legal.minBet, Math.round(ctx.potSize * fraction)),
      ctx.legal.maxBetTo,
    ),
  };
}

/**
 * Directs calibration-only opponents toward informative, legal situations.
 * Experiment opponents continue to use decideAgentAction directly.
 */
export class CalibrationDirector {
  userSeat;
  handNumber = 0;
  probeSeat = null;
  scenario = SCENARIOS[0];
  constructor(userSeat) {
    this.userSeat = userSeat;
  }
  beginHand(engine) {
    this.handNumber = engine.handNumber;
    this.probeSeat = null;
    this.scenario = calibrationScenario(engine.handNumber);
  }
  decide(profile, ctx, rng, memory, engine, seat) {
    const proposed = decideAgentAction(profile, ctx, rng, memory);
    const user = engine.player(this.userSeat);
    if (user.folded || user.allIn) return proposed;

    if (ctx.street === "preflop") {
      const userAggression = lastAggressionBy(
        engine.actions,
        "preflop",
        this.userSeat,
      );
      const ordinaryPrice =
        ctx.legal.callAmount / Math.max(1, ctx.effectiveStack) <= 0.3;
      if (userAggression && ordinaryPrice) {
        const defenderAlreadyContinued = hasContinuedAfter(
          engine.actions,
          "preflop",
          userAggression.index,
          this.userSeat,
        );
        if (!defenderAlreadyContinued) {
          const response = calibrationPreflopResponse(
            profile,
            ctx,
            proposed,
            rng,
          );
          if (response.type !== "fold") {
            this.probeSeat = seat;
          }
          return response;
        }
      }
      return proposed;
    }

    // The first postflop opponent becomes the sparring partner if preflop did
    // not already establish one. Other bots retain their normal profiles.
    this.probeSeat ??= seat;
    if (this.probeSeat !== seat) return proposed;

    const latestUserAggression = lastAggressionBy(
      engine.actions,
      ctx.street,
      this.userSeat,
    );
    const affordable =
      ctx.legal.callAmount / Math.max(1, ctx.effectiveStack) <= 0.35;
    if (
      ctx.legal.callAmount > 0 &&
      affordable &&
      ctx.legal.types.includes("call") &&
      (latestUserAggression || this.scenario.postflop === "passive")
    ) {
      // Calling normal-sized bets keeps the measurement hand alive through
      // later streets. Large bets and all-ins still receive the normal policy.
      return { type: "call" };
    }
    if (ctx.legal.callAmount === 0) {
      if (this.scenario.postflop === "passive") return { type: "check" };
      if (
        this.scenario.postflop === "pressure" &&
        ctx.legal.types.includes("bet")
      ) {
        return calibratedPostflopBet(
          ctx,
          ctx.street === "river" ? 0.7 : 0.55,
        );
      }
    }
    return proposed;
  }
  sampleTiming(profile, ctx, action, rng) {
    // Fall back to the ordinary sampler if a future scenario does not request
    // a cue. Current cycles intentionally provide equal snap/normal/tank hands.
    const target = this.scenario?.timing;
    if (!target) return sampleAgentDecisionTiming(profile, ctx, action, rng);
    if (target === "snap") {
      return {
        decisionTimeMs: Math.round(700 + rng.next() * (SNAP_DECISION_MS - 700)),
        timedOut: false,
      };
    }
    if (target === "tank") {
      return {
        decisionTimeMs: Math.round(
          TANK_DECISION_MS +
            rng.next() * (ACTION_CLOCK_MS - TANK_DECISION_MS - 500),
        ),
        timedOut: false,
      };
    }
    const streetExtra = (STREET_INDEX[ctx.street] ?? 0) * 350;
    return {
      decisionTimeMs: Math.round(
        2_300 + streetExtra + rng.next() * Math.max(600, 2_200 - streetExtra),
      ),
      timedOut: false,
    };
  }
}
