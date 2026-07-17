import { z } from "zod";
import { HandHistory } from "./poker";
import { RecordedDecision } from "./decision";
import { SerializedPolicy } from "@/lib/player-model/policy";
import { PlayerTendencies } from "@/lib/player-model/stats";
import { SimulationAggregates } from "@/lib/analytics/aggregate";

export const SIMULATION_VERSION = "1.0.0";

export const rakeSchema = z.object({
  percentage: z.number().min(0).max(0.2),
  cap: z.number().min(0),
  noFlopNoDrop: z.boolean(),
});

export const tableConfigSchema = z.object({
  smallBlind: z.number().positive(),
  bigBlind: z.number().positive(),
  maxSeats: z.number().int().min(2).max(6),
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

export interface Experiment {
  id: string;
  createdAt: string;
  config: ExperimentConfig;
  /** Null when the source calibration was deleted after results were saved. */
  calibrationId: string | null;
  simulationVersion: string;
  status: "pending" | "running" | "complete" | "cancelled";
  results: SimulationAggregates | null;
  /** Stored hand histories (all in detailed mode, sampled in high-speed). */
  handIds: string[];
  userDecisionLog: { handNumber: number; street: string; probs: Record<string, number>; confidence: number; chosen: string }[];
}
