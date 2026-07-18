"use client";
import { AGENT_PRESETS } from "@/lib/agents/profiles";
import { PageHeader, fmtPct } from "@/components/ui";
import { AnalyticsGlossary } from "@/components/AnalyticsGlossary";
function Bar({ label, value, max = 1 }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 text-muted">{label}</span>
      <div className="h-1.5 flex-1 rounded bg-panel2 overflow-hidden">
        <div
          className="h-full rounded bg-info"
          style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
        />
      </div>
      <span className="mono w-10 text-right">
        {max === 1 ? fmtPct(value) : value.toFixed(1)}
      </span>
    </div>
  );
}
export default function OpponentsPage() {
  return (
    <div>
      <PageHeader
        title="Opponent profiles"
        sub="Thirteen behavioral archetypes. Each is a parameter vector — looseness, aggression, sizing, skill, positional awareness — with per-player randomization so no two instances play identically. Pool-level multipliers in the experiment config shift the whole table."
      />
      <AnalyticsGlossary
        groups={["poker"]}
        title="New to opponent statistics?"
      />
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {AGENT_PRESETS.map((p) => (
          <div key={p.id} className="panel px-5 py-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">{p.name}</h2>
              <span className="mono text-[10px] text-muted">{p.id}</span>
            </div>
            <p className="text-xs text-muted mt-1 mb-3 min-h-[2.2rem]">
              {p.description}
            </p>
            <div className="space-y-1.5">
              <Bar label="VPIP" value={p.vpip} />
              <Bar label="PFR" value={p.pfr} />
              <Bar label="3-bet" value={p.threeBet} max={0.2} />
              <Bar label="Aggression" value={p.aggression} />
              <Bar label="C-bet" value={p.cbet} />
              <Bar label="Bluff" value={p.bluff} />
              <Bar label="Calls wide" value={p.callPadding} max={0.4} />
              <Bar label="Skill" value={p.skill} />
            </div>
            <div className="mono text-[11px] text-muted mt-3">
              sizes ~{Math.round(p.betSizeMean * 100)}% pot ±
              {Math.round(p.betSizeStd * 100)} · buy-in {p.buyInBB}bb
              {p.adaptive ? " · adapts to your fold rate" : ""}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted mt-6 max-w-3xl">
        Honest caveat: these are heuristic policies, not learned models of real
        populations. They produce plausible aggregate statistics (VPIP/PFR/AF in
        realistic ranges) but simpler postflop play than strong humans.
      </p>
    </div>
  );
}
