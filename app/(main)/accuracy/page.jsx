"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getStore } from "@/lib/storage/store";
import { Empty, PageHeader, Stat, fmtPct } from "@/components/ui";
export default function AccuracyPage() {
  const [reviews, setReviews] = useState(null);
  const [experiments, setExperiments] = useState([]);
  const [error, setError] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const store = getStore();
        const [loadedReviews, loadedExperiments] = await Promise.all([
          store.listStrategyReviews(),
          store.listExperiments(),
        ]);
        setReviews(loadedReviews);
        setExperiments(loadedExperiments);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load model accuracy data.",
        );
        setReviews([]);
      }
    })();
  }, []);
  const experimentById = useMemo(
    () => new Map(experiments.map((experiment) => [experiment.id, experiment])),
    [experiments],
  );
  if (reviews === null)
    return <div className="text-sm text-muted">Loading…</div>;
  const decisions = reviews.reduce(
    (sum, review) => sum + review.answers.length,
    0,
  );
  const agreements = reviews.reduce(
    (sum, review) => sum + review.agreedCount,
    0,
  );
  const corrections = reviews.reduce(
    (sum, review) => sum + review.correctedCount,
    0,
  );
  const accuracy = decisions > 0 ? agreements / decisions : null;
  return (
    <div>
      <PageHeader
        title="Model accuracy feedback"
        sub="Tester judgments are saved separately from simulation results so you can measure where the strategy model agrees with real decisions."
      />

      {error && (
        <div
          className="panel px-4 py-3 text-sm mb-4"
          style={{ color: "var(--loss)" }}
        >
          {error}
        </div>
      )}

      {reviews.length === 0 ? (
        <Empty
          title="No strategy reviews yet"
          body="Run an experiment, open its accuracy review, and judge the model across the sampled hands."
          action={{ href: "/experiments", label: "View experiments" }}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <Stat
              label="Reviewed decisions"
              value={decisions.toLocaleString()}
              sub={`${reviews.length} review rounds`}
            />
            <Stat
              label="Overall accuracy"
              value={accuracy === null ? "—" : fmtPct(accuracy, 1)}
              sub="agreement weighted by decisions"
            />
            <Stat
              label="Agreements"
              value={agreements.toLocaleString()}
              tone="gain"
            />
            <Stat
              label="Corrections"
              value={corrections.toLocaleString()}
              tone={corrections > 0 ? "loss" : undefined}
            />
          </div>

          <section className="panel px-5 py-4 mb-5 overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-left border-b border-line">
                  <th className="label py-2 font-normal">Experiment</th>
                  <th className="label py-2 font-normal">Round</th>
                  <th className="label py-2 font-normal">Date</th>
                  <th className="label py-2 font-normal text-right">
                    Decisions
                  </th>
                  <th className="label py-2 font-normal text-right">
                    Accuracy
                  </th>
                  <th className="label py-2 font-normal text-right">
                    Corrections
                  </th>
                  <th className="label py-2 font-normal text-right">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((review) => {
                  const experiment = experimentById.get(review.experimentId);
                  return (
                    <tr
                      key={review.id}
                      className="border-b border-line last:border-0"
                    >
                      <td className="py-2">
                        <Link
                          className="text-accent hover:underline"
                          href={`/experiments/${review.experimentId}`}
                        >
                          {experiment?.config.name ?? review.experimentId}
                        </Link>
                      </td>
                      <td className="py-2 mono">{review.roundNumber}</td>
                      <td className="py-2 text-muted">
                        {new Date(review.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 mono text-right">
                        {review.answers.length}
                      </td>
                      <td className="py-2 mono text-right">
                        {fmtPct(review.accuracy, 1)}
                      </td>
                      <td className="py-2 mono text-right">
                        {review.correctedCount}
                      </td>
                      <td className="py-2 text-right text-xs">
                        {review.accepted
                          ? "accepted"
                          : review.rerunCompletedAt
                            ? "recalibrated + rerun"
                            : "rerun pending"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}

      <div className="text-xs text-muted max-w-3xl">
        This page shows the signed-in tester&apos;s records. In cloud mode, all
        tester rows are also available to the project owner in Supabase&apos;s{" "}
        <span className="mono">strategy_reviews</span> table for cross-user
        analysis; row-level security keeps them private in the public app.
      </div>
    </div>
  );
}
