import { describe, expect, it } from "vitest";
import { tableConfigSchema } from "@/types/experiment";
import {
  DEFAULT_TABLE,
  TABLE_STAKES,
  threeBigBlindChipAmount,
} from "@/lib/simulation/defaults";
const baseTable = {
  smallBlind: 1,
  bigBlind: 2,
  rake: { percentage: 0.05, cap: 6, noFlopNoDrop: true },
};
describe("table configuration", () => {
  it("defaults to 1/3 and offers the 2/5 preset", () => {
    expect(DEFAULT_TABLE.smallBlind).toBe(1);
    expect(DEFAULT_TABLE.bigBlind).toBe(3);
    expect(TABLE_STAKES).toEqual([
      { label: "1 / 3 chips", smallBlind: 1, bigBlind: 3 },
      { label: "2 / 5 chips", smallBlind: 2, bigBlind: 5 },
    ]);
    expect(threeBigBlindChipAmount(3)).toBe(9);
    expect(threeBigBlindChipAmount(5)).toBe(15);
  });

  it("accepts nine-player full-ring tables", () => {
    expect(
      tableConfigSchema.parse({ ...baseTable, maxSeats: 9 }).maxSeats,
    ).toBe(9);
  });
  it("rejects tables larger than nine players", () => {
    expect(
      tableConfigSchema.safeParse({ ...baseTable, maxSeats: 10 }).success,
    ).toBe(false);
  });
});
