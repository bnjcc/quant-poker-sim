import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PokerTable } from "@/components/PokerTable";
import { visibleHoleCardsForSeat } from "@/lib/poker/action-display";

const seats = [
  {
    seat: 0,
    name: "Hero",
    stack: 300,
    isUser: true,
    isButton: true,
    isActing: true,
    folded: false,
    committed: 3,
    holeCards: [
      { rank: 12, suit: "h" },
      { rank: 11, suit: "c" },
    ],
  },
  {
    seat: 1,
    name: "Villain",
    stack: 297,
    isUser: false,
    isButton: false,
    isActing: false,
    folded: false,
    committed: 3,
    lastAction: "call 3 chips",
    holeCards: [
      { rank: 14, suit: "s" },
      { rank: 13, suit: "d" },
    ],
  },
];

function renderTable(
  fitViewport,
  { opponentCards = seats[1].holeCards, animateCards = false } = {},
) {
  const visibleSeats = seats.map((seat) =>
    seat.isUser ? seat : { ...seat, holeCards: opponentCards },
  );
  return renderToStaticMarkup(
    React.createElement(PokerTable, {
      seats: visibleSeats,
      board: [],
      pot: 6,
      street: "preflop",
      fitViewport,
      animateCards,
    }),
  );
}

describe("PokerTable calibration seats", () => {
  it("uses accessible compact ovals for calibration opponents", () => {
    const html = renderTable(true, { opponentCards: null });

    expect(html).toContain("table-seat-opponent");
    expect(html).toContain(
      'aria-label="Villain, 297 chips, call 3 chips, 3 chips committed"',
    );
    expect(html).toContain('aria-label="Qh"');
    expect(html).toContain('aria-label="Jc"');
    expect(html).not.toContain('aria-label="As"');
    expect(html).not.toContain('aria-label="Kd"');
  });

  it("flips compact opponent cards when showdown makes them visible", () => {
    const html = renderTable(true, { animateCards: true });

    expect(html).toContain("table-seat-opponent");
    expect(html).toContain("table-seat-opponent-cards");
    expect(html).toContain('aria-label="As"');
    expect(html).toContain('aria-label="Kd"');
    expect(html).toContain("card-turn-in");
  });

  it("keeps full opponent cards outside calibration", () => {
    const html = renderTable(false);

    expect(html).not.toContain("table-seat-opponent");
    expect(html).toContain('aria-label="As"');
    expect(html).toContain('aria-label="Kd"');
  });
});

describe("calibration showdown card visibility", () => {
  it("always shows the user's cards", () => {
    expect(visibleHoleCardsForSeat(seats[0], 0, [])).toEqual(
      seats[0].holeCards,
    );
  });

  it("shows an opponent only when that seat reached showdown", () => {
    expect(visibleHoleCardsForSeat(seats[1], 0, [])).toBeNull();
    expect(
      visibleHoleCardsForSeat(seats[1], 0, [
        { seat: 1, showedDown: false, holeCards: seats[1].holeCards },
      ]),
    ).toBeNull();
    expect(
      visibleHoleCardsForSeat(seats[1], 0, [
        { seat: 1, showedDown: true, holeCards: seats[1].holeCards },
      ]),
    ).toEqual(seats[1].holeCards);
  });
});
