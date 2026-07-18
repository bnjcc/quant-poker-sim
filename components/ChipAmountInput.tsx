"use client";

import { useEffect, useState } from "react";

function clampWholeChips(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function ChipAmountInput({
  value,
  min,
  max,
  onChange,
  ariaLabel = "Bet size in chips",
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  const commit = (raw: string) => {
    const parsed = Number(raw);
    const next = Number.isFinite(parsed) ? clampWholeChips(parsed, min, max) : value;
    setDraft(String(next));
    onChange(next);
  };

  return (
    <label className="flex items-center gap-1.5">
      <span className="sr-only">{ariaLabel}</span>
      <input
        type="number"
        className="field w-24 py-1.5 mono"
        min={min}
        max={max}
        step={1}
        inputMode="numeric"
        value={draft}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          const parsed = Number(raw);
          if (raw !== "" && Number.isFinite(parsed) && parsed >= min && parsed <= max) {
            onChange(Math.round(parsed));
          }
        }}
        onBlur={(event) => commit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        aria-label={ariaLabel}
      />
      <span className="text-xs text-muted">chips</span>
    </label>
  );
}
