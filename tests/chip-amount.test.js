import { describe, expect, it } from "vitest";
import { stepChipAmount } from "@/components/ChipAmountInput";

describe("chip amount stepping", () => {
  it("moves by one whole chip and respects legal bounds", () => {
    expect(stepChipAmount(10, 1, 5, 12)).toBe(11);
    expect(stepChipAmount(10, -1, 5, 12)).toBe(9);
    expect(stepChipAmount(12, 1, 5, 12)).toBe(12);
    expect(stepChipAmount(5, -1, 5, 12)).toBe(5);
  });
});
