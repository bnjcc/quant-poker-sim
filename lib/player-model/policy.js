import { estimateEquity, preflopStrength } from "@/lib/poker/equity";
import { handIsInRange, isStartingHandNotation } from "@/lib/poker/range";
import {
  ACTION_CLOCK_MS,
  clampDecisionTime,
  decisionTimingBucket,
  sampleDefaultDecisionTiming,
} from "@/lib/simulation/timing";
const ACTIONS = ["fold", "check", "call", "bet", "raise"];
function positionClass(pos) {
  if (pos === "SB" || pos === "BB") return "blind";
  if (pos === "BTN" || pos === "CO") return "late";
  return "early";
}
function facingClass(ctx) {
  if (ctx.street === "preflop") {
    return ctx.facedRaisePreflop ? "raised" : "unopened";
  }
  return ctx.betFaced > 0 ? "bet" : "unopened";
}
/** Strength bucket. Preflop uses the cheap heuristic; postflop uses MC equity. */
export function strengthBucket(ctx, rng) {
  const s =
    ctx.street === "preflop"
      ? preflopStrength(ctx.holeCards)
      : estimateEquity(
          ctx.holeCards,
          ctx.board,
          Math.max(1, ctx.activePlayers - 1),
          rng,
          80,
        );
  if (s < 0.3) return 0;
  if (s < 0.5) return 1;
  if (s < 0.7) return 2;
  return 3;
}
function keyOf(street, pos, facing, bucket) {
  return `${street}|${pos}|${facing}|${bucket}`;
}
function timedKeyOf(street, pos, facing, bucket, timing) {
  return `${keyOf(street, pos, facing, bucket)}|${timing}`;
}
function lookupKeys(ctx, sb) {
  const pc = positionClass(ctx.position);
  const fc = facingClass(ctx);
  const timing = decisionTimingBucket(ctx.lastOpponentAction?.decisionTimeMs);
  return [
    timedKeyOf(ctx.street, pc, fc, sb, timing),
    timedKeyOf(ctx.street, "*", fc, sb, timing),
    timedKeyOf(ctx.street, "*", fc, "*", timing),
    // Untimed keys retain a dense fallback and make v1 serialized policies compatible.
    keyOf(ctx.street, pc, fc, sb),
    keyOf(ctx.street, "*", fc, sb),
    keyOf(ctx.street, "*", fc, "*"),
  ];
}
export class BehavioralPolicy {
  buckets = new Map();
  preflopRange = null;
  preflopRangesByPosition = null;
  totalDecisions = 0;
  setPreflopRange(range) {
    const unique = [...new Set(range)];
    if (unique.length === 0) throw new Error("Preflop range cannot be empty");
    if (unique.some((hand) => !isStartingHandNotation(hand)))
      throw new Error("Preflop range contains invalid notation");
    this.preflopRange = new Set(unique);
    return this;
  }
  setPreflopRangesByPosition(ranges) {
    const entries = Object.entries(ranges ?? {});
    if (entries.length === 0)
      throw new Error("Choose at least one positional preflop range");
    const normalized = new Map();
    for (const [position, range] of entries) {
      const unique = [...new Set(range ?? [])];
      if (unique.some((hand) => !isStartingHandNotation(hand))) {
        throw new Error(
          `Preflop range for ${position} contains invalid notation`,
        );
      }
      normalized.set(position, new Set(unique));
    }
    if (![...normalized.values()].some((range) => range.size > 0)) {
      throw new Error("Positional preflop ranges cannot all be empty");
    }
    this.preflopRangesByPosition = normalized;
    return this;
  }
  bucket(key) {
    let b = this.buckets.get(key);
    if (!b) {
      b = {
        counts: { fold: 0, check: 0, call: 0, bet: 0, raise: 0 },
        total: 0,
        sizings: [],
        timings: {},
      };
      this.buckets.set(key, b);
    }
    return b;
  }
  /** Train from recorded calibration decisions. */
  train(decisions, rng) {
    for (const d of decisions) {
      const sb = strengthBucket(d.context, rng);
      const label = d.action.type;
      // Record timed buckets for reactions plus untimed buckets for dense fallback.
      const keys = lookupKeys(d.context, sb);
      for (const k of keys) {
        const b = this.bucket(k);
        b.counts[label]++;
        b.total++;
        if (d.potFraction !== null) b.sizings.push(d.potFraction);
        if (
          d.responseTimeMs !== undefined &&
          Number.isFinite(d.responseTimeMs)
        ) {
          b.timings ??= {};
          const samples = b.timings[label] ?? [];
          samples.push({
            decisionTimeMs: clampDecisionTime(d.responseTimeMs),
            timedOut: Boolean(d.timedOut),
          });
          b.timings[label] = samples;
        }
      }
      this.totalDecisions++;
    }
  }
  /**
   * Action probabilities for a context, restricted to legal actions.
   * Blends observed frequencies with a strength-aware prior; blend weight
   * grows with sample size (shrinkage), so small samples stay conservative.
   */
  probabilities(ctx, sb) {
    const rangeState = this.rangeState(ctx);
    if (rangeState === "excluded") {
      const chosen = ctx.legal.types.includes("check") ? "check" : "fold";
      return {
        probs: { fold: 0, check: 0, call: 0, bet: 0, raise: 0, [chosen]: 1 },
        confidence: 1,
        bucketKey: "preflop|explicit-range|excluded",
        samplesUsed: 0,
      };
    }
    const keys = lookupKeys(ctx, sb);
    let chosen = null;
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
    const raw = { fold: 0, check: 0, call: 0, bet: 0, raise: 0 };
    for (const a of ACTIONS) {
      const observed =
        chosen && chosen.total > 0 ? chosen.counts[a] / chosen.total : 0;
      raw[a] = w * observed + (1 - w) * prior[a];
    }
    // Restrict to legal actions and renormalize; illegal mass flows to nearest legal action.
    const legal = new Set(ctx.legal.types);
    const substitute = {
      fold: ["check", "fold"],
      check: ["call", "fold"],
      call: ["check", "fold"],
      bet: ["raise", "call", "check"],
      raise: ["bet", "call", "check"],
    };
    const probs = { fold: 0, check: 0, call: 0, bet: 0, raise: 0 };
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
    // A selected first-in hand is always played; calibration determines how it is played.
    if (rangeState === "selected" && probs.fold > 0) {
      probs.fold = 0;
      const playableTotal = ACTIONS.reduce(
        (sum, action) => sum + probs[action],
        0,
      );
      if (playableTotal > 0) {
        for (const action of ACTIONS) probs[action] /= playableTotal;
      } else {
        const fallback = ctx.legal.types.includes("check")
          ? "check"
          : ctx.legal.types.includes("call")
            ? "call"
            : "raise";
        probs[fallback] = 1;
      }
    }
    return { probs, confidence: w, bucketKey: chosenKey, samplesUsed: n };
  }
  rangeState(ctx) {
    const explicitRange =
      this.preflopRangesByPosition?.get(ctx.position) ?? this.preflopRange;
    if (
      !explicitRange ||
      ctx.street !== "preflop" ||
      ctx.facedRaisePreflop ||
      ctx.holeCards.length !== 2
    ) {
      return null;
    }
    return handIsInRange(ctx.holeCards, explicitRange)
      ? "selected"
      : "excluded";
  }
  /** Sample an action + size from the policy. */
  sample(ctx, rng) {
    const sb = strengthBucket(ctx, rng);
    const explain = this.probabilities(ctx, sb);
    const idx = rng.weighted(ACTIONS.map((a) => explain.probs[a]));
    const type = ACTIONS[idx];
    let action;
    if (type === "bet" || type === "raise") {
      const frac = this.sampleSizing(ctx, rng);
      const to =
        ctx.street === "preflop" &&
        ctx.betFaced <= ctx.bigBlind &&
        type === "raise"
          ? Math.round(ctx.bigBlind * Math.max(2, frac * 4))
          : type === "raise"
            ? Math.round(ctx.legal.minRaiseTo + frac * ctx.potSize)
            : Math.max(ctx.legal.minBet, Math.round(frac * ctx.potSize));
      action = {
        type,
        toAmount: Math.min(Math.max(to, 1), ctx.legal.maxBetTo),
      };
    } else {
      action = { type };
    }
    const timing = this.sampleDecisionTiming(
      ctx,
      action,
      explain.bucketKey,
      rng,
    );
    return { action, explain, ...timing };
  }
  sampleDecisionTiming(ctx, action, bucketKey, rng) {
    const label = action.type;
    const primary = this.buckets.get(bucketKey)?.timings?.[label] ?? [];
    const denseFallback =
      this.buckets.get(keyOf(ctx.street, "*", facingClass(ctx), "*"))
        ?.timings?.[label] ?? [];
    const samples = primary.length >= 3 ? primary : denseFallback;
    if (
      samples.length > 0 &&
      rng.chance(Math.min(0.92, samples.length / (samples.length + 3)))
    ) {
      const observed = samples[rng.int(samples.length)];
      if (observed.timedOut)
        return { decisionTimeMs: ACTION_CLOCK_MS, timedOut: true };
      return {
        decisionTimeMs: clampDecisionTime(
          observed.decisionTimeMs * Math.max(0.65, rng.gaussian(1, 0.12)),
        ),
        timedOut: false,
      };
    }
    return sampleDefaultDecisionTiming(action, ctx, rng);
  }
  /** Empirical bet-size sampling with a mild prior toward 2/3 pot. */
  sampleSizing(ctx, rng) {
    // Gather sizings from the street-level bucket.
    const pooled = [];
    for (const [k, b] of this.buckets) {
      if (k.startsWith(`${ctx.street}|*|`)) pooled.push(...b.sizings);
    }
    if (
      pooled.length >= 5 &&
      rng.chance(Math.min(0.85, pooled.length / (pooled.length + 5)))
    ) {
      return Math.max(
        0.2,
        pooled[rng.int(pooled.length)] * Math.max(0.6, rng.gaussian(1, 0.15)),
      );
    }
    return Math.max(0.25, rng.gaussian(0.66, 0.2));
  }
  serialize() {
    return {
      buckets: Object.fromEntries(this.buckets),
      totalDecisions: this.totalDecisions,
      preflopRange: this.preflopRange
        ? [...this.preflopRange].sort()
        : undefined,
      preflopRangesByPosition: this.preflopRangesByPosition
        ? Object.fromEntries(
            [...this.preflopRangesByPosition].map(([position, range]) => [
              position,
              [...range].sort(),
            ]),
          )
        : undefined,
      version: 3,
    };
  }
  static deserialize(data) {
    const p = new BehavioralPolicy();
    for (const [k, v] of Object.entries(data.buckets)) {
      p["buckets"].set(k, v);
    }
    p.totalDecisions = data.totalDecisions;
    if (data.preflopRange?.length) p.setPreflopRange(data.preflopRange);
    if (data.preflopRangesByPosition) {
      p.setPreflopRangesByPosition(data.preflopRangesByPosition);
    }
    return p;
  }
}
/** Prior policy shaped by hand strength and what the player is facing. */
function strengthPrior(ctx, sb) {
  const facing = facingClass(ctx);
  if (facing === "unopened") {
    // Nothing to call.
    const table = {
      0: { fold: 0.35, check: 0.5, call: 0.05, bet: 0.08, raise: 0.02 },
      1: { fold: 0.2, check: 0.45, call: 0.1, bet: 0.2, raise: 0.05 },
      2: { fold: 0.05, check: 0.3, call: 0.15, bet: 0.35, raise: 0.15 },
      3: { fold: 0.01, check: 0.15, call: 0.09, bet: 0.45, raise: 0.3 },
    };
    return table[sb];
  }
  const table = {
    0: { fold: 0.75, check: 0.02, call: 0.18, bet: 0.0, raise: 0.05 },
    1: { fold: 0.5, check: 0.02, call: 0.4, bet: 0.0, raise: 0.08 },
    2: { fold: 0.2, check: 0.02, call: 0.58, bet: 0.0, raise: 0.2 },
    3: { fold: 0.05, check: 0.01, call: 0.44, bet: 0.0, raise: 0.5 },
  };
  return table[sb];
}
