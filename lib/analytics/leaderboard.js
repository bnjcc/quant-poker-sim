export function strategyLeaderboardFromExperiments(experiments, limit = 3) {
  const strategies = new Map();
  for (const experiment of experiments) {
    const winRate = experiment.results?.bb100;
    const totalHands = experiment.results?.totalHands;
    if (
      experiment.status !== "complete" ||
      !Number.isFinite(winRate) ||
      !Number.isFinite(totalHands) ||
      totalHands <= 0
    ) {
      continue;
    }
    const strategyId =
      experiment.calibrationId ??
      experiment.strategyId ??
      `deleted:${experiment.strategyName ?? experiment.id}`;
    const current = strategies.get(strategyId) ?? {
      username: "You",
      strategyName: experiment.strategyName ?? "Unnamed strategy",
      weightedWinRate: 0,
      experimentCount: 0,
      totalHands: 0,
      latestCreatedAt: "",
    };
    current.weightedWinRate += winRate * totalHands;
    current.experimentCount++;
    current.totalHands += totalHands;
    if ((experiment.createdAt ?? "") >= current.latestCreatedAt) {
      current.latestCreatedAt = experiment.createdAt ?? "";
      current.strategyName = experiment.strategyName ?? current.strategyName;
    }
    strategies.set(strategyId, current);
  }
  const boundedLimit = Math.min(100, Math.max(1, Math.floor(limit) || 3));
  return [...strategies.values()]
    .map((strategy) => ({
      username: strategy.username,
      strategyName: strategy.strategyName,
      winRate: strategy.weightedWinRate / strategy.totalHands,
      experimentCount: strategy.experimentCount,
      totalHands: strategy.totalHands,
    }))
    .sort(
      (a, b) =>
        b.winRate - a.winRate ||
        b.totalHands - a.totalHands ||
        a.strategyName.localeCompare(b.strategyName),
    )
    .slice(0, boundedLimit)
    .map((strategy, index) => ({ rank: index + 1, ...strategy }));
}
