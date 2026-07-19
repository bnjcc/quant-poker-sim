import { describe, expect, it } from "vitest";
import { strategyLeaderboardFromExperiments } from "@/lib/analytics/leaderboard";

function experiment({
  id,
  strategyId,
  strategyName,
  winRate,
  hands,
  status = "complete",
  createdAt = "2026-07-18T00:00:00.000Z",
}) {
  return {
    id,
    calibrationId: strategyId,
    strategyName,
    status,
    createdAt,
    results: { bb100: winRate, totalHands: hands },
  };
}

describe("strategy leaderboard", () => {
  it("ranks unique strategies by hand-weighted completed results", () => {
    const leaderboard = strategyLeaderboardFromExperiments([
      experiment({
        id: "a1",
        strategyId: "a",
        strategyName: "Steady",
        winRate: 5,
        hands: 1000,
      }),
      experiment({
        id: "a2",
        strategyId: "a",
        strategyName: "Steady renamed",
        winRate: 15,
        hands: 3000,
        createdAt: "2026-07-19T00:00:00.000Z",
      }),
      experiment({
        id: "b1",
        strategyId: "b",
        strategyName: "Short heater",
        winRate: 13,
        hands: 100,
      }),
      experiment({
        id: "c1",
        strategyId: "c",
        strategyName: "Pending",
        winRate: 99,
        hands: 100,
        status: "pending",
      }),
    ]);
    expect(leaderboard).toHaveLength(2);
    expect(leaderboard[0]).toMatchObject({
      rank: 1,
      strategyName: "Short heater",
      winRate: 13,
    });
    expect(leaderboard[1]).toMatchObject({
      rank: 2,
      strategyName: "Steady renamed",
      winRate: 12.5,
      experimentCount: 2,
      totalHands: 4000,
    });
  });
});
