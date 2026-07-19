"use client";
import { CardRow } from "./ui";
/** Evenly place 2–9 seats around the felt with the user pinned bottom-center. */
function seatSpot(index, count) {
  const angle = ((90 + (index * 360) / count) * Math.PI) / 180;
  const horizontalRadius = count > 6 ? 40 : 44;
  const verticalRadius = count > 6 ? 31 : 34;
  return {
    left: `${50 + Math.cos(angle) * horizontalRadius}%`,
    top: `${50 + Math.sin(angle) * verticalRadius}%`,
  };
}
export function PokerTable({
  seats,
  board,
  pot,
  street,
  fitViewport = false,
  animateCards = false,
  cardAnimationKey = "table",
}) {
  // Rotate so the user sits bottom-center.
  const userIdx = Math.max(
    0,
    seats.findIndex((s) => s.isUser),
  );
  const ordered = [...seats.slice(userIdx), ...seats.slice(0, userIdx)];
  const seatWidth =
    seats.length > 6
      ? "table-seat-wrap table-seat-wrap-dense"
      : "table-seat-wrap";
  return (
    <div
      className={`poker-table relative w-full rounded-[48%_48%_46%_46%] ${fitViewport ? "calibration-table" : ""}`}
      style={{ aspectRatio: "16 / 9" }}
    >
      {/* Board + pot */}
      <div className="table-board absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
        <div className="label">{street}</div>
        {board.length > 0 ? (
          <CardRow
            cards={board}
            size="lg"
            animated={animateCards}
            animationKey={`${cardAnimationKey}:board:${board.length}`}
          />
        ) : (
          <div className="text-xs text-muted italic">preflop</div>
        )}
        <div className="table-pot mono text-sm text-accent font-bold">
          <span aria-hidden="true" />
          pot {pot.toLocaleString()} chips
        </div>
      </div>

      {ordered.map((s, i) => (
        <div
          key={s.seat}
          className={`absolute -translate-x-1/2 -translate-y-1/2 ${seatWidth}`}
          style={seatSpot(i, ordered.length)}
        >
          <div
            className={`table-seat rounded-lg border px-1.5 py-1 sm:px-2.5 sm:py-1.5 text-center transition-all ${s.isActing ? "acting-seat" : "border-line"} ${s.folded ? "opacity-40" : ""}`}
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
              <span
                className={`table-seat-name text-xs font-semibold truncate ${s.isUser ? "text-accent" : ""}`}
              >
                {s.name}
              </span>
            </div>
            <div className="table-seat-stack mono text-[11px] text-muted">
              {s.stack.toLocaleString()} chips
            </div>
            <div className="table-seat-cards mt-1 flex justify-center min-h-[1.6rem]">
              {s.folded ? (
                <span className="text-[11px] text-muted italic">folded</span>
              ) : s.holeCards ? (
                <CardRow
                  cards={s.holeCards}
                  size={fitViewport && s.isUser ? "lg" : "sm"}
                  animated={animateCards && s.isUser}
                  animationKey={`${cardAnimationKey}:seat:${s.seat}`}
                />
              ) : (
                <span className="mono text-[13px] tracking-widest text-muted">
                  🂠🂠
                </span>
              )}
            </div>
            {s.lastAction && (
              <div className="table-seat-action text-[10px] text-info mt-0.5 truncate">
                {s.lastAction}
              </div>
            )}
          </div>
          {s.committed > 0 && (
            <div className="table-seat-committed mono text-center text-[11px] mt-1 text-accent">
              {s.committed.toLocaleString()} chips
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
