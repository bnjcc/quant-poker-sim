import { describe, expect, it } from "vitest";
import { HandEngine } from "@/lib/poker/engine";
import { cardsFromString } from "@/lib/poker/deck";
import { Rng } from "@/lib/poker/rng";
const config = {
  smallBlind: 1,
  bigBlind: 2,
  maxSeats: 6,
  rake: { percentage: 0, cap: 0, noFlopNoDrop: true },
};
function players(stacks) {
  return stacks.map((stack, i) => ({
    seat: i,
    playerId: `p${i}`,
    name: `P${i}`,
    stack,
  }));
}
/**
 * Build an injectable deck. The engine deals via pop() (from the end) two
 * cards per player starting left of the button, then burns and deals the board.
 */
function riggedDeck(holePerSeatInDealOrder, board) {
  const deck = [];
  const holes = holePerSeatInDealOrder.map((h) => cardsFromString(h));
  // First dealing round: card 1 to each player; second round: card 2.
  const dealSequence = [];
  for (let round = 0; round < 2; round++) {
    for (const h of holes) dealSequence.push(h[round]);
  }
  const boardCards = cardsFromString(board);
  const burn = cardsFromString("2c");
  // pop() takes from the end, so push in reverse order of dealing.
  const full = [
    ...dealSequence,
    burn[0],
    boardCards[0],
    boardCards[1],
    boardCards[2], // flop
    burn[0],
    boardCards[3], // turn
    burn[0],
    boardCards[4], // river
  ];
  for (let i = full.length - 1; i >= 0; i--) deck.push(full[i]);
  return deck;
}
describe("blinds and rotation", () => {
  it("posts SB left of button, BB next, and action starts UTG (3+ handed)", () => {
    const e = new HandEngine({
      players: players([100, 100, 100]),
      buttonSeat: 0,
      config,
      rng: new Rng(1),
      handNumber: 1,
    });
    const posts = e.actions.filter(
      (a) => a.type === "post-sb" || a.type === "post-bb",
    );
    expect(posts).toEqual([
      expect.objectContaining({ seat: 1, type: "post-sb", amount: 1 }),
      expect.objectContaining({ seat: 2, type: "post-bb", amount: 2 }),
    ]);
    expect(e.currentSeat).toBe(0); // UTG == button in 3-handed
  });
  it("heads-up: button posts SB and acts first preflop", () => {
    const e = new HandEngine({
      players: players([100, 100]),
      buttonSeat: 0,
      config,
      rng: new Rng(1),
      handNumber: 1,
    });
    const sb = e.actions.find((a) => a.type === "post-sb");
    expect(sb?.seat).toBe(0);
    expect(e.currentSeat).toBe(0);
  });
  it("assigns full-ring positions and starts action UTG at a nine-player table", () => {
    const fullRingConfig = { ...config, maxSeats: 9 };
    const e = new HandEngine({
      players: players(Array(9).fill(200)),
      buttonSeat: 0,
      config: fullRingConfig,
      rng: new Rng("nine-player-positions"),
      handNumber: 1,
    });
    expect(e.players.map((player) => e.positionOf(player.seat))).toEqual([
      "BTN",
      "SB",
      "BB",
      "UTG",
      "UTG+1",
      "MP",
      "LJ",
      "HJ",
      "CO",
    ]);
    expect(e.currentSeat).toBe(3);
    expect(e.actions.slice(0, 2)).toEqual([
      expect.objectContaining({ seat: 1, type: "post-sb", amount: 1 }),
      expect.objectContaining({ seat: 2, type: "post-bb", amount: 2 }),
    ]);
  });
});
describe("legal actions and min-raise", () => {
  it("enforces minimum raise size", () => {
    const e = new HandEngine({
      players: players([200, 200, 200]),
      buttonSeat: 0,
      config,
      rng: new Rng(1),
      handNumber: 1,
    });
    // UTG raises to 6 (increment 4). Next min raise-to is 10.
    e.applyAction(0, { type: "raise", toAmount: 6 });
    const legal = e.getLegalActions(1);
    expect(legal.minRaiseTo).toBe(10);
    expect(() => e.applyAction(1, { type: "raise", toAmount: 8 })).toThrow();
    e.applyAction(1, { type: "raise", toAmount: 10 });
  });
  it("big blind can check their option", () => {
    const e = new HandEngine({
      players: players([100, 100, 100]),
      buttonSeat: 0,
      config,
      rng: new Rng(1),
      handNumber: 1,
    });
    e.applyAction(0, { type: "call" });
    e.applyAction(1, { type: "call" });
    const legal = e.getLegalActions(2);
    expect(legal.types).toContain("check");
    e.applyAction(2, { type: "check" });
    expect(e.street).toBe("flop");
  });
  it("all-in below min-raise does not grant an illegal re-raise threshold", () => {
    // Seat 0 has only 7 chips: raise to 6, then shove scenarios stay legal.
    const e = new HandEngine({
      players: players([200, 7, 200]),
      buttonSeat: 0,
      config,
      rng: new Rng(1),
      handNumber: 1,
    });
    e.applyAction(0, { type: "raise", toAmount: 6 });
    e.applyAction(1, { type: "raise", toAmount: 7 }); // all-in for less than a full raise
    const p1 = e.players.find((p) => p.seat === 1);
    expect(p1.allIn).toBe(true);
    const legal = e.getLegalActions(2);
    // Full-raise increment stays 4: min raise-to remains 6+4=10... current bet is 7, but
    // the short all-in didn't reopen with a new increment, so min raise-to = 7 + 4 = 11.
    expect(legal.minRaiseTo).toBe(11);
    e.applyAction(2, { type: "call" });
    // Seat 0 already made the last full raise. The extra chip must be answered,
    // but the short all-in does not reopen seat 0's raise option.
    expect(e.currentSeat).toBe(0);
    expect(e.getLegalActions(0).types).toEqual(["fold", "call"]);
  });
});
describe("side pots and split pots", () => {
  it("builds correct side pots for a three-way all-in with unequal stacks", () => {
    const pots = HandEngine.buildPots([
      { seat: 0, totalCommitted: 100, folded: false },
      { seat: 1, totalCommitted: 50, folded: false },
      { seat: 2, totalCommitted: 100, folded: false },
      { seat: 3, totalCommitted: 20, folded: true },
    ]);
    // Main pot: 50*3 + 20 = 170 (all three live); side: 50*2 = 100 (seats 0,2).
    expect(pots).toHaveLength(2);
    expect(pots[0]).toEqual({ amount: 170, eligibleSeats: [0, 1, 2] });
    expect(pots[1]).toEqual({ amount: 100, eligibleSeats: [0, 2] });
  });
  it("short stack wins only the main pot; side pot goes to the covering winner", () => {
    // Deal order from button seat 0: seat 1 first. Seats: 0=AA, 1=KK, 2=QQ.
    // Board gives no help: K on board so KK makes a set? Choose board 2h5d9c 3s 7h.
    // Winner overall: AA(seat0) > KK(seat1) > QQ(seat2). Make seat 2 the short stack instead:
    const deck = riggedDeck(["KhKd", "QhQd", "AhAd"], "2h5d9c3s7h"); // deal order: seat1, seat2, seat0
    const e = new HandEngine({
      players: players([200, 200, 50]),
      buttonSeat: 0,
      config,
      rng: new Rng(1),
      handNumber: 1,
      deck,
    });
    // seat0=AhAd, seat1=KhKd, seat2=QhQd (short).
    e.applyAction(0, { type: "raise", toAmount: 200 }); // shove
    e.applyAction(1, { type: "call" }); // 200
    e.applyAction(2, { type: "call" }); // 50 all-in
    const h = e.getHistory();
    const r0 = h.results.find((r) => r.seat === 0);
    // Main pot 150, side pot 300, AA wins both: net = 450 - 200 = +250.
    expect(r0.net).toBe(250);
    expect(h.results.find((r) => r.seat === 2).net).toBe(-50);
    expect(h.results.find((r) => r.seat === 1).net).toBe(-200);
  });
  it("splits a pot evenly on identical hands, odd chip left of button", () => {
    // Both players play the board straight flush.
    const deck = riggedDeck(["2s3d", "4c6c"], "AhKhQhJhTh"); // heads-up: deal order seat1, seat0? btn=0 HU: SB=0 deals first to... nextSeatAfter(button)=1
    const e = new HandEngine({
      players: players([100, 100]),
      buttonSeat: 0,
      config,
      rng: new Rng(1),
      handNumber: 1,
      deck,
    });
    e.applyAction(0, { type: "call" });
    e.applyAction(1, { type: "check" });
    for (const street of ["flop", "turn", "river"]) {
      void street;
      e.applyAction(1, { type: "check" });
      e.applyAction(0, { type: "check" });
    }
    const h = e.getHistory();
    expect(h.results.every((r) => r.net === 0)).toBe(true);
    expect(h.results.every((r) => r.showedDown)).toBe(true);
  });
});
describe("fold-out and rake", () => {
  it("awards the pot uncontested and takes no rake preflop with no-flop-no-drop", () => {
    const e = new HandEngine({
      players: players([100, 100, 100]),
      buttonSeat: 0,
      config: {
        ...config,
        rake: { percentage: 0.05, cap: 5, noFlopNoDrop: true },
      },
      rng: new Rng(2),
      handNumber: 1,
    });
    e.applyAction(0, { type: "raise", toAmount: 6 });
    e.applyAction(1, { type: "fold" });
    e.applyAction(2, { type: "fold" });
    const h = e.getHistory();
    expect(h.rakeTaken).toBe(0);
    expect(h.results.find((r) => r.seat === 0).net).toBe(3); // wins SB+BB
  });
  it("takes capped rake on a raked flop pot", () => {
    const rakeCfg = {
      ...config,
      rake: { percentage: 0.05, cap: 3, noFlopNoDrop: true },
    };
    const e = new HandEngine({
      players: players([500, 500]),
      buttonSeat: 0,
      config: rakeCfg,
      rng: new Rng(3),
      handNumber: 1,
    });
    e.applyAction(0, { type: "raise", toAmount: 100 });
    e.applyAction(1, { type: "call" });
    // Pot 200 on flop; check it down.
    while (!e.complete) {
      const seat = e.currentSeat;
      e.applyAction(seat, { type: "check" });
    }
    const h = e.getHistory();
    expect(h.rakeTaken).toBe(3); // 5% of 200 = 10, capped at 3
    const totalNet = h.results.reduce((s, r) => s + r.net, 0);
    expect(totalNet).toBe(-3); // chips conserved minus rake
  });
});
describe("chip conservation", () => {
  it("total chips are conserved (minus rake) across many random hands", () => {
    const rng = new Rng("conservation");
    for (let trial = 0; trial < 50; trial++) {
      const stacks = [80, 120, 200, 45, 300, 100];
      const e = new HandEngine({
        players: players(stacks),
        buttonSeat: trial % 6,
        config,
        rng,
        handNumber: trial,
      });
      let guard = 0;
      while (!e.complete && guard++ < 200) {
        const seat = e.currentSeat;
        const legal = e.getLegalActions(seat);
        const pick = legal.types[rng.int(legal.types.length)];
        if (pick === "bet")
          e.applyAction(seat, {
            type: "bet",
            toAmount: Math.min(legal.minBet + rng.int(20), legal.maxBetTo),
          });
        else if (pick === "raise")
          e.applyAction(seat, {
            type: "raise",
            toAmount: Math.min(legal.minRaiseTo + rng.int(30), legal.maxBetTo),
          });
        else e.applyAction(seat, { type: pick });
      }
      expect(e.complete).toBe(true);
      const h = e.getHistory();
      const before = stacks.reduce((a, b) => a + b, 0);
      const after = e.players.reduce((s, p) => s + p.stack, 0);
      expect(after).toBe(before - h.rakeTaken);
    }
  });
});
