import { ChosenAction, DecisionContext, RecordedDecision } from "@/types/decision";
import { estimateEquity, preflopStrength } from "@/lib/poker/equity";
import { Rng } from "@/lib/poker/rng";

/**
 * Behavioral policy learned from the user's calibration hands.
 *
 * States are bucketed by (street, position class, facing-action, hand-strength
 * bucket). Each bucket stores Laplace-smoothed action counts. At decision time
 * we look up the most specific bucket with data and fall back through a
 * generalization hierarchy, blending with a sensible prior when samples are
 * thin. This avoids both hard labels and overfitting tiny samples.
 */

export type ActionLabel = "fold" | "check" | "call" | "bet" | "raise";
const ACTIONS: ActionLabel[] = ["fold", "check", "call", "bet", "raise"];

type PositionClass = "early" | "late" | "blind";
type Facing = "unopened" | "bet" | "raised";
type StrengthBucket = 0 | 1 | 2 | 3; // weak..strong

interface BucketCounts {
  counts: Record<ActionLabel, number>;
  total: number;
  sizings: number[]; // pot fractions for bets/raises
}

export interface PolicyProbabilities {
  probs: Record<ActionLabel, number>;
  /** How much observed data (vs prior) drove this output, 0..1. */
  confidence: number;
  bucketKey: string;
  samplesUsed: number;
}

export interface SerializedPolicy {
  buckets: Record<string, BucketCounts>;
  totalDecisions: number;
  version: 1;
}

function positionClass(pos: string): PositionClass {
  if (pos === "SB" || pos === "BB") return "blind";
  if (pos === "BTN" || pos === "CO") return "late";
  return "early";
}

function facingClass(ctx: DecisionContext): Facing {
  if (ctx.street === "preflop") {
    return ctx.facedRaisePreflop ? "raised" : "unopened";
  }
  return ctx.betFaced > 0 ? "bet" : "unopened";
}

/** Strength bucket. Preflop uses the cheap heuristic; postflop uses MC equity. */
export function strengthBucket(ctx: DecisionContext, rng: Rng): StrengthBucket {
  const s =
    ctx.street === "preflop"
      ? preflopStrength(ctx.holeCards)
      : estimateEquity(ctx.holeCards, ctx.board, Math.max(1, ctx.activePlayers - 1), rng, 80);
  if (s < 0.3) return 0;
  if (s < 0.5) return 1;
  if (s < 0.7) return 2;
  return 3;
}

function keyOf(street: string, pos: PositionClass | "*", facing: Facing, bucket: StrengthBucket | "*"): string {
  return `${street}|${pos}|${facing}|${bucket}`;
}

export class BehavioralPolicy {
  private buckets = new Map<string, BucketCounts>();
  totalDecisions = 0;

  private bucket(key: string): BucketCounts {
    let b = this.buckets.get(key);
    if (!b) {
      b = { counts: { fold: 0, check: 0, call: 0, bet: 0, raise: 0 }, total: 0, sizings: [] };
      this.buckets.set(key, b);
    }
    return b;
  }

  /** Train from recorded calibration decisions. */
  train(decisions: RecordedDecision[], rng: Rng): void {
    for (const d of decisions) {
      const sb = strengthBucket(d.context, rng);
      const pc = positionClass(d.context.position);
      const fc = facingClass(d.context);
      const label = d.action.type as ActionLabel;
      // Record into the specific bucket plus generalized fallbacks.
      const keys = [
        keyOf(d.context.street, pc, fc, sb),
        keyOf(d.context.street, "*", fc, sb),
        keyOf(d.context.street, "*", fc, "*"),
      ];
      for (const k of keys) {
        const b = this.bucket(k);
        b.counts[label]++;
        b.total++;
        if (d.potFraction !== null) b.sizings.push(d.potFraction);
      }
      this.totalDecisions++;
    }
  }

