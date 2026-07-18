import { ChosenAction, DecisionContext } from "@/types/decision";
import { Rng } from "@/lib/poker/rng";

/** Online-style per-action clock used during manual calibration. */
export const ACTION_CLOCK_MS = 15_000;
/** Brief visible preview used for opponent turns during manual calibration. */
export const OPPONENT_LIVE_DELAY_MS = 500;
export const SNAP_DECISION_MS = 1_200;
export const TANK_DECISION_MS = 7_000;

export type DecisionTimingBucket = "none" | "snap" | "normal" | "tank";

export interface DecisionTiming {
  decisionTimeMs: number;
  timedOut: boolean;
}

export function clampDecisionTime(ms: number): number {
  if (!Number.isFinite(ms)) return ACTION_CLOCK_MS;
  return Math.round(Math.max(0, Math.min(ACTION_CLOCK_MS, ms)));
}

export function decisionTimingBucket(ms?: number | null): DecisionTimingBucket {
  if (ms === undefined || ms === null || !Number.isFinite(ms)) return "none";
  if (ms <= SNAP_DECISION_MS) return "snap";
  if (ms >= TANK_DECISION_MS) return "tank";
  return "normal";
}

export function timeoutAction(ctx: DecisionContext): ChosenAction {
  return ctx.legal.types.includes("check") ? { type: "check" } : { type: "fold" };
}

export function formatDecisionTime(ms?: number | null): string | null {
  if (ms === undefined || ms === null || !Number.isFinite(ms)) return null;
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  return `${(ms / 1_000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

/**
 * Default human-like timing for policy buckets with little or no timing data.
 * Check/fold actions often snap; raises and difficult later-street spots take longer.
 */
export function sampleDefaultDecisionTiming(
  action: ChosenAction,
  ctx: DecisionContext,
  rng: Rng,
): DecisionTiming {
  const snapChance = action.type === "check" || action.type === "fold" ? 0.38 : action.type === "call" ? 0.12 : 0.07;
  if (rng.chance(snapChance)) {
    return { decisionTimeMs: Math.round(220 + rng.next() * 780), timedOut: false };
  }

  const actionBase =
    action.type === "check" || action.type === "fold"
      ? 1_250
      : action.type === "call"
        ? 1_850
        : 2_450;
  const streetComplexity = ctx.street === "preflop" ? 0 : ctx.street === "flop" ? 250 : ctx.street === "turn" ? 600 : 900;
  const pressure = Math.min(1_800, ctx.numRaisesThisStreet * 350 + (ctx.betFaced > 0 ? 300 : 0));

  if (rng.chance(0.045)) {
    return {
      decisionTimeMs: Math.round(TANK_DECISION_MS + rng.next() * (ACTION_CLOCK_MS - TANK_DECISION_MS - 250)),
      timedOut: false,
    };
  }

  return {
    decisionTimeMs: clampDecisionTime(rng.gaussian(actionBase + streetComplexity + pressure, 650)),
    timedOut: false,
  };
}
