import { ACTION_CLOCK_MS } from "@/lib/simulation/timing";

export function ActionClock({
  remainingMs,
  totalMs = ACTION_CLOCK_MS,
  label = "Action clock",
}: {
  remainingMs: number;
  totalMs?: number;
  label?: string;
}) {
  const bounded = Math.max(0, Math.min(totalMs, remainingMs));
  const percentage = totalMs > 0 ? (bounded / totalMs) * 100 : 0;
  const urgent = bounded <= 5_000;
  return (
    <div className="min-w-28" aria-label={`${label}: ${(bounded / 1_000).toFixed(1)} seconds remaining`}>
      <div className="flex items-center justify-between gap-2 text-[10px] mono mb-1">
        <span className="text-muted uppercase tracking-wide">{label}</span>
        <span className={urgent ? "text-loss font-bold" : "text-accent font-bold"}>
          {(bounded / 1_000).toFixed(1)}s
        </span>
      </div>
      <div className="h-1.5 rounded bg-panel2 overflow-hidden">
        <div
          className={`h-full rounded transition-[width] duration-100 ${urgent ? "bg-loss" : "bg-accent"}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
