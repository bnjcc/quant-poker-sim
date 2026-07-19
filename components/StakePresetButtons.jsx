"use client";
import { TABLE_STAKES } from "@/lib/simulation/defaults";

export function StakePresetButtons({ table, onChange }) {
  return (
    <div>
      <div className="label mb-2">Game stakes</div>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Game stakes"
      >
        {TABLE_STAKES.map((stakes) => {
          const selected =
            table.smallBlind === stakes.smallBlind &&
            table.bigBlind === stakes.bigBlind;
          return (
            <button
              key={stakes.label}
              className={`btn ${selected ? "btn-primary" : ""}`}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                onChange({
                  ...table,
                  smallBlind: stakes.smallBlind,
                  bigBlind: stakes.bigBlind,
                })
              }
            >
              {stakes.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
