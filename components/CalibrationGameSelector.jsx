"use client";
import { CALIBRATION_TABLE_SIZES } from "@/lib/simulation/defaults";
import { StakePresetButtons } from "./StakePresetButtons";

export function CalibrationGameSelector({ table, onChange }) {
  return (
    <div>
      <div className="font-semibold">Choose your calibration game</div>
      <div className="text-sm text-muted mt-1 mb-4">
        These stakes and the table size apply to every hand in this calibration.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <StakePresetButtons table={table} onChange={onChange} />
        <div>
          <div className="label mb-2">Players at table</div>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Players at calibration table"
          >
            {CALIBRATION_TABLE_SIZES.map((maxSeats) => (
              <button
                key={maxSeats}
                className={`btn ${table.maxSeats === maxSeats ? "btn-primary" : ""}`}
                type="button"
                aria-pressed={table.maxSeats === maxSeats}
                onClick={() => onChange({ ...table, maxSeats })}
              >
                {maxSeats === 6 ? "6 players (6-max)" : "9 players (full ring)"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 rounded-md border border-line bg-panel2 px-3 py-2 text-sm mono">
        Selected: {table.maxSeats}-player table · blinds {table.smallBlind}/
        {table.bigBlind} chips · {(100 * table.bigBlind).toLocaleString()}-chip
        buy-in
      </div>
    </div>
  );
}
