import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/auth/redirect";
describe("safeRedirectPath", () => {
  it("keeps local paths with their query and hash", () => {
    expect(safeRedirectPath("/experiments/exp_1?tab=hands#replay")).toBe(
      "/experiments/exp_1?tab=hands#replay",
    );
  });
  it.each([
    "https://evil.example/",
    "//evil.example/",
    "/\\evil.example/",
    "\\evil.example/",
    "javascript:alert(1)",
  ])("rejects an external redirect attempt: %s", (attempt) => {
    expect(safeRedirectPath(attempt)).toBe("/");
  });
});
