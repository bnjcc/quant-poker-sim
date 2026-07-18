"use client";

import { Card } from "@/types/poker";
import { CardRow } from "./ui";

export interface SeatView {
  seat: number;
  name: string;
  stack: number;
  committed: number;
  folded: boolean;
  allIn: boolean;
  isButton: boolean;
  isActing: boolean;
  isUser: boolean;
  holeCards: Card[] | null; // null = hidden
  lastAction?: string;
}

/** Seat placement around the felt for up to 6 seats (user pinned bottom-center). */
const SPOTS = [
  { left: "50%", top: "84%" },
  { left: "12%", top: "68%" },
  { left: "12%", top: "28%" },
  { left: "50%", top: "16%" },
  { left: "88%", top: "28%" },
  { left: "88%", top: "68%" },
];

export function PokerTable({
  seats,
  board,
  pot,
  street,
  fitViewport = false,
}: {
  seats: SeatView[];
  board: Card[];
  pot: number;
  street: string;
  fitViewport?: boolean;
}) {
  // Rotate so the user sits bottom-center.
  const userIdx = Math.max(0, seats.findIndex((s) => s.isUser));
  const ordered = [...seats.slice(userIdx), ...seats.slice(0, userIdx)];

  return (
    <div
      className={`poker-table relative w-full rounded-[48%_48%_46%_46%] ${fitViewport ? "calibration-table" : ""}`}
      style={{ aspectRatio: "16 / 9" }}
    >
      {/* Board + pot */}
      <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
        <div className="label">{street}</div>
        {board.length > 0 ? (
          <CardRow cards={board} size="lg" />
        ) : (
          <div className="text-xs text-muted italic">preflop</div>
        )}
        <div className="table-pot mono text-sm text-accent font-bold"><span aria-hidden="true" />pot {pot.toLocaleString()}</div>
      </div>

      {ordered.map((s, i) => (
        <div
          key={s.seat}
          className="absolute -translate-x-1/2 -translate-y-1/2 w-[clamp(5.5rem,13vw,9rem)]"
          style={{ left: SPOTS[i]?.left ?? "50%", top: SPOTS[i]?.top ?? "50%" }}
        >
          <div
            className={`table-seat rounded-lg border px-1.5 py-1 sm:px-2.5 sm:py-1.5 text-center transition-all ${
              s.isActing ? "acting-seat" : "border-line"
            } ${s.folded ? "opacity-40" : ""}`}
            aria-current={s.isActing ? "true" : undefined}
          >
            <div className="flex items-center justify-center gap-1.5">
              {s.isButton && (
                <span
                  className="mono text-[10px] font-bold rounded-full px-1 border border-accent text-accent"
                  title="Dealer button"
                >
                  D
                </span>
              )}
              <span className={`text-xs font-semibold truncate ${s.isUser ? "text-accent" : ""}`}>{s.name}</span>
            </div>
            <div className="mono text-[11px] text-muted">{s.stack.toLocaleString()}</div>
            <div className="mt-1 flex justify-center min-h-[1.6rem]">
              {s.folded ? (
                <span className="text-[11px] text-muted italic">folded</span>
              ) : s.holeCards ? (
                <CardRow cards={s.holeCards} size="sm" />
              ) : (
                <span className="mono text-[13px] tracking-widest text-muted">🂠🂠</span>
              )}
            </div>
            {s.lastAction && <div className="text-[10px] text-info mt-0.5 truncate">{s.lastAction}</div>}
          </div>
          {s.committed > 0 && (
            <div className="mono text-center text-[11px] mt-1 text-accent">{s.committed.toLocaleString()}</div>
          )}
        </div>
      ))}
    </div>
  );
}
