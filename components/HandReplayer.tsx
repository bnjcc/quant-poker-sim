"use client";

import { useMemo, useState } from "react";
import { HandHistory, Street } from "@/types/poker";
import { PokerTable, SeatView } from "./PokerTable";
import { fmtChips } from "./ui";

/** Reconstruct table state after the first `upto` actions of a hand history. */
function stateAt(h: HandHistory, upto: number) {
  const players = h.players.map((p) => ({
    seat: p.seat,
    name: p.name,
    stack: p.startingStack,
    committed: 0,
    total: 0,
    folded: false,
    allIn: false,
    lastAction: undefined as string | undefined,
  }));
  const bySeat = new Map(players.map((p) => [p.seat, p]));
  let street: Street = "preflop";
  let pot = 0;
  for (let i = 0; i < upto && i < h.actions.length; i++) {
    const a = h.actions[i];
    if (a.street !== street) {
      street = a.street;
      for (const p of players) p.committed = 0;
    }
    const p = bySeat.get(a.seat)!;
    if (a.type === "fold") p.folded = true;
    p.stack -= a.amount;
    p.committed += a.amount;
    p.total += a.amount;
    pot += a.amount;
    if (a.allIn) p.allIn = true;
    p.lastAction =
      a.type === "post-sb" || a.type === "post-bb"
        ? `posts ${a.amount}`
        : a.amount > 0
          ? `${a.type} ${a.amount}`
          : a.type;
  }
  // If we've replayed past the last action, show the final street.
  if (upto >= h.actions.length && h.actions.length > 0) {
    const boardStreet: Street = h.board.length >= 5 ? "river" : h.board.length === 4 ? "turn" : h.board.length === 3 ? "flop" : "preflop";
    street = boardStreet;
  }
  const boardCount = street === "preflop" ? 0 : street === "flop" ? 3 : street === "turn" ? 4 : 5;
  return { players, street, pot, board: h.board.slice(0, boardCount) };
}

export function HandReplayer({ hand, onClose }: { hand: HandHistory; onClose: () => void }) {
  const [step, setStep] = useState(hand.actions.length);
  const st = useMemo(() => stateAt(hand, step), [hand, step]);
  const done = step >= hand.actions.length;

  const seats: SeatView[] = st.players.map((p) => ({
    seat: p.seat,
    name: p.seat === hand.manualSeat ? `${p.name} (you)` : p.name,
    stack: p.stack,
    committed: p.committed,
    folded: p.folded,
    allIn: p.allIn,
    isButton: p.seat === hand.buttonSeat,
    isActing: !done && hand.actions[step]?.seat === p.seat,
    isUser: p.seat === hand.manualSeat,
    holeCards: done || p.seat === hand.manualSeat ? (hand.holeCards[p.seat] ?? null) : null,
    lastAction: p.lastAction,
  }));

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Hand ${hand.handNumber} replay`}>
      <div className="panel w-full max-w-3xl p-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="mono font-bold">Hand #{hand.handNumber}</span>
            <span className="text-xs text-muted ml-3">
              rake {hand.rakeTaken} · {hand.actions.length} actions
            </span>
          </div>
          <button className="btn text-xs px-2 py-1" onClick={onClose}>
            Close
          </button>
        </div>

        <PokerTable seats={seats} board={st.board} pot={st.pot} street={st.street} />

        <div className="flex items-center gap-2 mt-4">
          <button className="btn text-xs px-2 py-1" onClick={() => setStep(0)} disabled={step === 0}>
            ⏮ start
          </button>
          <button className="btn text-xs px-2 py-1" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            ◀ back
          </button>
          <button className="btn text-xs px-2 py-1" onClick={() => setStep((s) => Math.min(hand.actions.length, s + 1))} disabled={done}>
            forward ▶
          </button>
          <button className="btn text-xs px-2 py-1" onClick={() => setStep(hand.actions.length)} disabled={done}>
            end ⏭
          </button>
          <span className="mono text-xs text-muted ml-auto">
            action {step}/{hand.actions.length}
          </span>
        </div>

        {done && (
          <div className="mt-4 border-t border-line pt-3">
            <div className="label mb-2">Result</div>
            <div className="grid sm:grid-cols-2 gap-2">
              {hand.results
                .filter((r) => r.net !== 0 || r.showedDown)
                .map((r) => {
                  const player = hand.players.find((p) => p.seat === r.seat);
                  return (
                    <div key={r.seat} className="text-sm flex items-center gap-2">
                      <span className="w-32 truncate">{r.seat === hand.manualSeat ? "You" : player?.name}</span>
                      <span className="mono font-bold" style={{ color: r.net >= 0 ? "var(--gain)" : "var(--loss)" }}>
                        {fmtChips(r.net)}
                      </span>
                      {r.handRank && <span className="text-xs text-muted">{r.handRank.category}</span>}
                      {r.showedDown && <span className="text-[10px] text-info">showdown</span>}
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
