import { HandHistory } from "@/types/poker";
import { CalibrationDataset, Experiment } from "@/types/experiment";

/**
 * Persistence abstraction. The MVP ships a browser localStorage
 * implementation so the app works with zero external services (demo mode).
 * A PostgreSQL/Prisma implementation can satisfy this same interface without
 * touching any consumer — see docs/ARCHITECTURE.md.
 */
export interface DataStore {
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
}

const CAL_KEY = "psim:calibrations";
const EXP_KEY = "psim:experiments";
const HANDS_PREFIX = "psim:hands:";
/** Hard cap on stored hands per experiment to respect localStorage limits. */
const MAX_STORED_HANDS = 3000;

class LocalStorageStore implements DataStore {
  private read<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private write(key: string, value: unknown): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // Quota exceeded: drop the oldest hand archives to make room.
      this.evictOldestHands();
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        console.error("Storage full; data not saved", e);
        throw new Error("Browser storage is full. Delete old experiments or use high-speed mode.");
      }
    }
  }

  private evictOldestHands(): void {
    if (typeof window === "undefined") return;
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(HANDS_PREFIX)) keys.push(k);
    }
    if (keys.length > 0) window.localStorage.removeItem(keys[0]);
  }

  async listCalibrations(): Promise<CalibrationDataset[]> {
    return this.read<CalibrationDataset[]>(CAL_KEY, []);
  }
  async getCalibration(id: string): Promise<CalibrationDataset | null> {
    return (await this.listCalibrations()).find((c) => c.id === id) ?? null;
  }
  async saveCalibration(c: CalibrationDataset): Promise<void> {
    const all = (await this.listCalibrations()).filter((x) => x.id !== c.id);
    all.unshift(c);
    this.write(CAL_KEY, all);
  }
  async deleteCalibration(id: string): Promise<void> {
    this.write(CAL_KEY, (await this.listCalibrations()).filter((c) => c.id !== id));
  }

  async listExperiments(): Promise<Experiment[]> {
    return this.read<Experiment[]>(EXP_KEY, []);
  }
  async getExperiment(id: string): Promise<Experiment | null> {
    return (await this.listExperiments()).find((e) => e.id === id) ?? null;
  }
  async saveExperiment(e: Experiment): Promise<void> {
    const all = (await this.listExperiments()).filter((x) => x.id !== e.id);
    all.unshift(e);
    this.write(EXP_KEY, all);
  }
  async deleteExperiment(id: string): Promise<void> {
    this.write(EXP_KEY, (await this.listExperiments()).filter((e) => e.id !== id));
    if (typeof window !== "undefined") window.localStorage.removeItem(HANDS_PREFIX + id);
  }

  async saveHands(experimentId: string, hands: HandHistory[]): Promise<string[]> {
    const capped = hands.slice(0, MAX_STORED_HANDS);
    this.write(HANDS_PREFIX + experimentId, capped);
    return capped.map((h) => `${experimentId}:${h.handNumber}`);
  }
  async getHands(experimentId: string): Promise<HandHistory[]> {
    return this.read<HandHistory[]>(HANDS_PREFIX + experimentId, []);
  }
}

let store: DataStore | null = null;
export function getStore(): DataStore {
  if (!store) store = new LocalStorageStore();
  return store;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
