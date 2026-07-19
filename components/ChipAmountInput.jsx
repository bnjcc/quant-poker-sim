"use client";
import { useEffect, useState } from "react";
function clampWholeChips(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(value)));
}
export function stepChipAmount(value, delta, min, max) {
  return clampWholeChips(Number(value) + delta, min, max);
}
export function ChipAmountInput({
  value,
  min,
  max,
  step = 1,
  onChange,
  ariaLabel = "Bet size in chips",
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (raw) => {
    const parsed = Number(raw);
    const next = Number.isFinite(parsed)
      ? clampWholeChips(parsed, min, max)
      : value;
    setDraft(String(next));
    onChange(next);
  };
  const chipStep = Math.max(1, Math.round(step));
  const stepBy = (direction) => {
    const next = stepChipAmount(value, direction * chipStep, min, max);
    setDraft(String(next));
    onChange(next);
  };
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className="btn px-3 py-1.5 mono text-base"
        onClick={() => stepBy(-1)}
        disabled={value <= min}
        aria-label={`Decrease bet by ${chipStep} ${chipStep === 1 ? "chip" : "chips"}`}
        title={`Decrease by ${chipStep} ${chipStep === 1 ? "chip" : "chips"}`}
      >
        −
      </button>
      <input
        type="number"
        className="field w-24 py-1.5 mono"
        min={min}
        max={max}
        step={chipStep}
        inputMode="numeric"
        value={draft}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          const parsed = Number(raw);
          if (
            raw !== "" &&
            Number.isFinite(parsed) &&
            parsed >= min &&
            parsed <= max
          ) {
            onChange(Math.round(parsed));
          }
        }}
        onBlur={(event) => commit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        className="btn px-3 py-1.5 mono text-base"
        onClick={() => stepBy(1)}
        disabled={value >= max}
        aria-label={`Increase bet by ${chipStep} ${chipStep === 1 ? "chip" : "chips"}`}
        title={`Increase by ${chipStep} ${chipStep === 1 ? "chip" : "chips"}`}
      >
        +
      </button>
      <span className="text-xs text-muted">chips</span>
    </div>
  );
}
