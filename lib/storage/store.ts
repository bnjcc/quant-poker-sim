import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Database, Json } from "@/types/database";
import type { HandHistory } from "@/types/poker";
import type {
  CalibrationDataset,
  Experiment,
  StrategyReviewRound,
} from "@/types/experiment";

export interface StorageSummary {
  mode: "local" | "supabase";
  calibrations: number;
  experiments: number;
  hands: number;
  reviews: number;
  usageLabel: string;
  description: string;
}

export interface DataStore {
  readonly mode: "local" | "supabase";

  listCalibrations(): Promise<CalibrationDataset[]>;
  getCalibration(id: string): Promise<CalibrationDataset | null>;
  saveCalibration(c: CalibrationDataset): Promise<void>;
  deleteCalibration(id: string): Promise<void>;

  listExperiments(): Promise<Experiment[]>;
  getExperiment(id: string): Promise<Experiment | null>;
  saveExperiment(e: Experiment): Promise<void>;
  deleteExperiment(id: string): Promise<void>;

  saveHands(experimentId: string, hands: HandHistory[]): Promise<string[]>;
  getHands(experimentId: string): Promise<HandHistory[]>;
  saveExperimentRun(experiment: Experiment, hands: HandHistory[]): Promise<Experiment>;

  listStrategyReviews(): Promise<StrategyReviewRound[]>;
  saveStrategyReview(review: StrategyReviewRound): Promise<void>;
  saveExperimentReview(experiment: Experiment, review: StrategyReviewRound): Promise<void>;

  getStorageSummary(): Promise<StorageSummary>;
  deleteAll(): Promise<void>;
}

const CAL_KEY = "psim:calibrations";
const EXP_KEY = "psim:experiments";
const REVIEW_KEY = "psim:strategy-reviews";
const HANDS_PREFIX = "psim:hands:";
const MIGRATION_PREFIX = "psim:migrated:";
const NON_FINITE_KEY = "__rangebench_non_finite_number__";
const LOCAL_HAND_LIMIT = 3000;
const CLOUD_HAND_BATCH = 250;
const CLOUD_HAND_PAGE = 500;

export function encodeStorageJson(value: unknown): Json {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    return { [NON_FINITE_KEY]: String(value) };
  }
  if (Array.isArray(value)) return value.map((item) => encodeStorageJson(item));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) =>
        item === undefined ? [] : [[key, encodeStorageJson(item)]],
      ),
    );
  }
  return null;
}

export function decodeStorageJson<T>(value: Json): T {
  const decode = (item: Json): unknown => {
    if (Array.isArray(item)) return item.map(decode);
    if (item !== null && typeof item === "object") {
      const entries = Object.entries(item);
      if (entries.length === 1 && entries[0][0] === NON_FINITE_KEY) {
        const encoded = entries[0][1];
        if (encoded === "Infinity") return Infinity;
        if (encoded === "-Infinity") return -Infinity;
        if (encoded === "NaN") return NaN;
      }
      return Object.fromEntries(entries.map(([key, child]) => [key, decode(child as Json)]));
    }
    return item;
  };
  return decode(value) as T;
}

export class LocalStorageStore implements DataStore {
  readonly mode = "local" as const;

