import { describe, expect, it } from "vitest";
import { tableConfigSchema } from "@/types/experiment";
const baseTable = {
  smallBlind: 1,
  bigBlind: 2,
  rake: { percentage: 0.05, cap: 6, noFlopNoDrop: true },
};
describe("table configuration", () => {
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
