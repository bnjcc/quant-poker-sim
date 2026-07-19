import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PokerTable } from "@/components/PokerTable";

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

function renderTable(fitViewport) {
  return renderToStaticMarkup(
    React.createElement(PokerTable, {
      seats,
      board: [],
      pot: 6,
      street: "preflop",
      fitViewport,
    }),
  );
}

describe("PokerTable calibration seats", () => {
  it("uses accessible compact ovals for calibration opponents", () => {
    const html = renderTable(true);

    expect(html).toContain("table-seat-opponent");
    expect(html).toContain(
      'aria-label="Villain, 297 chips, call 3 chips, 3 chips committed"',
    );
    expect(html).toContain('aria-label="Qh"');
    expect(html).toContain('aria-label="Jc"');
    expect(html).not.toContain('aria-label="As"');
    expect(html).not.toContain('aria-label="Kd"');
  });

  it("keeps full opponent cards outside calibration", () => {
    const html = renderTable(false);

    expect(html).not.toContain("table-seat-opponent");
    expect(html).toContain('aria-label="As"');
    expect(html).toContain('aria-label="Kd"');
  });
});