  /**
   * Action probabilities for a context, restricted to legal actions.
   * Blends observed frequencies with a strength-aware prior; blend weight
   * grows with sample size (shrinkage), so small samples stay conservative.
   */
  probabilities(ctx: DecisionContext, sb: StrengthBucket): PolicyProbabilities {
    const pc = positionClass(ctx.position);
    const fc = facingClass(ctx);
    const keys = [
      keyOf(ctx.street, pc, fc, sb),
      keyOf(ctx.street, "*", fc, sb),
      keyOf(ctx.street, "*", fc, "*"),
    ];
    let chosen: BucketCounts | null = null;
    let chosenKey = keys[keys.length - 1];
    for (const k of keys) {
      const b = this.buckets.get(k);
      if (b && b.total >= 3) {
        chosen = b;
        chosenKey = k;
        break;
      }
      if (b && !chosen) {
        chosen = b;
        chosenKey = k;
      }
    }

    const prior = strengthPrior(ctx, sb);
    const n = chosen?.total ?? 0;
    const K = 8; // shrinkage constant: at n=8 data and prior weigh equally
    const w = n / (n + K);

    const raw: Record<ActionLabel, number> = { fold: 0, check: 0, call: 0, bet: 0, raise: 0 };
    for (const a of ACTIONS) {
      const observed = chosen && chosen.total > 0 ? chosen.counts[a] / chosen.total : 0;
      raw[a] = w * observed + (1 - w) * prior[a];
    }

    // Restrict to legal actions and renormalize; illegal mass flows to nearest legal action.
    const legal = new Set(ctx.legal.types as ActionLabel[]);
    const substitute: Record<ActionLabel, ActionLabel[]> = {
      fold: ["check", "fold"],
      check: ["call", "fold"],
      call: ["check", "fold"],
      bet: ["raise", "call", "check"],
      raise: ["bet", "call", "check"],
    };
    const probs: Record<ActionLabel, number> = { fold: 0, check: 0, call: 0, bet: 0, raise: 0 };
    for (const a of ACTIONS) {
      if (raw[a] <= 0) continue;
      if (legal.has(a)) {
        probs[a] += raw[a];
      } else {
        const sub = substitute[a].find((s) => legal.has(s));
        if (sub) probs[sub] += raw[a];
      }
    }
    const total = ACTIONS.reduce((s, a) => s + probs[a], 0);
    if (total <= 0) {
      const fallback = legal.has("check") ? "check" : "fold";
      probs[fallback] = 1;
    } else {
      for (const a of ACTIONS) probs[a] /= total;
    }

    return { probs, confidence: w, bucketKey: chosenKey, samplesUsed: n };
  }

  /** Sample an action + size from the policy. */
  sample(ctx: DecisionContext, rng: Rng): { action: ChosenAction; explain: PolicyProbabilities } {
    const sb = strengthBucket(ctx, rng);
    const explain = this.probabilities(ctx, sb);
    const idx = rng.weighted(ACTIONS.map((a) => explain.probs[a]));
    const type = ACTIONS[idx];
    if (type === "bet" || type === "raise") {
      const frac = this.sampleSizing(ctx, rng);
      const to =
        ctx.street === "preflop" && ctx.betFaced <= ctx.bigBlind && type === "raise"
          ? Math.round(ctx.bigBlind * Math.max(2, frac * 4))
          : type === "raise"
            ? Math.round(ctx.legal.minRaiseTo + frac * ctx.potSize)
            : Math.max(ctx.legal.minBet, Math.round(frac * ctx.potSize));
      return {
        action: { type, toAmount: Math.min(Math.max(to, 1), ctx.legal.maxBetTo) },
        explain,
      };
    }
    return { action: { type }, explain };
  }

  /** Empirical bet-size sampling with a mild prior toward 2/3 pot. */
  private sampleSizing(ctx: DecisionContext, rng: Rng): number {
    // Gather sizings from the street-level bucket.
    const pooled: number[] = [];
    for (const [k, b] of this.buckets) {
      if (k.startsWith(`${ctx.street}|*|`)) pooled.push(...b.sizings);
    }
    if (pooled.length >= 5 && rng.chance(Math.min(0.85, pooled.length / (pooled.length + 5)))) {
      return Math.max(0.2, pooled[rng.int(pooled.length)] * Math.max(0.6, rng.gaussian(1, 0.15)));
    }
    return Math.max(0.25, rng.gaussian(0.66, 0.2));
  }

  serialize(): SerializedPolicy {
    return {
      buckets: Object.fromEntries(this.buckets),
      totalDecisions: this.totalDecisions,
      version: 1,
    };
  }

  static deserialize(data: SerializedPolicy): BehavioralPolicy {
    const p = new BehavioralPolicy();
    for (const [k, v] of Object.entries(data.buckets)) {
      p["buckets"].set(k, v);
    }
    p.totalDecisions = data.totalDecisions;
    return p;
  }
}

/** Prior policy shaped by hand strength and what the player is facing. */
function strengthPrior(ctx: DecisionContext, sb: StrengthBucket): Record<ActionLabel, number> {
  const facing = facingClass(ctx);
  if (facing === "unopened") {
    // Nothing to call.
    const table: Record<StrengthBucket, Record<ActionLabel, number>> = {
      0: { fold: 0.35, check: 0.5, call: 0.05, bet: 0.08, raise: 0.02 },
      1: { fold: 0.2, check: 0.45, call: 0.1, bet: 0.2, raise: 0.05 },
      2: { fold: 0.05, check: 0.3, call: 0.15, bet: 0.35, raise: 0.15 },
      3: { fold: 0.01, check: 0.15, call: 0.09, bet: 0.45, raise: 0.3 },
    };
    return table[sb];
  }
  const table: Record<StrengthBucket, Record<ActionLabel, number>> = {
    0: { fold: 0.75, check: 0.02, call: 0.18, bet: 0.0, raise: 0.05 },
    1: { fold: 0.5, check: 0.02, call: 0.4, bet: 0.0, raise: 0.08 },
    2: { fold: 0.2, check: 0.02, call: 0.58, bet: 0.0, raise: 0.2 },
    3: { fold: 0.05, check: 0.01, call: 0.44, bet: 0.0, raise: 0.5 },
  };
  return table[sb];
}
