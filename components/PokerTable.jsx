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

/** Phone layouts keep seats in an outer lane so the board stays unobstructed. */
function mobileSeatSpot(index, count) {
  const layouts = {
    2: [
      [50, 86],
      [50, 14],
    ],
    3: [
      [50, 86],
      [17, 22],
      [83, 22],
    ],
    4: [
      [50, 86],
      [15, 56],
      [50, 13],
      [85, 56],
    ],
    5: [
      [50, 86],
      [15, 71],
      [18, 20],
      [82, 20],
      [85, 71],
    ],
    6: [
      [50, 86],
      [15, 71],
      [17, 20],
      [50, 12],
      [83, 20],
      [85, 71],
    ],
    7: [
      [50, 86],
      [14, 71],
      [15, 24],
      [37, 11],
      [63, 11],
      [85, 24],
      [86, 71],
    ],
    8: [
      [50, 86],
      [14, 72],
      [14, 39],
      [28, 13],
      [50, 10],
      [72, 13],
      [86, 39],
      [86, 72],
    ],
    9: [
      [50, 86],
      [14, 72],
      [14, 43],
      [17, 19],
      [39, 10],
      [61, 10],
      [83, 19],
      [86, 43],
      [86, 72],
    ],
  };
  const [left, top] = layouts[count]?.[index] ?? [50, 50];
  return { left: `${left}%`, top: `${top}%` };
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

      {ordered.map((s, i) => {
        const desktopSpot = seatSpot(i, ordered.length);
        const phoneSpot = mobileSeatSpot(i, ordered.length);
        const opponentAction = s.isActing
          ? "thinking…"
          : s.folded
            ? "folded"
            : s.lastAction;
        const seatLabel = `${s.name}, ${s.stack.toLocaleString()} chips${opponentAction ? `, ${opponentAction}` : ""}${s.committed > 0 ? `, ${s.committed.toLocaleString()} chips committed` : ""}`;
        const compactOpponent = fitViewport && !s.isUser;
        const seatWidth = compactOpponent
          ? `table-seat-wrap table-seat-wrap-opponent${ordered.length > 6 ? " table-seat-wrap-dense" : ""}`
          : ordered.length > 6
            ? "table-seat-wrap table-seat-wrap-dense"
            : "table-seat-wrap";
        return (
          <div
            key={s.seat}
            className={`table-seat-position absolute -translate-x-1/2 -translate-y-1/2 ${seatWidth}`}
            style={{
              "--seat-left": desktopSpot.left,
              "--seat-top": desktopSpot.top,
              "--phone-seat-left": phoneSpot.left,
              "--phone-seat-top": phoneSpot.top,
            }}
          >
            <div
              className={`table-seat border text-center transition-all ${compactOpponent ? "table-seat-opponent rounded-full px-2 py-1" : "rounded-lg px-1.5 py-1 sm:px-2.5 sm:py-1.5"} ${s.isActing ? "acting-seat" : "border-line"} ${s.folded ? "opacity-40" : ""}`}
              role="group"
              aria-current={s.isActing ? "true" : undefined}
              aria-label={seatLabel}
              title={seatLabel}
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
              {!compactOpponent ? (
                <>
                  <div className="table-seat-stack mono text-[11px] text-muted">
                    {s.stack.toLocaleString()}
                    <span className="table-seat-stack-unit"> chips</span>
                  </div>
                  <div className="table-seat-cards mt-1 flex justify-center min-h-[1.6rem]">
                    {s.folded ? (
                      <span className="text-[11px] text-muted italic">
                        folded
                      </span>
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
                </>
              ) : (
                <div className="table-seat-opponent-meta mono truncate text-[9px] leading-tight text-muted sm:text-[10px]">
                  <span>{s.stack.toLocaleString()}</span>
                  {opponentAction && (
                    <span className="text-info"> · {opponentAction}</span>
                  )}
                </div>
              )}
            </div>
            {s.committed > 0 && (
              <div className="table-seat-committed mono text-center text-[11px] mt-1 text-accent">
                {s.committed.toLocaleString()}
                <span className="table-seat-committed-unit"> chips</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