  private read<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? decodeStorageJson<T>(JSON.parse(raw) as Json) : fallback;
    } catch {
      return fallback;
    }
  }

  private write(key: string, value: unknown): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(encodeStorageJson(value)));
    } catch (error) {
      this.evictOldestHands();
      try {
        window.localStorage.setItem(key, JSON.stringify(encodeStorageJson(value)));
      } catch {
        console.error("Browser storage is full", error);
        throw new Error("Browser storage is full. Delete old experiments or use high-speed mode.");
      }
    }
  }

  private evictOldestHands(): void {
    if (typeof window === "undefined") return;
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(HANDS_PREFIX)) keys.push(key);
    }
    if (keys.length > 0) window.localStorage.removeItem(keys[0]);
  }

  async listCalibrations(): Promise<CalibrationDataset[]> {
    return this.read<CalibrationDataset[]>(CAL_KEY, []);
  }

  async getCalibration(id: string): Promise<CalibrationDataset | null> {
    return (await this.listCalibrations()).find((calibration) => calibration.id === id) ?? null;
  }

  async saveCalibration(calibration: CalibrationDataset): Promise<void> {
    const all = (await this.listCalibrations()).filter((item) => item.id !== calibration.id);
    all.unshift(calibration);
    this.write(CAL_KEY, all);
  }

  async deleteCalibration(id: string): Promise<void> {
    this.write(CAL_KEY, (await this.listCalibrations()).filter((item) => item.id !== id));
  }

  async listExperiments(): Promise<Experiment[]> {
    return this.read<Experiment[]>(EXP_KEY, []);
  }

  async getExperiment(id: string): Promise<Experiment | null> {
    return (await this.listExperiments()).find((experiment) => experiment.id === id) ?? null;
  }

  async saveExperiment(experiment: Experiment): Promise<void> {
    const all = (await this.listExperiments()).filter((item) => item.id !== experiment.id);
    all.unshift(experiment);
    this.write(EXP_KEY, all);
  }

  async deleteExperiment(id: string): Promise<void> {
    this.write(EXP_KEY, (await this.listExperiments()).filter((item) => item.id !== id));
    this.write(REVIEW_KEY, (await this.listStrategyReviews()).filter((item) => item.experimentId !== id));
    if (typeof window !== "undefined") window.localStorage.removeItem(HANDS_PREFIX + id);
  }

  async saveHands(experimentId: string, hands: HandHistory[]): Promise<string[]> {
    const capped = hands.slice(0, LOCAL_HAND_LIMIT);
    this.write(HANDS_PREFIX + experimentId, capped);
    return capped.map((hand) => handId(experimentId, hand.handNumber));
  }

  async getHands(experimentId: string): Promise<HandHistory[]> {
    return this.read<HandHistory[]>(HANDS_PREFIX + experimentId, []);
  }

  async saveExperimentRun(experiment: Experiment, hands: HandHistory[]): Promise<Experiment> {
    const handIds = await this.saveHands(experiment.id, hands);
    const completed = { ...experiment, handIds };
    await this.saveExperiment(completed);
    return completed;
  }

  async listStrategyReviews(): Promise<StrategyReviewRound[]> {
    return this.read<StrategyReviewRound[]>(REVIEW_KEY, []);
  }

  async saveStrategyReview(review: StrategyReviewRound): Promise<void> {
    const all = (await this.listStrategyReviews()).filter((item) => item.id !== review.id);
    all.unshift(review);
    this.write(REVIEW_KEY, all);
  }

  async saveExperimentReview(experiment: Experiment, review: StrategyReviewRound): Promise<void> {
    await this.saveStrategyReview(review);
    await this.saveExperiment(experiment);
  }

  async getStorageSummary(): Promise<StorageSummary> {
    const calibrations = await this.listCalibrations();
    const experiments = await this.listExperiments();
    const reviews = await this.listStrategyReviews();
    let bytes = 0;
    let hands = 0;
    if (typeof window !== "undefined") {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key?.startsWith("psim:")) continue;
        bytes += (window.localStorage.getItem(key) ?? "").length * 2;
        if (key.startsWith(HANDS_PREFIX)) hands += this.read<HandHistory[]>(key, []).length;
      }
    }
    return {
      mode: "local",
      calibrations: calibrations.length,
      experiments: experiments.length,
      hands,
      reviews: reviews.length,
      usageLabel: `${(bytes / 1024 / 1024).toFixed(2)} MB in this browser`,
      description: "Supabase is not configured, so data stays in this browser only.",
    };
  }

  async deleteAll(): Promise<void> {
    if (typeof window === "undefined") return;
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith("psim:") && !key.startsWith(MIGRATION_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  }
}

type CalibrationRow = Database["public"]["Tables"]["calibrations"]["Row"];
type ExperimentRow = Database["public"]["Tables"]["experiments"]["Row"];
type StrategyReviewRow = Database["public"]["Tables"]["strategy_reviews"]["Row"];

