import { describe, expect, it } from "vitest";
import { buildHandActionLedger } from "@/lib/poker/action-ledger";
const hand = {
  handNumber: 1,
  buttonSeat: 0,
  players: [
    {
      seat: 0,
      playerId: "user",
      name: "You",
      startingStack: 100,
      position: "BTN",
    },
    {
      seat: 1,
      playerId: "p1",
      name: "Ada",
      startingStack: 100,
      position: "SB",
    },
    { seat: 2, playerId: "p2", name: "Lin", startingStack: 10, position: "BB" },
  ],
  holeCards: {},
  board: [],
  actions: [
    { seat: 1, type: "post-sb", amount: 1, street: "preflop", allIn: false },
    { seat: 2, type: "post-bb", amount: 2, street: "preflop", allIn: false },
    { seat: 0, type: "raise", amount: 6, street: "preflop", allIn: false },
    { seat: 1, type: "call", amount: 5, street: "preflop", allIn: false },
    { seat: 2, type: "all-in", amount: 8, street: "preflop", allIn: true },
    { seat: 0, type: "call", amount: 4, street: "preflop", allIn: false },
    { seat: 1, type: "fold", amount: 0, street: "preflop", allIn: false },
  ],
  potsAwarded: [],
  rakeTaken: 0,
  results: [],
  manualSeat: null,
  seedState: "ledger",
};
describe("hand action ledger", () => {
  it("shows every player action chronologically and reconstructs raise-to chip amounts", () => {
    const ledger = buildHandActionLedger(hand);
    expect(
      ledger.map((entry) => `${entry.playerName}: ${entry.label}`),
    ).toEqual([
      "Ada: posts small blind 1 chip",
      "Lin: posts big blind 2 chips",
      "You: raises to 6 chips",
      "Ada: calls 5 chips",
      "Lin: raises all-in to 10 chips",
      "You: calls 4 chips",
      "Ada: folds",
    ]);
    expect(ledger.map((entry) => entry.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
