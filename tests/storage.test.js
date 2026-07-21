import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calibrationFromRow,
  decodeStorageJson,
  encodeStorageJson,
  experimentFromRow,
  LocalStorageStore,
  strategyReviewFromRow,
} from "@/lib/storage/store";
afterEach(() => vi.unstubAllGlobals());
describe("storage JSON codec", () => {
  it("round-trips non-finite aggregate values without turning them into null", () => {
    const input = {
      profitFactor: Infinity,
      negative: -Infinity,
      invalid: NaN,
      nested: [1, Infinity],
    };
    const output = decodeStorageJson(encodeStorageJson(input));
    expect(output.profitFactor).toBe(Infinity);
    expect(output.negative).toBe(-Infinity);
    expect(Number.isNaN(output.invalid)).toBe(true);
    expect(output.nested).toEqual([1, Infinity]);
  });
});
describe("calibration draft storage", () => {
  it("keeps unfinished sessions resumable but out of completed strategy lists", async () => {
    const values = new Map();
    vi.stubGlobal("window", {
      localStorage: {
        get length() {
          return values.size;
        },
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
        key: (index) => [...values.keys()][index] ?? null,
      },
    });
    const store = new LocalStorageStore();
    await store.saveCalibrationDraft({
      id: "draft_range",
      method: "range-first",
      name: "Unfinished",
      createdAt: "2026-07-20T00:00:00.000Z",
      handsPlayed: 12,
      targetHands: 50,
    });
    await store.saveCalibration({
      id: "complete",
      method: "full-session",
      name: "Finished",
      createdAt: "2026-07-19T00:00:00.000Z",
      handsPlayed: 50,
    });

    expect(await store.listCalibrations()).toHaveLength(1);
    expect((await store.getCalibrationDraft("range-first"))?.handsPlayed).toBe(
      12,
    );

    await store.deleteCalibrationDraft("range-first");
    expect(await store.getCalibrationDraft("range-first")).toBeNull();
    expect((await store.listCalibrations())[0].id).toBe("complete");
  });
});
describe("Supabase row mapping", () => {
  it("uses normalized calibration metadata instead of stale payload metadata", () => {
    const payload = {
      id: "stale",
      name: "Stale name",
      createdAt: "2020-01-01T00:00:00.000Z",
      handsPlayed: 1,
      seed: "manual",
      decisions: [],
      histories: [],
      userSeatByHand: {},
      tendencies: {},
      policy: {},
      manualAggregates: null,
    };
    const mapped = calibrationFromRow({
      id: "cal_current",
      name: "Current name",
      created_at: "2026-07-16T00:00:00.000Z",
      hands_played: 50,
      payload: encodeStorageJson(payload),
    });
    expect(mapped.id).toBe("cal_current");
    expect(mapped.name).toBe("Current name");
    expect(mapped.handsPlayed).toBe(50);
  });
  it("reflects calibration deletion and current status from normalized experiment columns", () => {
    const payload = {
      id: "stale",
      createdAt: "2020-01-01T00:00:00.000Z",
      config: {},
      calibrationId: "cal_deleted",
      simulationVersion: "1.0.0",
      status: "running",
      results: { profitFactor: Infinity },
      handIds: [],
      userDecisionLog: [],
    };
    const mapped = experimentFromRow({
      id: "exp_current",
      calibration_id: null,
      created_at: "2026-07-16T00:00:00.000Z",
      status: "complete",
      payload: encodeStorageJson(payload),
    });
    expect(mapped.id).toBe("exp_current");
    expect(mapped.calibrationId).toBeNull();
    expect(mapped.status).toBe("complete");
    expect(mapped.results?.profitFactor).toBe(Infinity);
  });
  it("uses normalized strategy-review metrics for analysis", () => {
    const mapped = strategyReviewFromRow({
      id: "review_current",
      experiment_id: "exp_current",
      calibration_id: null,
      round_number: 2,
      created_at: "2026-07-17T00:00:00.000Z",
      simulation_version: "1.3.0",
      reviewed_decisions: 8,
      agreed_decisions: 7,
      corrected_decisions: 1,
      accuracy: 0.875,
      accepted: false,
      payload: encodeStorageJson({
        id: "stale",
        experimentId: "stale",
        calibrationId: "cal_deleted",
        roundNumber: 1,
        createdAt: "2020-01-01T00:00:00.000Z",
        simulationVersion: "1.0.0",
        seed: "seed",
        answers: [],
        agreedCount: 0,
        correctedCount: 0,
        accuracy: 0,
        accepted: true,
      }),
    });
    expect(mapped.id).toBe("review_current");
    expect(mapped.experimentId).toBe("exp_current");
    expect(mapped.calibrationId).toBeNull();
    expect(mapped.roundNumber).toBe(2);
    expect(mapped.accuracy).toBe(0.875);
    expect(mapped.correctedCount).toBe(1);
    expect(mapped.accepted).toBe(false);
  });
});