export function calibrationFromRow(
  row: Pick<CalibrationRow, "id" | "name" | "created_at" | "hands_played" | "payload">,
): CalibrationDataset {
  return {
    ...decodeStorageJson<CalibrationDataset>(row.payload),
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    handsPlayed: row.hands_played,
  };
}

export function experimentFromRow(
  row: Pick<ExperimentRow, "id" | "calibration_id" | "created_at" | "status" | "payload">,
): Experiment {
  return {
    ...decodeStorageJson<Experiment>(row.payload),
    id: row.id,
    calibrationId: row.calibration_id,
    createdAt: row.created_at,
    status: row.status,
  };
}

export function strategyReviewFromRow(
  row: Pick<StrategyReviewRow, "id" | "experiment_id" | "calibration_id" | "round_number" | "created_at" | "simulation_version" | "reviewed_decisions" | "agreed_decisions" | "corrected_decisions" | "accuracy" | "accepted" | "payload">,
): StrategyReviewRound {
  return {
    ...decodeStorageJson<StrategyReviewRound>(row.payload),
    id: row.id,
    experimentId: row.experiment_id,
    calibrationId: row.calibration_id,
    roundNumber: row.round_number,
    createdAt: row.created_at,
    simulationVersion: row.simulation_version,
    agreedCount: row.agreed_decisions,
    correctedCount: row.corrected_decisions,
    accuracy: row.accuracy,
    accepted: row.accepted,
  };
}

function handId(experimentId: string, handNumber: number): string {
  return `${experimentId}:${handNumber}`;
}

function randomUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function throwIfError(operation: string, error: { message: string } | null): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

export class SupabaseStore implements DataStore {
  readonly mode = "supabase" as const;

  constructor(private readonly client: SupabaseClient<Database>) {}

  private async userId(): Promise<string> {
    const { data, error } = await this.client.auth.getUser();
    throwIfError("Authenticate data request", error);
    if (!data.user) throw new Error("You must be signed in to access cloud data.");
    return data.user.id;
  }

  async listCalibrations(): Promise<CalibrationDataset[]> {
    const { data, error } = await this.client
      .from("calibrations")
      .select("id,name,created_at,hands_played,payload")
      .order("created_at", { ascending: false });
    throwIfError("Load calibrations", error);
    return (data ?? []).map(calibrationFromRow);
  }

  async getCalibration(id: string): Promise<CalibrationDataset | null> {
    const { data, error } = await this.client
      .from("calibrations")
      .select("id,name,created_at,hands_played,payload")
      .eq("id", id)
      .maybeSingle();
    throwIfError("Load calibration", error);
    return data ? calibrationFromRow(data) : null;
  }

  async saveCalibration(calibration: CalibrationDataset): Promise<void> {
    const userId = await this.userId();
    const { error } = await this.client.from("calibrations").upsert(
      {
        id: calibration.id,
        user_id: userId,
        name: calibration.name,
        created_at: calibration.createdAt,
        updated_at: new Date().toISOString(),
        hands_played: calibration.handsPlayed,
        payload: encodeStorageJson(calibration),
      },
      { onConflict: "id" },
    );
    throwIfError("Save calibration", error);
  }

  async createCalibrationIfMissing(calibration: CalibrationDataset): Promise<boolean> {
    const userId = await this.userId();
    const { error } = await this.client.from("calibrations").insert({
      id: calibration.id,
      user_id: userId,
      name: calibration.name,
      created_at: calibration.createdAt,
      hands_played: calibration.handsPlayed,
      payload: encodeStorageJson(calibration),
    });
    if (error?.code === "23505") return false;
    throwIfError("Import calibration", error);
    return true;
  }

  async deleteCalibration(id: string): Promise<void> {
    const { error } = await this.client.from("calibrations").delete().eq("id", id);
    throwIfError("Delete calibration", error);
  }

  async listExperiments(): Promise<Experiment[]> {
    const { data, error } = await this.client
      .from("experiments")
      .select("id,calibration_id,created_at,status,payload")
      .order("created_at", { ascending: false });
    throwIfError("Load experiments", error);
    return (data ?? []).map(experimentFromRow);
  }

