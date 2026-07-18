import { ChosenAction, RecordedDecision } from "@/types/decision";
import {
  SimulatedUserDecision,
  StrategyReviewAnswer,
  StrategyReviewRound,
} from "@/types/experiment";
import { HandHistory } from "@/types/poker";
import { holeNotation } from "@/lib/poker/deck";
import { handIsInRange } from "@/lib/poker/range";
import { Rng } from "@/lib/poker/rng";
import { BehavioralPolicy, SerializedPolicy } from "./policy";

export const DEFAULT_REVIEW_HAND_COUNT = 8;
/** @deprecated Use DEFAULT_REVIEW_HAND_COUNT. Retained for external callers. */
export const REVIEW_HAND_COUNT = DEFAULT_REVIEW_HAND_COUNT;
export const REVIEW_FEEDBACK_WEIGHT = 6;

export interface ReviewableDecision extends SimulatedUserDecision {
  actionIndex: number;
  context: NonNullable<SimulatedUserDecision["context"]>;
}

/**
 * Keep a bounded, evenly distributed decision log that can actually be joined
 * to the hands stored for browser review. This avoids keeping only the start of
 * a long experiment while still representing the full run.
 */
export function sampleStoredUserDecisions(
  hands: HandHistory[],
  decisions: SimulatedUserDecision[],
  limit = 5_000,
): SimulatedUserDecision[] {
  if (limit <= 0 || hands.length === 0) return [];
  const storedHandNumbers = new Set(hands.map((hand) => hand.handNumber));
  const eligible = decisions.filter((decision) => storedHandNumbers.has(decision.handNumber));
  if (eligible.length <= limit) return eligible;
  if (limit === 1) return [eligible[0]];

  return Array.from({ length: limit }, (_, index) =>
    eligible[Math.round((index * (eligible.length - 1)) / (limit - 1))],
  );
}

export function simulatedAction(decision: SimulatedUserDecision): ChosenAction {
  return {
    type: decision.chosen as ChosenAction["type"],
    ...(decision.toAmount === undefined ? {} : { toAmount: decision.toAmount }),
  };
}

/**
 * Select one decision from each of several hands spread across the stored run.
 * Within a hand, prefer the least-confident decision because it is the most
 * useful calibration question.
 */
export function selectReviewDecisions(
  hands: HandHistory[],
  decisions: SimulatedUserDecision[],
  limit = DEFAULT_REVIEW_HAND_COUNT,
  preflopRange?: readonly string[],
): ReviewableDecision[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];

  const storedHands = new Set(hands.map((hand) => hand.handNumber));
  const explicitRange = preflopRange ? new Set(preflopRange) : null;
  const bestByHand = new Map<number, ReviewableDecision>();
  for (const decision of decisions) {
    if (
      !storedHands.has(decision.handNumber) ||
      decision.actionIndex === undefined ||
      !decision.context ||
      // An explicit first-in chart defines which dealt starting hands are
      // useful to review. Apply it to the whole hand, not only its first
      // preflop decision, so an out-of-range BB check cannot leak a later-
      // street decision into the review sample.
      (explicitRange !== null && !handIsInRange(decision.context.holeCards, explicitRange))
    ) {
      continue;
    }
    const reviewable = decision as ReviewableDecision;
    const current = bestByHand.get(decision.handNumber);
    if (!current || decision.confidence < current.confidence) {
      bestByHand.set(decision.handNumber, reviewable);
    }
  }

  const candidates = [...bestByHand.values()].sort((a, b) => a.handNumber - b.handNumber);
  const boundedLimit = Math.min(candidates.length, Math.floor(limit));
  if (boundedLimit === 0) return [];
  if (candidates.length <= boundedLimit) return candidates;
  if (boundedLimit === 1) return [candidates[0]];

  const selected: ReviewableDecision[] = [];
  const used = new Set<number>();
  for (let index = 0; index < boundedLimit; index++) {
    const candidateIndex = Math.round((index * (candidates.length - 1)) / (boundedLimit - 1));
    const candidate = candidates[candidateIndex];
    if (!used.has(candidate.handNumber)) {
      selected.push(candidate);
      used.add(candidate.handNumber);
    }
  }
  return selected;
}

export function answerPotFraction(answer: StrategyReviewAnswer): number | null {
  const action = answer.reviewedAction;
  const context = answer.context;
  if (
    (action.type !== "bet" && action.type !== "raise") ||
    action.toAmount === undefined ||
    context.potSize <= 0
  ) {
    return null;
  }
  return (
    action.toAmount - (action.type === "raise" ? context.legal.callAmount : 0)
  ) / context.potSize;
}

export function reviewAnswersToDecisions(answers: StrategyReviewAnswer[]): RecordedDecision[] {
  return answers.map((answer) => ({
    context: answer.context,
    action: answer.reviewedAction,
    potFraction: answerPotFraction(answer),
  }));
}

/** Rebuild an experiment policy from its immutable base calibration and all feedback. */
export function buildCalibratedPolicy(
  base: SerializedPolicy,
  rounds: StrategyReviewRound[],
): SerializedPolicy {
  const copied: SerializedPolicy = {
    ...base,
    buckets: Object.fromEntries(
      Object.entries(base.buckets).map(([key, bucket]) => [
        key,
        {
          ...bucket,
          counts: { ...bucket.counts },
          sizings: [...bucket.sizings],
          timings: bucket.timings
            ? Object.fromEntries(
                Object.entries(bucket.timings).map(([action, samples]) => [
                  action,
                  samples?.map((sample) => ({ ...sample })),
                ]),
              )
            : undefined,
        },
      ]),
    ),
    preflopRange: base.preflopRange ? [...base.preflopRange] : undefined,
  };

  // Direct first-in feedback should also refine an explicit range chart.
  if (copied.preflopRange) {
    const range = new Set(copied.preflopRange);
    for (const answer of rounds.flatMap((round) => round.answers)) {
      const context = answer.context;
      if (
        context.street !== "preflop" ||
        context.facedRaisePreflop ||
        context.holeCards.length !== 2
      ) {
        continue;
      }
      const notation = holeNotation(context.holeCards);
      if (answer.reviewedAction.type === "fold") range.delete(notation);
      else range.add(notation);
    }
    // Range calibrations cannot currently serialize an empty chart.
    if (range.size > 0) copied.preflopRange = [...range].sort();
  }

  const policy = BehavioralPolicy.deserialize(copied);
  const feedback = reviewAnswersToDecisions(rounds.flatMap((round) => round.answers));
  for (let weight = 0; weight < REVIEW_FEEDBACK_WEIGHT; weight++) {
    policy.train(feedback, new Rng(`strategy-review-${weight}`));
  }
  return policy.serialize();
}

export function reviewAccuracy(answers: StrategyReviewAnswer[]): {
  agreedCount: number;
  correctedCount: number;
  accuracy: number;
} {
  const agreedCount = answers.filter((answer) => answer.agreed).length;
  const correctedCount = answers.length - agreedCount;
  return {
    agreedCount,
    correctedCount,
    accuracy: answers.length > 0 ? agreedCount / answers.length : 0,
  };
}
