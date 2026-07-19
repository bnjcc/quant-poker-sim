import { AGENT_PRESETS } from "@/lib/agents/profiles";
import { fmtBB, fmtWinRatePct } from "@/components/ui";

const DESCRIPTIONS = Object.fromEntries(
  AGENT_PRESETS.map((profile) => [profile.id, profile.description]),
);

function resultLabel(score) {
  if (score > 0.5) return "Winning matchup";
  if (score < -0.5) return "Losing matchup";
  return "About even";
}

function MatchupHighlight({ label, row }) {
  return (
    <div className="rounded-lg border border-line bg-panel2 px-4 py-3">
      <div className="label">{label}</div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mt-1">
        <h3 className="font-semibold">{row.name}</h3>
        <span
          className="mono text-lg font-bold"
          style={{ color: row.score >= 0 ? "var(--gain)" : "var(--loss)" }}
        >
          {fmtWinRatePct(row.score)}
        </span>
      </div>
      <p className="text-xs text-muted mt-1">
        {DESCRIPTIONS[row.id] ?? "A heuristic simulated opponent archetype."}
      </p>
      <div className="text-[11px] text-muted mt-2">
        {fmtBB(row.bb, 1)} attributed across{" "}
        {row.encounters.toLocaleString()} opponent-hand encounters
      </div>
    </div>
  );
}

export function OpponentMatchups({ rows }) {
  const matchups = Object.values(rows ?? {})
    .filter(
      (row) =>
        row && Number.isFinite(row.score) && Number.isFinite(row.encounters),
    )
    .sort((left, right) => right.score - left.score);
  if (matchups.length === 0) return null;

  const best = matchups[0];
  const worst = matchups.at(-1);
  const maximum = Math.max(1, ...matchups.map((row) => Math.abs(row.score)));

  return (
    <section className="panel px-5 py-4 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="label">Opponent-type analytics</div>
          <h2 className="text-xl font-semibold mt-1">
            Where this strategy has an edge — and where it struggles
          </h2>
          <p className="text-sm text-muted mt-2 max-w-3xl">
            The model&apos;s strongest result was against {best.name}. Its weakest
            result was against {worst.name}. Compare the full ranking below;
            larger encounter counts are more informative.
          </p>
        </div>
        <span className="rounded-full border border-line bg-panel2 px-3 py-1 text-xs">
          {matchups.length} player {matchups.length === 1 ? "type" : "types"}
        </span>
      </div>

      {matchups.length === 1 ? (
        <div className="max-w-xl mb-5">
          <MatchupHighlight label="Only matchup in this pool" row={best} />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3 mb-5">
          <MatchupHighlight label="Best matchup result" row={best} />
          <MatchupHighlight label="Hardest matchup result" row={worst} />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="label py-2 pr-3 font-normal">Player type</th>
              <th className="label py-2 px-3 font-normal">Relative result</th>
              <th className="label py-2 px-3 font-normal text-right">
                Matchup score
              </th>
              <th className="label py-2 px-3 font-normal text-right">
                Attributed result
              </th>
              <th className="label py-2 pl-3 font-normal text-right">
                Encounters
              </th>
            </tr>
          </thead>
          <tbody>
            {matchups.map((row) => {
              const width = (Math.abs(row.score) / maximum) * 50;
              const left = row.score >= 0 ? 50 : 50 - width;
              return (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="py-3 pr-3">
                    <div className="font-semibold">{row.name}</div>
                    <div className="text-[11px] text-muted mt-0.5">
                      {resultLabel(row.score)}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="native-bar-track native-bar-track-centered min-w-40">
                      <span
                        className={`native-bar-fill ${row.score >= 0 ? "native-bar-fill-positive" : "native-bar-fill-negative"}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      />
                    </div>
                  </td>
                  <td
                    className="py-3 px-3 text-right mono font-bold"
                    style={{
                      color: row.score >= 0 ? "var(--gain)" : "var(--loss)",
                    }}
                    title={`Approximate 95% range: ${fmtWinRatePct(row.ciLow)} to ${fmtWinRatePct(row.ciHigh)}`}
                  >
                    {fmtWinRatePct(row.score)}
                  </td>
                  <td className="py-3 px-3 text-right mono">
                    {fmtBB(row.bb, 1)}
                  </td>
                  <td className="py-3 pl-3 text-right mono">
                    {row.encounters.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-md border border-line bg-panel2 px-4 py-3 mt-4 text-xs text-muted max-w-4xl">
        <span className="font-semibold text-ink">How to read this:</span>{" "}
        Matchup score is the strategy&apos;s attributed big-blind result per 100
        opponent-hand encounters, shown as a normalized percentage. In multiway
        pots, gains are shared among the opponent types that lost chips and
        losses among the types that won chips. This is a directional comparison
        inside this mixed simulated table, not a pure heads-up test.
      </div>
    </section>
  );
}