  async getExperiment(id: string): Promise<Experiment | null> {
    const { data, error } = await this.client
      .from("experiments")
      .select("id,calibration_id,created_at,status,payload")
      .eq("id", id)
      .maybeSingle();
    throwIfError("Load experiment", error);
    return data ? experimentFromRow(data) : null;
  }

  async saveExperiment(experiment: Experiment): Promise<void> {
    const userId = await this.userId();
    const { error } = await this.client.from("experiments").upsert(
      {
        id: experiment.id,
        user_id: userId,
        calibration_id: experiment.calibrationId,
        created_at: experiment.createdAt,
        updated_at: new Date().toISOString(),
        status: experiment.status,
        payload: encodeStorageJson(experiment),
      },
      { onConflict: "id" },
    );
    throwIfError("Save experiment", error);
  }

  async createExperimentIfMissing(experiment: Experiment): Promise<boolean> {
    const userId = await this.userId();
    const { error } = await this.client.from("experiments").insert({
      id: experiment.id,
      user_id: userId,
      calibration_id: experiment.calibrationId,
      created_at: experiment.createdAt,
      status: experiment.status,
      payload: encodeStorageJson(experiment),
    });
    if (error?.code === "23505") return false;
    throwIfError("Import experiment", error);
    return true;
  }

  async deleteExperiment(id: string): Promise<void> {
    const { error } = await this.client.from("experiments").delete().eq("id", id);
    throwIfError("Delete experiment", error);
  }

  async saveHands(experimentId: string, hands: HandHistory[]): Promise<string[]> {
    const experiment = await this.getExperiment(experimentId);
    if (!experiment) throw new Error("Cannot save hands for an experiment that does not exist.");
    return (await this.saveExperimentRun(experiment, hands)).handIds;
  }

  private async stageHands(
    experimentId: string,
    hands: HandHistory[],
  ): Promise<{ handSetId: string; handIds: string[] }> {
    const userId = await this.userId();
    const handSetId = randomUuid();

    try {
      for (let offset = 0; offset < hands.length; offset += CLOUD_HAND_BATCH) {
        const batch = hands.slice(offset, offset + CLOUD_HAND_BATCH).map((hand) => ({
          experiment_id: experimentId,
          user_id: userId,
          hand_set_id: handSetId,
          hand_number: hand.handNumber,
          history: encodeStorageJson(hand),
        }));
        const { error } = await this.client
          .from("experiment_hands")
          .upsert(batch, { onConflict: "experiment_id,hand_set_id,hand_number" });
        throwIfError(`Save experiment hands ${offset + 1}-${offset + batch.length}`, error);
      }
    } catch (error) {
      await this.client
        .from("experiment_hands")
        .delete()
        .eq("experiment_id", experimentId)
        .eq("hand_set_id", handSetId);
      throw error;
    }

    return {
      handSetId,
      handIds: hands.map((hand) => handId(experimentId, hand.handNumber)),
    };
  }

  async saveExperimentRun(experiment: Experiment, hands: HandHistory[]): Promise<Experiment> {
    const staged = await this.stageHands(experiment.id, hands);
    const completed = { ...experiment, handIds: staged.handIds };
    const { error } = await this.client.rpc("finalize_experiment_run", {
      p_experiment_id: experiment.id,
      p_hand_set_id: staged.handSetId,
      p_status: completed.status,
      p_payload: encodeStorageJson(completed),
    });

    if (error) {
      const { data: verification, error: verificationError } = await this.client
        .from("experiments")
        .select("hand_set_id")
        .eq("id", experiment.id)
        .maybeSingle();
      if (!verificationError && verification?.hand_set_id === staged.handSetId) {
        return completed;
      }
      // A timed-out request may still commit after this verification. Keep the
      // staged revision so a delayed finalizer can never activate an empty set.
      throwIfError("Finalize experiment run", error);
    }
    return completed;
  }

