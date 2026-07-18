import { z } from "zod";
import { HandHistory, Street } from "./poker";
import { ChosenAction, DecisionContext, RecordedDecision } from "./decision";
import { SerializedPolicy } from "@/lib/player-model/policy";
import { PlayerTendencies } from "@/lib/player-model/stats";
import { SimulationAggregates } from "@/lib/analytics/aggregate";

export const SIMULATION_VERSION = "1.5.0";

export const rakeSchema = z.object({
  percentage: z.number().min(0).max(0.2),
  cap: z.number().min(0),
  noFlopNoDrop: z.boolean(),
});

export const tableConfigSchema = z.object({
  smallBlind: z.number().positive(),
  bigBlind: z.number().positive(),
  maxSeats: z.number().int().min(2).max(9),
  rake: rakeSchema,
});

export const poolSettingsSchema = z.object({
  /** preset id -> weight */
  composition: z.record(z.string(), z.number().min(0)),
  avgSessionHands: z.number().min(10).max(5000),
  turnover: z.number().min(0).max(2),
  stopLossBuyIns: z.number().min(0).max(10),
  stopWinBuyIns: z.number().min(0).max(20),
  rebuyProb: z.number().min(0).max(1),
  skillShift: z.number().min(0.3).max(1.5),
  looseness: z.number().min(0.5).max(1.8),
  aggressionShift: z.number().min(0.5).max(1.8),
});
export type PoolSettings = z.infer<typeof poolSettingsSchema>;

export const experimentConfigSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000),
  table: tableConfigSchema,
  pool: poolSettingsSchema,
  hands: z.number().int().min(10).max(500000),
  seed: z.string().min(1),
  userBuyInBB: z.number().min(20).max(500),
  mode: z.enum(["detailed", "high-speed"]),
  sampleEvery: z.number().int().min(1).max(10000),
});
export type ExperimentConfig = z.infer<typeof experimentConfigSchema>;

export interface CalibrationDataset {
  id: string;
  name: string;
  createdAt: string;
  /** Missing on legacy data, which is equivalent to a full manual session. */
  method?: "full-session" | "range-first";
  /** Exact 169-grid first-in range for range-first calibration. */
  preflopRange?: string[];
  seed: string;
  handsPlayed: number;
  decisions: RecordedDecision[];
  histories: HandHistory[];
  userSeatByHand: Record<number, number>;
  tendencies: PlayerTendencies;
  policy: SerializedPolicy;
  /** Aggregates of the manual play itself, for manual-vs-simulated comparison. */
  manualAggregates: SimulationAggregates | null;
}

export interface SimulatedUserDecision {
  handNumber: number;
  street: Street;
  probs: Record<string, number>;
  confidence: number;
  /** Legacy payloads only stored the action label. */
  chosen: string;
  /** Full review data is present on simulations created by v1.3+. */
  actionIndex?: number;
  context?: DecisionContext;
  toAmount?: number;
  potFraction?: number | null;
  decisionTimeMs?: number;
  timedOut?: boolean;
  opponentTiming?: "none" | "snap" | "normal" | "tank";
}

export interface StrategyReviewAnswer {
  handNumber: number;
  actionIndex: number;
  context: DecisionContext;
  modelAction: ChosenAction;
  reviewedAction: ChosenAction;
  agreed: boolean;
  modelConfidence: number;
  modelProbabilities: Record<string, number>;
}

/** One post-simulation tester review. Also stored as a normalized Supabase row. */
export interface StrategyReviewRound {
  id: string;
  experimentId: string;
  calibrationId: string | null;
  roundNumber: number;
  createdAt: string;
  simulationVersion: string;
  seed: string;
  answers: StrategyReviewAnswer[];
  agreedCount: number;
  correctedCount: number;
  accuracy: number;
  accepted: boolean;
  /** Set after a correction-driven simulation finishes successfully. */
  rerunCompletedAt?: string;
}

export interface ExperimentStrategyReview {
  rounds: StrategyReviewRound[];
  /** Base calibration plus every reviewed answer, weighted as direct feedback. */
  calibratedPolicy?: SerializedPolicy;
  /** A correction round waiting for a successful rerun. */
  pendingRerunRoundId?: string;
  /** Set when the latest reviewed sample contains no corrections. */
  acceptedAt?: string;
}

export interface Experiment {
  id: string;
  createdAt: string;
  config: ExperimentConfig;
  /** Point-in-time label for the strategy used to create this run. */
  strategyName?: string;
  /** Point-in-time calibration method, retained if the strategy is later deleted. */
  strategyMethod?: CalibrationDataset["method"];
  /** Null when the source calibration was deleted after results were saved. */
  calibrationId: string | null;
  simulationVersion: string;
  status: "pending" | "running" | "complete" | "cancelled";
  results: SimulationAggregates | null;
  /** Stored hand histories (all in detailed mode, sampled in high-speed). */
  handIds: string[];
  userDecisionLog: SimulatedUserDecision[];
  /** Optional for experiments saved before post-simulation review existed. */
  strategyReview?: ExperimentStrategyReview;
}
