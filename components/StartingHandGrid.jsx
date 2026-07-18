"use client";
import { useEffect, useRef } from "react";
import { STARTING_HAND_GRID } from "@/lib/poker/range";
export function StartingHandGrid({ selected, onToggle, onSetSelected }) {
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const suppressClearTimerRef = useRef(null);
  useEffect(() => {
    const finishDrag = (event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (drag.didDrag) {
        suppressClickRef.current = true;
        if (suppressClearTimerRef.current !== null)
          window.clearTimeout(suppressClearTimerRef.current);
        suppressClearTimerRef.current = window.setTimeout(() => {
          suppressClickRef.current = false;
          suppressClearTimerRef.current = null;
        }, 0);
      }
      dragRef.current = null;
    };
    const cancelDrag = () => {
      dragRef.current = null;
      suppressClickRef.current = false;
    };
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", cancelDrag);
    window.addEventListener("blur", cancelDrag);
    return () => {
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", cancelDrag);
      window.removeEventListener("blur", cancelDrag);
      if (suppressClearTimerRef.current !== null)
        window.clearTimeout(suppressClearTimerRef.current);
    };
  }, []);
  const paintCell = (notation) => {
    const drag = dragRef.current;
    if (!drag || drag.visited.has(notation)) return;
    drag.visited.add(notation);
    onSetSelected(notation, drag.select);
  };
  return (
    <div>
      <div className="overflow-x-auto pb-2">
        <div
          className="grid gap-1 mx-auto select-none"
          style={{ gridTemplateColumns: "repeat(13, 3.25rem)", width: "724px" }}
          role="group"
          aria-label="All 169 Texas Hold'em starting hands"
        >
          {STARTING_HAND_GRID.flat().map((hand) => {
            const active = selected.has(hand.notation);
            const kind =
              hand.kind === "pair"
                ? "pair"
                : hand.kind === "suited"
                  ? "suited"
                  : "offsuit";
            return (
              <button
                type="button"
                key={hand.notation}
                className={`range-cell ${active ? "range-cell-selected" : ""}`}
                aria-pressed={active}
                aria-label={`${hand.notation}, ${kind}, ${active ? "selected" : "not selected"}`}
                onPointerDown={(event) => {
                  if (
                    event.pointerType !== "mouse" ||
                    event.button !== 0 ||
                    !event.isPrimary
                  )
                    return;
                  dragRef.current = {
                    pointerId: event.pointerId,
                    select: !active,
                    startNotation: hand.notation,
                    visited: new Set(),
                    didDrag: false,
                  };
                }}
                onPointerEnter={(event) => {
                  const drag = dragRef.current;
                  if (!drag || drag.pointerId !== event.pointerId) return;
                  if (
                    event.pointerType !== "mouse" ||
                    (event.buttons & 1) === 0
                  ) {
                    dragRef.current = null;
                    return;
                  }
                  drag.didDrag = true;
                  paintCell(drag.startNotation);
                  paintCell(hand.notation);
                }}
                onClick={() => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  onToggle(hand.notation);
                }}
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