  async listStrategyReviews(): Promise<StrategyReviewRound[]> {
    const { data, error } = await this.client
      .from("strategy_reviews")
      .select("id,experiment_id,calibration_id,round_number,created_at,simulation_version,reviewed_decisions,agreed_decisions,corrected_decisions,accuracy,accepted,payload")
      .order("created_at", { ascending: false });
    throwIfError("Load strategy reviews", error);
    return (data ?? []).map(strategyReviewFromRow);
  }

  async saveStrategyReview(review: StrategyReviewRound): Promise<void> {
    const userId = await this.userId();
    const experiment = await this.getExperiment(review.experimentId);
    if (!experiment) throw new Error("Cannot save strategy feedback for a missing experiment.");
    const { error } = await this.client.from("strategy_reviews").upsert(
      {
        id: review.id,
        user_id: userId,
        experiment_id: review.experimentId,
        calibration_id: experiment.calibrationId,
        round_number: review.roundNumber,
        created_at: review.createdAt,
        simulation_version: review.simulationVersion,
        reviewed_decisions: review.answers.length,
        agreed_decisions: review.agreedCount,
        corrected_decisions: review.correctedCount,
        accuracy: review.accuracy,
        accepted: review.accepted,
        payload: encodeStorageJson(review),
      },
      { onConflict: "id" },
    );
    throwIfError("Save strategy review", error);
  }

  async saveExperimentReview(experiment: Experiment, review: StrategyReviewRound): Promise<void> {
    const { error } = await this.client.rpc("save_experiment_strategy_review", {
      p_experiment_id: experiment.id,
      p_experiment_status: experiment.status,
      p_experiment_payload: encodeStorageJson(experiment),
      p_review_id: review.id,
      p_review_payload: encodeStorageJson(review),
    });
    throwIfError("Save experiment strategy review", error);
  }

  async createStrategyReviewIfMissing(review: StrategyReviewRound): Promise<boolean> {
    const userId = await this.userId();
    const { error } = await this.client.from("strategy_reviews").insert({
      id: review.id,
      user_id: userId,
      experiment_id: review.experimentId,
      calibration_id: review.calibrationId,
      round_number: review.roundNumber,
      created_at: review.createdAt,
      simulation_version: review.simulationVersion,
      reviewed_decisions: review.answers.length,
      agreed_decisions: review.agreedCount,
      corrected_decisions: review.correctedCount,
      accuracy: review.accuracy,
      accepted: review.accepted,
      payload: encodeStorageJson(review),
    });
    if (error?.code === "23505") return false;
    throwIfError("Import strategy review", error);
    return true;
  }

  async getHands(experimentId: string): Promise<HandHistory[]> {
    const { data: experiment, error: experimentError } = await this.client
      .from("experiments")
      .select("hand_set_id")
      .eq("id", experimentId)
      .maybeSingle();
    throwIfError("Load active hand-history revision", experimentError);
    if (!experiment?.hand_set_id) return [];

    const hands: HandHistory[] = [];
    for (let offset = 0; ; offset += CLOUD_HAND_PAGE) {
      const { data, error } = await this.client
        .from("experiment_hands")
        .select("history")
        .eq("experiment_id", experimentId)
        .eq("hand_set_id", experiment.hand_set_id)
        .order("hand_number", { ascending: true })
        .range(offset, offset + CLOUD_HAND_PAGE - 1);
      throwIfError("Load experiment hands", error);
      const page = data ?? [];
      hands.push(...page.map((row) => decodeStorageJson<HandHistory>(row.history)));
      if (page.length < CLOUD_HAND_PAGE) break;
    }
    return hands;
  }

