"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SIMULATION_VERSION } from "@/types/experiment";
import { runSimulation } from "@/lib/simulation/runner";
import {
  buildPoolConfig,
  RELIABLE_SAMPLE_THRESHOLD,
} from "@/lib/simulation/defaults";
import {
  buildCalibratedPolicy,
  reviewAccuracy,
  sampleStoredUserDecisions,
} from "@/lib/player-model/review";
import { riskOfRuin } from "@/lib/analytics/aggregate";
import { formatDecisionTime } from "@/lib/simulation/timing";
import { getStore, newId } from "@/lib/storage/store";
import {
  BetSizeChart,
  BreakdownBars,
  EquityCurve,
  FrequencyBars,
  StartingHandHeatmap,
} from "@/components/charts";
import { HandReplayer } from "@/components/HandReplayer";
import { StrategyReview } from "@/components/StrategyReview";
import { OpponentMatchups } from "@/components/OpponentMatchups";
import { AnalyticsGlossary } from "@/components/AnalyticsGlossary";
import {
  CardRow,
  Empty,
  PageHeader,
  Stat,
  WarningNote,
  fmtBB,
  fmtPct,
  fmtWinRatePct,
} from "@/components/ui";
const POSITION_ORDER = [
  "UTG",
  "UTG+1",
  "MP",
  "LJ",
  "HJ",
  "CO",
  "BTN",
  "SB",
  "BB",
];
export default function ExperimentDetailPage() {
  const { id } = useParams();
  const [exp, setExp] = useState(undefined);
  const [cal, setCal] = useState(null);
  const [progress, setProgress] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [bankroll, setBankroll] = useState(2000);
  const cancelRef = useRef(false);
  // Hand explorer state
  const [hands, setHands] = useState(null);
  const [replay, setReplay] = useState(null);
  const [filterShowdown, setFilterShowdown] = useState(false);
  const [filterBigPots, setFilterBigPots] = useState(false);
  const [sortByLoss, setSortByLoss] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  useEffect(() => {
    (async () => {
      const store = getStore();
      const e = await store.getExperiment(id);
      setExp(e);
      if (e?.calibrationId) setCal(await store.getCalibration(e.calibrationId));
    })();
  }, [id]);
  const executeRun = useCallback(async (source, policy) => {
    setRunning(true);
    setError(null);
    cancelRef.current = false;
    const store = getStore();
    try {
      const out = await runSimulation(
        {
          hands: source.config.hands,
          seed: source.config.seed,
          config: source.config.table,
          pool: buildPoolConfig(source.config.pool),
          userBuyInBB: source.config.userBuyInBB,
          mode: source.config.mode,
          sampleEvery: source.config.sampleEvery,
          playMode: source.playMode ?? "solo",
          participants: (source.participants ?? []).map((participant, index) => ({
            ...participant,
            policy: index === 0 ? policy : participant.policy,
          })),
        },
        policy,
        (p) => setProgress({ ...p }),
        () => cancelRef.current,
      );
      let strategyReview = source.strategyReview;
      let completedReview;
      if (!out.cancelled && strategyReview?.pendingRerunRoundId) {
        const completedAt = new Date().toISOString();
        const rounds = strategyReview.rounds.map((round) => {
          if (round.id !== strategyReview.pendingRerunRoundId) return round;
          completedReview = { ...round, rerunCompletedAt: completedAt };
          return completedReview;
        });
        strategyReview = {
          ...strategyReview,
          rounds,
          pendingRerunRoundId: undefined,
        };
      }
      const updated = await store.saveExperimentRun(
        {
          ...source,
          simulationVersion: SIMULATION_VERSION,
          status: out.cancelled ? "cancelled" : "complete",
          results: out.aggregates,
          multiplayerResults: out.participantResults,
          userDecisionLog: sampleStoredUserDecisions(
            out.hands,
            out.userDecisionLog,
          ),
          strategyReview,
        },
        out.hands,
      );
      setExp(updated);
      setHands(out.hands);
      setReviewOpen(false);
      if (completedReview) await store.saveStrategyReview(completedReview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Simulation failed.");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, []);
  const run = useCallback(async () => {
    if (!exp || !cal) return;
    const policy = exp.strategyReview?.calibratedPolicy ?? cal.policy;
    await executeRun(exp, policy);
  }, [exp, cal, executeRun]);
  const loadHands = useCallback(async () => {
    if (!exp) return [];
    const loaded = await getStore().getHands(exp.id);
    setHands(loaded);
    return loaded;
  }, [exp]);
  const startReview = useCallback(async () => {
    setReviewLoading(true);
    setError(null);
    try {
      const loaded = hands ?? (await loadHands());
      if (loaded.length === 0) {
        setError(
          "No simulated hands were stored for review. Run the experiment again to create a review sample.",
        );
        return;
      }
      setReviewOpen(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load simulated hands for review.",
      );
    } finally {
      setReviewLoading(false);
    }
  }, [hands, loadHands]);
  const submitStrategyReview = useCallback(
    async (answers) => {
      if (!exp || !cal || answers.length === 0) return;
      const store = getStore();
      const now = new Date().toISOString();
      const stats = reviewAccuracy(answers);
      const existingRounds = exp.strategyReview?.rounds ?? [];
      const round = {
        id: newId("review"),
        experimentId: exp.id,
        calibrationId: exp.calibrationId,
        roundNumber: existingRounds.length + 1,
        createdAt: now,
        simulationVersion: exp.simulationVersion,
        seed: exp.config.seed,
        answers,
        ...stats,
        accepted: stats.correctedCount === 0,
      };
      const rounds = [...existingRounds, round];
      const calibratedPolicy =
        stats.correctedCount > 0
          ? buildCalibratedPolicy(cal.policy, rounds)
          : exp.strategyReview?.calibratedPolicy;
      const draft = {
        ...exp,
        strategyReview: {
          rounds,
          calibratedPolicy,
          pendingRerunRoundId: stats.correctedCount > 0 ? round.id : undefined,
          acceptedAt: stats.correctedCount === 0 ? now : undefined,
        },
      };
      setError(null);
      try {
        // Persist the analyzable review row and calibrated experiment state atomically before a long rerun.
        await store.saveExperimentReview(draft, round);
        setExp(draft);
        setReviewOpen(false);
        if (stats.correctedCount > 0 && calibratedPolicy)
          await executeRun(draft, calibratedPolicy);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not save strategy feedback.",
        );
      }
    },
    [exp, cal, executeRun],
  );
  const filteredHands = useMemo(() => {
    if (!hands || !exp) return [];
    const bb = exp.config.table.bigBlind;
    const primaryPlayerId = exp.participants?.[0]?.playerId ?? "user";
    let out = hands.filter((h) => {
      const r = h.results.find((x) => x.playerId === primaryPlayerId);
      if (!r) return false;
      if (filterShowdown && !r.showedDown) return false;
      if (filterBigPots) {
        const pot = h.potsAwarded.reduce((s, p) => s + p.amount, 0);
        if (pot < 40 * bb) return false;
      }
      return true;
    });
    if (sortByLoss) {
      out = [...out].sort((a, b) => {
        const na = a.results.find((x) => x.playerId === primaryPlayerId)?.net ?? 0;
        const nb = b.results.find((x) => x.playerId === primaryPlayerId)?.net ?? 0;
        return na - nb;
      });
    }
    return out.slice(0, 400);
  }, [hands, exp, filterShowdown, filterBigPots, sortByLoss]);
  if (exp === undefined)
    return <div className="text-muted text-sm">Loading…</div>;
  if (exp === null)
    return (
      <Empty
        title="Experiment not found"
        body="It may have been deleted."
        action={{ href: "/experiments", label: "All experiments" }}
      />
    );
  const r = exp.results;
  const isMultiplayer =
    exp.playMode === "multiplayer-bots" || exp.playMode === "multiplayer-only";
  const primaryPlayerId = exp.participants?.[0]?.playerId ?? "user";
  const rankedPlayers = [...(exp.multiplayerResults ?? [])].sort(
    (left, right) => right.aggregates.bb100 - left.aggregates.bb100,
  );
  const bb = exp.config.table.bigBlind;
  const avgConfidence =
    exp.userDecisionLog.length > 0
      ? exp.userDecisionLog.reduce((s, d) => s + d.confidence, 0) /
        exp.userDecisionLog.length
      : null;
  const timedModelDecisions = exp.userDecisionLog.filter(
    (decision) =>
      decision.decisionTimeMs !== undefined &&
      Number.isFinite(decision.decisionTimeMs),
  );
  const avgDecisionTime = timedModelDecisions.length
    ? timedModelDecisions.reduce(
        (sum, decision) => sum + decision.decisionTimeMs,
        0,
      ) / timedModelDecisions.length
    : null;
  const timeoutRate = timedModelDecisions.length
    ? timedModelDecisions.filter((decision) => decision.timedOut).length /
      timedModelDecisions.length
    : null;
  const ror =
    r && r.bb100 !== 0
      ? riskOfRuin(r.bb100, r.stdDevBBPerHand, bankroll)
      : null;
  const manual = cal?.manualAggregates ?? null;
  const strategyName = cal?.name ?? exp.strategyName ?? "Deleted strategy";
  return (
    <div>
      <PageHeader
        title={exp.config.name}
        sub={exp.config.description || undefined}
        right={
          <div className="flex gap-2">
            <Link href="/experiments" className="btn">
              Previous experiments
            </Link>
            <Link href={`/experiments/new?duplicate=${exp.id}`} className="btn">
              Duplicate
            </Link>
          </div>
        }
      />

      <div className="mono text-xs text-muted mb-5">
        strategy{" "}
        {cal ? (
          <Link
            href={`/profile?strategy=${encodeURIComponent(cal.id)}`}
            className="text-ink hover:text-accent hover:underline"
          >
            {strategyName}
          </Link>
        ) : (
          <span className="text-ink">{strategyName}</span>
        )}{" "}
        · seed <span className="text-ink">{exp.config.seed}</span> · engine v
        {exp.simulationVersion} · {exp.config.hands.toLocaleString()} hands
        requested · {exp.config.table.maxSeats}-player table · blinds{" "}
        {exp.config.table.smallBlind}/{bb} · rake{" "}
        {(exp.config.table.rake.percentage * 100).toFixed(1)}% cap{" "}
        {exp.config.table.rake.cap} · mode {exp.config.mode}
        {isMultiplayer && (
          <>
            {" "}· {exp.participants.length} real users ·{" "}
            {exp.playMode === "multiplayer-only" ? "players only" : "with bots"}
          </>
        )}
      </div>

      {cal && cal.handsPlayed < RELIABLE_SAMPLE_THRESHOLD && (
        <div className="mb-4">
          <WarningNote>
            This experiment uses a model built from only {cal.handsPlayed}{" "}
            calibration hands — simulated behavior leans heavily on the prior,
            so results reflect your style only loosely.
          </WarningNote>
        </div>
      )}

      {r && error && (
        <div
          className="panel px-4 py-3 text-sm mb-4"
          style={{ color: "var(--loss)" }}
        >
          {error}
        </div>
      )}

      {r && running && (
        <div className="panel px-5 py-4 mb-5 max-w-2xl">
          <div className="flex items-center justify-between text-sm mb-2">
            <span>
              {exp.strategyReview?.pendingRerunRoundId
                ? "Rerunning with calibrated decisions…"
                : "Simulating…"}
            </span>
            <span className="mono">
              {progress
                ? `${progress.handsDone.toLocaleString()} / ${progress.handsTotal.toLocaleString()}`
                : "Starting…"}
            </span>
          </div>
          <div className="h-2 rounded bg-panel2 overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{
                width: `${progress ? (progress.handsDone / progress.handsTotal) * 100 : 0}%`,
              }}
            />
          </div>
          <p className="text-xs text-muted mt-2">
            Your feedback is already saved. You can cancel and retry the rerun
            later.
          </p>
          <button
            className="btn btn-danger mt-3"
            onClick={() => (cancelRef.current = true)}
          >
            Cancel rerun
          </button>
        </div>
      )}

      {!r || exp.status === "pending" ? (
        <div className="panel px-6 py-6 max-w-xl">
          {running ? (
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span>Simulating…</span>
                <span className="mono">
                  {progress
                    ? `${progress.handsDone.toLocaleString()} / ${progress.handsTotal.toLocaleString()}`
                    : ""}
                </span>
              </div>
              <div className="h-2 rounded bg-panel2 overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{
                    width: `${progress ? (progress.handsDone / progress.handsTotal) * 100 : 0}%`,
                  }}
                />
              </div>
              {progress && (
                <div className="mono text-xs text-muted mt-2">
                  running net: {(progress.userNet / bb).toFixed(0)} bb
                </div>
              )}
              <button
                className="btn btn-danger mt-4"
                onClick={() => (cancelRef.current = true)}
              >
                Cancel (keeps partial results)
              </button>
            </div>
          ) : (
            <div>
              <div className="font-semibold mb-1">Ready to run</div>
              <p className="text-sm text-muted mb-4">
                Runs in your browser in chunks — the page stays responsive and
                you can cancel anytime.
              </p>
              {error && (
                <div className="text-sm mb-3" style={{ color: "var(--loss)" }}>
                  {error}
                </div>
              )}
              <button className="btn btn-primary" onClick={run} disabled={!cal}>
                Run {exp.config.hands.toLocaleString()} hands
              </button>
              {!cal && (
                <div className="text-xs mt-2" style={{ color: "var(--loss)" }}>
                  Calibration dataset missing — it may have been deleted.
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          {exp.status === "cancelled" && (
            <div className="mb-4">
              <WarningNote>
                Run was cancelled — results below cover the{" "}
                {r.totalHands.toLocaleString()} hands completed.
              </WarningNote>
            </div>
          )}

          {!isMultiplayer && (
          <section className="panel px-5 py-4 mb-6">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="font-semibold">Simulated Hand Review</h2>
                <p className="text-xs text-muted mt-1 max-w-2xl">
                  Choose how many sampled hands you want to review, then confirm
                  each simulated decision or make the decision you would choose.
                  Range-first reviews skip starting hands outside your selected
                  range. Your answers are saved for model improvement;
                  corrections recalibrate this experiment and trigger a seeded
                  rerun.
                </p>
              </div>
              <Link href="/accuracy" className="btn text-xs">
                View saved accuracy data
              </Link>
            </div>

            {reviewOpen && hands ? (
              <StrategyReview
                key={`${exp.id}:${exp.strategyReview?.rounds.length ?? 0}:${exp.userDecisionLog[0]?.handNumber ?? 0}`}
                hands={hands}
                decisions={exp.userDecisionLog}
                roundNumber={(exp.strategyReview?.rounds.length ?? 0) + 1}
                preflopRange={
                  (exp.strategyReview?.calibratedPolicy ?? cal?.policy)
                    ?.preflopRange
                }
                preflopRangesByPosition={
                  (exp.strategyReview?.calibratedPolicy ?? cal?.policy)
                    ?.preflopRangesByPosition
                }
                disabled={running}
                onComplete={submitStrategyReview}
              />
            ) : exp.strategyReview?.pendingRerunRoundId && !running ? (
              <div className="rounded-md border border-line bg-panel2 px-4 py-3">
                <div className="font-semibold text-sm">
                  Calibrated rerun pending
                </div>
                <p className="text-xs text-muted mt-1">
                  The corrections are saved, but the rerun did not finish. Retry
                  it to generate a new model sample for review.
                </p>
                <button
                  className="btn btn-primary mt-3"
                  onClick={run}
                  disabled={!cal}
                >
                  Retry calibrated rerun
                </button>
              </div>
            ) : exp.status !== "complete" ? (
              <div className="text-sm text-muted">
                Complete the simulation before reviewing model accuracy.
              </div>
            ) : (
              <div>
                {exp.strategyReview?.acceptedAt && (
                  <div className="rounded-md border border-line bg-panel2 px-4 py-3 mb-3">
                    <div
                      className="font-semibold text-sm"
                      style={{ color: "var(--gain)" }}
                    >
                      Latest review accepted
                    </div>
                    <p className="text-xs text-muted mt-1">
                      All{" "}
                      {exp.strategyReview.rounds.at(-1)?.answers.length ?? 0}{" "}
                      decisions in the latest round matched your strategy. You
                      can review another sample whenever you want.
                    </p>
                  </div>
                )}
                <button
                  className="btn btn-primary"
                  onClick={startReview}
                  disabled={running || reviewLoading}
                >
                  {reviewLoading
                    ? "Loading review hands..."
                    : exp.strategyReview?.acceptedAt
                      ? "Review more simulated hands"
                      : "Simulated Hand Review"}
                </button>
              </div>
            )}
          </section>
          )}

          {isMultiplayer && (
            <section className="panel px-5 py-4 mb-6">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <div className="label">Real-user comparison</div>
                  <h2 className="text-xl font-semibold mt-1">
                    {rankedPlayers[0]
                      ? `@${rankedPlayers[0].username} performed best in this run.`
                      : "Player comparison unavailable"}
                  </h2>
                  <p className="text-xs text-muted mt-1 max-w-3xl">
                    Ranked by normalized win rate across the same dealt hands.
                    {exp.playMode === "multiplayer-bots"
                      ? " Bot results are excluded so the table compares only the real users’ strategy models."
                      : " This table contained only real users’ strategy models; no bots were seated."}
                  </p>
                </div>
                <span className="rounded-full border border-line bg-panel2 px-3 py-1 text-xs">
                  {rankedPlayers.length} real users
                </span>
              </div>
              {rankedPlayers.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-line text-left">
                        <th className="label py-2 pr-3 font-normal">Rank</th>
                        <th className="label py-2 pr-3 font-normal">Player</th>
                        <th className="label py-2 pr-3 font-normal">Strategy</th>
                        <th className="label py-2 px-3 font-normal text-right">Win rate</th>
                        <th className="label py-2 px-3 font-normal text-right">Total</th>
                        <th className="label py-2 px-3 font-normal text-right">Hands won</th>
                        <th className="label py-2 pl-3 font-normal text-right">Max drawdown</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankedPlayers.map((player, index) => {
                        const result = player.aggregates;
                        return (
                          <tr key={player.participantId} className="border-b border-line last:border-0">
                            <td className="py-3 pr-3 mono font-bold">#{index + 1}</td>
                            <td className="py-3 pr-3">
                              <div className="font-semibold">@{player.username}</div>
                              <div className="text-[11px] text-muted">
                                {player.relationshipDegree === 0
                                  ? "You"
                                  : player.relationshipDegree === 1
                                    ? "Direct friend"
                                    : "Friend of a friend"}
                              </div>
                            </td>
                            <td className="py-3 pr-3 text-xs text-muted">{player.strategyName}</td>
                            <td
                              className="py-3 px-3 text-right mono font-bold"
                              style={{ color: result.bb100 >= 0 ? "var(--gain)" : "var(--loss)" }}
                            >
                              {fmtWinRatePct(result.bb100)}
                            </td>
                            <td className="py-3 px-3 text-right mono">{fmtBB(result.bbWon, 1)}</td>
                            <td className="py-3 px-3 text-right mono">{fmtPct(result.winRate)}</td>
                            <td className="py-3 pl-3 text-right mono">{result.maxDrawdownBB.toFixed(0)} bb</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {rankedPlayers.length > 1 && (
                <p className="text-xs text-muted mt-3">
                  The top strategy finished {fmtWinRatePct(
                    rankedPlayers[0].aggregates.bb100 - rankedPlayers[1].aggregates.bb100,
                  )} ahead of second place in normalized win rate. This is a
                  simulation result, not proof of a lasting skill difference.
                </p>
              )}
            </section>
          )}

          {/* Beginner summary */}
          <section className="panel px-5 py-4 mb-4">
            <div className="label">Your result</div>
            <h2 className="text-xl font-semibold mt-1">
              {r.bb100 > 0
                ? "This strategy won in the simulation."
                : r.bb100 < 0
                  ? "This strategy lost in the simulation."
                  : "This strategy finished break-even."}
            </h2>
            <p className="text-sm text-muted mt-2 max-w-3xl">
              {r.statisticallySignificant
                ? "The result was large enough relative to the swings in this run to stand apart from break-even. It still describes this simulated opponent pool, not guaranteed real-world profit."
                : "The run was too swingy to confidently separate this result from break-even. More simulated hands will make the estimate clearer."}
            </p>
          </section>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat
              label="Win rate"
              value={fmtWinRatePct(r.bb100)}
              tone={r.bb100 >= 0 ? "gain" : "loss"}
              sub="average normalized result"
              title="Numerically equivalent to big blinds won per 100 hands"
            />
            <Stat
              label="Total won / lost"
              value={fmtBB(r.bbWon, 0)}
              tone={r.bbWon >= 0 ? "gain" : "loss"}
              sub="in big blinds"
            />
            <Stat
              label="Hands won"
              value={fmtPct(r.winRate)}
              sub="share of all hands"
            />
            <Stat
              label="Hands simulated"
              value={r.totalHands.toLocaleString()}
              sub="larger samples are clearer"
            />
          </div>

          {exp.playMode !== "multiplayer-only" && (
            <OpponentMatchups rows={r.byOpponentType} />
          )}

          <div className="mb-3">
            <h2 className="font-semibold">Where the result came from</h2>
            <p className="text-xs text-muted mt-1">
              A simple split between pots that reached a showdown and pots won
              or lost before cards were revealed.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <Stat
              label="Showdown winnings"
              value={fmtBB(r.showdownNetBB, 0)}
              tone={r.showdownNetBB >= 0 ? "gain" : "loss"}
            />
            <Stat
              label="Non-showdown"
              value={fmtBB(r.nonShowdownNetBB, 0)}
              tone={r.nonShowdownNetBB >= 0 ? "gain" : "loss"}
              title="Pots won or lost before cards were revealed"
            />
            <Stat
              label="Rake paid"
              value={`${(r.rakePaid / bb).toFixed(0)} bb`}
              sub="fees removed from pots"
            />
          </div>

          {/* Curves */}
          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            <section className="panel px-5 py-4">
              <h2 className="font-semibold mb-2">Bankroll (bb)</h2>
              <EquityCurve
                points={r.cumulativeBB}
                stride={Math.max(
                  1,
                  Math.floor(r.totalHands / Math.max(1, r.cumulativeBB.length)),
                )}
              />
            </section>
            <section className="panel px-5 py-4">
              <h2 className="font-semibold mb-2">Drawdown from peak (bb)</h2>
              <EquityCurve
                points={r.drawdownCurveBB.map((d) => -d)}
                stride={Math.max(
                  1,
                  Math.floor(
                    r.totalHands / Math.max(1, r.drawdownCurveBB.length),
                  ),
                )}
                label="drawdown bb"
              />
            </section>
          </div>

          {/* Breakdowns */}
          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            <section className="panel px-5 py-4">
              <h2 className="font-semibold mb-2">Win rate by position (%)</h2>
              <BreakdownBars rows={r.byPosition} order={POSITION_ORDER} />
            </section>
            <section className="panel px-5 py-4">
              <h2 className="font-semibold mb-2">Win rate by pot type (%)</h2>
              <BreakdownBars rows={r.byPotType} />
            </section>
            <section className="panel px-5 py-4">
              <h2 className="font-semibold mb-2">
                Win rate by your stack depth (%)
              </h2>
              <BreakdownBars rows={r.byStackDepth} />
            </section>
            <section className="panel px-5 py-4">
              <h2 className="font-semibold mb-2">Simulated action mix</h2>
              <FrequencyBars counts={r.actionCounts} />
            </section>
            <section className="panel px-5 py-4">
              <h2 className="font-semibold mb-2">
                Bet sizing (fraction of pot)
              </h2>
              <BetSizeChart hist={r.betSizeHistogram} />
            </section>
            <section className="panel px-5 py-4">
              <h2 className="font-semibold mb-2">Starting-hand win rate (%)</h2>
              <StartingHandHeatmap rows={r.byHoleCards} />
            </section>
          </div>

          {/* Manual vs simulated */}
          {manual && (
            <section className="panel px-5 py-4 mb-6">
              <h2 className="font-semibold mb-1">
                Manual play vs simulated model
              </h2>
              <p className="text-xs text-muted mb-3">
                Same metrics for your {cal.handsPlayed} hand calibration session
                and this simulated run. Large gaps can mean the model
                hasn&apos;t captured your style — or that your small manual
                sample ran hot or cold.
              </p>
              <table className="w-full text-sm max-w-2xl">
                <thead>
                  <tr className="text-left border-b border-line">
                    <th className="label py-2 font-normal">Metric</th>
                    <th className="label py-2 font-normal text-right">
                      Manual ({manual.totalHands} hands)
                    </th>
                    <th className="label py-2 font-normal text-right">
                      Simulated ({r.totalHands.toLocaleString()})
                    </th>
                  </tr>
                </thead>
                <tbody className="mono">
                  {[
                    [
                      "Win rate",
                      fmtWinRatePct(manual.bb100),
                      fmtWinRatePct(r.bb100),
                    ],
                    [
                      "Showdown net (bb)",
                      manual.showdownNetBB.toFixed(0),
                      r.showdownNetBB.toFixed(0),
                    ],
                    [
                      "Non-showdown net (bb)",
                      manual.nonShowdownNetBB.toFixed(0),
                      r.nonShowdownNetBB.toFixed(0),
                    ],
                    ["Hands won", fmtPct(manual.winRate), fmtPct(r.winRate)],
                    [
                      "Volatility",
                      `${manual.stdDevBB100.toFixed(0)}%`,
                      `${r.stdDevBB100.toFixed(0)}%`,
                    ],
                  ].map(([m, a, b]) => (
                    <tr key={m} className="border-b border-line last:border-0">
                      <td className="py-2 font-sans">{m}</td>
                      <td className="py-2 text-right">{a}</td>
                      <td className="py-2 text-right">{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-muted mt-2">
                Manual-sample intervals are extremely wide at this size; the
                comparison is directional only.
              </p>
            </section>
          )}

          {/* Advanced analytics */}
          <div className="mt-8 mb-3">
            <div className="label">Advanced analytics</div>
            <h2 className="text-lg font-semibold mt-1">
              Uncertainty, variance, and model detail
            </h2>
            <p className="text-xs text-muted mt-1 max-w-3xl">
              These numbers help experienced users judge how reliable and risky
              the headline result is. Open the guide for plain-English
              definitions.
            </p>
          </div>
          <AnalyticsGlossary
            groups={["analytics", "model"]}
            title="Explain the advanced numbers"
          />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat
              label="95% confidence range"
              value={`${fmtWinRatePct(r.ciLow)} … ${fmtWinRatePct(r.ciHigh)}`}
              sub="estimated win-rate range"
              title="If the interval includes 0%, the sample cannot distinguish winning from losing"
            />
            <Stat
              label="Volatility"
              value={`${r.stdDevBB100.toFixed(0)}%`}
              sub="size of normal swings"
            />
            <Stat
              label="Max drawdown"
              value={`${r.maxDrawdownBB.toFixed(0)} bb`}
              tone="loss"
            />
            <Stat
              label="Profit factor"
              value={
                r.profitFactor === Infinity ? "∞" : r.profitFactor.toFixed(2)
              }
              title="Gross winnings divided by gross losses"
            />
            <Stat
              label="Model confidence"
              value={avgConfidence !== null ? fmtPct(avgConfidence) : "—"}
              sub="personal data vs default model"
            />
            <Stat
              label="Decision time"
              value={formatDecisionTime(avgDecisionTime) ?? "—"}
              sub="simulated average"
            />
            <Stat
              label="Timeout rate"
              value={timeoutRate === null ? "—" : fmtPct(timeoutRate, 2)}
              sub="auto check/fold"
            />
          </div>

          <div className="panel px-5 py-4 mb-6 flex flex-wrap items-center gap-4">
            <div>
              <div className="label">Estimated risk of losing the bankroll</div>
              <div
                className="mono text-xl font-bold"
                style={{
                  color:
                    ror !== null && ror < 0.05 ? "var(--gain)" : "var(--loss)",
                }}
              >
                {ror === null
                  ? "—"
                  : ror >= 1
                    ? "certain (losing rate)"
                    : fmtPct(ror, 2)}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted">
              with a bankroll of
              <input
                type="number"
                className="field w-28"
                value={bankroll}
                min={100}
                step={100}
                onChange={(e) => setBankroll(Number(e.target.value))}
              />
              bb
            </label>
            <div className="text-xs text-muted max-w-sm">
              A simplified estimate from this run&apos;s win rate and swings. It
              assumes both stay constant.
            </div>
          </div>

          {/* Hand explorer */}
          <section className="panel px-5 py-4 mb-6">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h2 className="font-semibold">Hand histories</h2>
              <span className="text-xs text-muted">
                {exp.handIds.length.toLocaleString()} stored
                {exp.config.mode === "high-speed"
                  ? ` (sampled 1/${exp.config.sampleEvery})`
                  : ""}
              </span>
              {hands && (
                <div className="flex items-center gap-3 ml-auto text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filterShowdown}
                      onChange={(e) => setFilterShowdown(e.target.checked)}
                    />
                    showdowns only
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filterBigPots}
                      onChange={(e) => setFilterBigPots(e.target.checked)}
                    />
                    big pots (40bb+)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sortByLoss}
                      onChange={(e) => setSortByLoss(e.target.checked)}
                    />
                    biggest losses first
                  </label>
                </div>
              )}
            </div>
            {!hands ? (
              <button className="btn" onClick={loadHands}>
                Load stored hands
              </button>
            ) : filteredHands.length === 0 ? (
              <div className="text-sm text-muted">
                No hands match the filters.
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto divide-y divide-line">
                {filteredHands.map((h) => {
                  const res = h.results.find(
                    (x) => x.playerId === primaryPlayerId,
                  );
                  const hole = res?.holeCards ?? null;
                  const pot = h.potsAwarded.reduce((s, p) => s + p.amount, 0);
                  return (
                    <button
                      key={h.handNumber}
                      className="w-full flex items-center gap-4 px-2 py-2 text-left hover:bg-panel2/60 rounded"
                      onClick={() => setReplay(h)}
                    >
                      <span className="mono text-xs text-muted w-16">
                        #{h.handNumber}
                      </span>
                      <span className="w-20">
                        {hole ? (
                          <CardRow cards={hole} size="sm" />
                        ) : (
                          <span className="text-xs text-muted">
                            folded blind
                          </span>
                        )}
                      </span>
                      <span className="w-40">
                        {h.board.length > 0 ? (
                          <CardRow cards={h.board} size="sm" />
                        ) : (
                          <span className="text-xs text-muted italic">
                            no flop
                          </span>
                        )}
                      </span>
                      <span className="mono text-xs text-muted">
                        pot {(pot / bb).toFixed(0)}bb
                      </span>
                      <span
                        className="mono text-sm font-bold ml-auto"
                        style={{
                          color:
                            (res?.net ?? 0) >= 0
                              ? "var(--gain)"
                              : "var(--loss)",
                        }}
                      >
                        {((res?.net ?? 0) / bb).toFixed(1)} bb
                      </span>
                      {res?.showedDown && (
                        <span className="text-[10px] text-info">SD</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <div className="text-xs text-muted max-w-3xl mb-8">
            Interpretation: opponents are heuristic archetypes, equities are
            Monte Carlo estimates, and your model is a statistical imitation of
            a small sample — a positive result here is evidence about this
            simulated pool, not a guarantee about live play.
          </div>
        </>
      )}

      {replay && <HandReplayer hand={replay} onClose={() => setReplay(null)} />}
    </div>
  );
}
