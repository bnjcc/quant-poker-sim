"use client";

import { STARTING_HAND_GRID } from "@/lib/poker/range";

export function StartingHandGrid({
  selected,
  onToggle,
}: {
  selected: ReadonlySet<string>;
  onToggle: (notation: string) => void;
}) {
  return (
    <div>
      <div className="overflow-x-auto pb-2">
        <div
          className="grid gap-1 mx-auto"
          style={{ gridTemplateColumns: "repeat(13, 3.25rem)", width: "724px" }}
          role="group"
          aria-label="All 169 Texas Hold'em starting hands"
        >
          {STARTING_HAND_GRID.flat().map((hand) => {
            const active = selected.has(hand.notation);
            const kind = hand.kind === "pair" ? "pair" : hand.kind === "suited" ? "suited" : "offsuit";
            return (
              <button
                type="button"
                key={hand.notation}
                className={`range-cell ${active ? "range-cell-selected" : ""}`}
                aria-pressed={active}
                aria-label={`${hand.notation}, ${kind}, ${active ? "selected" : "not selected"}`}
                onClick={() => onToggle(hand.notation)}
              >
                {hand.notation}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-muted">
        <span>Diagonal: pairs</span>
        <span>Above diagonal: suited</span>
        <span>Below diagonal: offsuit</span>
      </div>
    </div>
  );
}