  async getStorageSummary(): Promise<StorageSummary> {
    const [calibrations, experiments, hands, reviews] = await Promise.all([
      this.client.from("calibrations").select("id", { count: "exact", head: true }),
      this.client.from("experiments").select("id", { count: "exact", head: true }),
      this.client.from("experiment_hands").select("hand_number", { count: "exact", head: true }),
      this.client.from("strategy_reviews").select("id", { count: "exact", head: true }),
    ]);
    throwIfError("Count calibrations", calibrations.error);
    throwIfError("Count experiments", experiments.error);
    throwIfError("Count experiment hands", hands.error);
    throwIfError("Count strategy reviews", reviews.error);
    return {
      mode: "supabase",
      calibrations: calibrations.count ?? 0,
      experiments: experiments.count ?? 0,
      hands: hands.count ?? 0,
      reviews: reviews.count ?? 0,
      usageLabel: "Managed by Supabase",
      description: "Your data is synced to your private Supabase account and protected by row-level security.",
    };
  }

  async deleteAll(): Promise<void> {
    const userId = await this.userId();
    const { error: experimentError } = await this.client
      .from("experiments")
      .delete()
      .eq("user_id", userId);
    throwIfError("Delete all experiments", experimentError);
    const { error: calibrationError } = await this.client
      .from("calibrations")
      .delete()
      .eq("user_id", userId);
    throwIfError("Delete all calibrations", calibrationError);
  }
}

export interface ImportResult {
  calibrations: number;
  experiments: number;
  hands: number;
  reviews: number;
  skipped: number;
}

const localStore = new LocalStorageStore();
let cloudStore: SupabaseStore | null = null;

export function getLocalStore(): LocalStorageStore {
  return localStore;
}

export function getStore(): DataStore {
  if (!isSupabaseConfigured()) return localStore;
  if (!cloudStore) cloudStore = new SupabaseStore(createClient());
  return cloudStore;
}

export async function importBrowserData(): Promise<ImportResult> {
  const target = getStore();
  if (!(target instanceof SupabaseStore)) {
    throw new Error("Configure Supabase before importing browser data.");
  }

  const calibrations = await localStore.listCalibrations();
  const experiments = await localStore.listExperiments();
  const reviews = await localStore.listStrategyReviews();
  const [remoteCalibrations, remoteExperiments] = await Promise.all([
    target.listCalibrations(),
    target.listExperiments(),
  ]);
  const calibrationIds = new Set(remoteCalibrations.map((calibration) => calibration.id));
  const experimentIds = new Set(remoteExperiments.map((experiment) => experiment.id));
  let calibrationsImported = 0;
  let experimentsImported = 0;
  let handsImported = 0;
  let reviewsImported = 0;
  let skipped = 0;

  for (const calibration of calibrations) {
    if (await target.createCalibrationIfMissing(calibration)) {
      calibrationIds.add(calibration.id);
      calibrationsImported++;
    } else {
      skipped++;
    }
  }
  for (const experiment of experiments) {
    const normalized = calibrationIds.has(experiment.calibrationId ?? "")
      ? experiment
      : { ...experiment, calibrationId: null };
    const hands = await localStore.getHands(experiment.id);
    const staged = hands.length > 0
      ? { ...normalized, status: "running" as const, handIds: [] }
      : normalized;
    if (!(await target.createExperimentIfMissing(staged))) {
      experimentIds.add(experiment.id);
      skipped++;
      continue;
    }
    try {
      if (hands.length > 0) {
        await target.saveExperimentRun(normalized, hands);
        handsImported += hands.length;
      }
      experimentIds.add(experiment.id);
      experimentsImported++;
    } catch (error) {
      await target.deleteExperiment(experiment.id);
      throw error;
    }
  }
  for (const review of reviews) {
    if (!experimentIds.has(review.experimentId)) {
      skipped++;
      continue;
    }
    const normalized = calibrationIds.has(review.calibrationId ?? "")
      ? review
      : { ...review, calibrationId: null };
    if (await target.createStrategyReviewIfMissing(normalized)) reviewsImported++;
    else skipped++;
  }

  const { data } = await createClient().auth.getUser();
  if (typeof window !== "undefined" && data.user) {
    window.localStorage.setItem(`${MIGRATION_PREFIX}${data.user.id}`, new Date().toISOString());
  }

  return {
    calibrations: calibrationsImported,
    experiments: experimentsImported,
    hands: handsImported,
    reviews: reviewsImported,
    skipped,
  };
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUuid()}`;
}
