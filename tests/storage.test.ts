import { describe, expect, it } from "vitest";
import type { SimulationAggregates } from "@/lib/analytics/aggregate";
import {
  calibrationFromRow,
  decodeStorageJson,
  encodeStorageJson,
  experimentFromRow,
} from "@/lib/storage/store";
import type { CalibrationDataset, Experiment } from "@/types/experiment";

describe("storage JSON codec", () => {
  it("round-trips non-finite aggregate values without turning them into null", () => {
    const input = {
      profitFactor: Infinity,
      negative: -Infinity,
      invalid: NaN,
      nested: [1, Infinity],
    };

    const output = decodeStorageJson<typeof input>(encodeStorageJson(input));

    expect(output.profitFactor).toBe(Infinity);
    expect(output.negative).toBe(-Infinity);
    expect(Number.isNaN(output.invalid)).toBe(true);
    expect(output.nested).toEqual([1, Infinity]);
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
    } as unknown as CalibrationDataset;

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
      results: { profitFactor: Infinity } as SimulationAggregates,
      handIds: [],
      userDecisionLog: [],
    } as unknown as Experiment;

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
});
