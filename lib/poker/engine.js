import { POSITIONS_BY_COUNT } from "@/types/poker";
import { createDeck, shuffle } from "./deck";
import { evaluate7 } from "./evaluator";
/**
 * Deterministic single-hand engine for No-Limit Hold'em.
 * Pure game rules: no agent logic, no persistence, no UI concerns.
 */
export class HandEngine {
  config;
  handNumber;
  buttonSeat;
  players;
  board = [];
  actions = [];
  street = "preflop";
  complete = false;
  deck;
  currentBet = 0;
  lastRaiseIncrement = 0;
  actingSeat = -1;
  /** Seats that still need to act this street. */
  pendingSeats = [];
  /** Seats whose raise option is still open on the current betting round. */
  raiseAllowedSeats = new Set();
  startingStacks = new Map();
  manualSeat;
  forcedHoleCards = new Map();
  seedState;
  history = null;
  constructor(opts) {
    if (opts.players.length < 2) throw new Error("Need at least 2 players");
    this.config = opts.config;
    this.handNumber = opts.handNumber;
    this.buttonSeat = opts.buttonSeat;
    this.manualSeat = opts.manualSeat ?? null;
    this.seedState = opts.rng.getState();
    this.deck = opts.deck ? opts.deck.slice() : shuffle(createDeck(), opts.rng);
    this.players = opts.players
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        seat: p.seat,
        playerId: p.playerId,
        name: p.name,
        stack: p.stack,
        holeCards: null,
        folded: false,
        allIn: false,
        streetCommitted: 0,
        totalCommitted: 0,
        sittingOut: false,
      }));
    for (const p of this.players) this.startingStacks.set(p.seat, p.stack);
    for (const [seatText, cards] of Object.entries(
      opts.forcedHoleCards ?? {},
    )) {
      const seat = Number(seatText);
      if (!this.players.some((player) => player.seat === seat))
        throw new Error(`Cannot force cards for missing seat ${seat}`);
      if (cards.length !== 2)
        throw new Error(
          `Forced hole cards for seat ${seat} must contain exactly two cards`,
        );
      for (const card of cards) {
        const deckIndex = this.deck.findIndex(
          (candidate) =>
            candidate.rank === card.rank && candidate.suit === card.suit,
        );
        if (deckIndex < 0)
          throw new Error(`Forced card is duplicated or missing from the deck`);
        this.deck.splice(deckIndex, 1);
      }
      this.forcedHoleCards.set(seat, cards.slice());
    }
    this.postBlindsAndDeal();
  }
  // ---------- setup ----------
  seatOrder(fromSeat) {
    const seats = this.players.map((p) => p.seat).sort((a, b) => a - b);
    const idx = seats.indexOf(fromSeat);
    return [...seats.slice(idx), ...seats.slice(0, idx)];
  }
  nextSeatAfter(seat) {
    const order = this.seatOrder(seat);
    return order[1 % order.length];
  }
  player(seat) {
    const p = this.players.find((x) => x.seat === seat);
    if (!p) throw new Error(`No player at seat ${seat}`);
    return p;
  }
  positionOf(seat) {
    const n = this.players.length;
    const order = this.seatOrder(this.buttonSeat);
    const labels = POSITIONS_BY_COUNT[n];
    const position = labels?.[order.indexOf(seat)];
    if (!position)
      throw new Error(
        `Unsupported table size or seat: ${n} players, seat ${seat}`,
      );
    return position;
  }
  postBlindsAndDeal() {
    const n = this.players.length;
    const order = this.seatOrder(this.buttonSeat);
    const sbSeat = n === 2 ? this.buttonSeat : order[1];
    const bbSeat = n === 2 ? order[1] : order[2];
    this.forcePost(sbSeat, this.config.smallBlind, "post-sb");
    this.forcePost(bbSeat, this.config.bigBlind, "post-bb");
    this.currentBet = this.config.bigBlind;
    this.lastRaiseIncrement = this.config.bigBlind;
    // Deal two cards each, starting left of the button.
    for (let round = 0; round < 2; round++) {
      for (const seat of this.seatOrder(this.nextSeatAfter(this.buttonSeat))) {
        const p = this.player(seat);
        if (!p.holeCards) p.holeCards = [];
        p.holeCards.push(
          this.forcedHoleCards.get(seat)?.[round] ?? this.deck.pop(),
        );
      }
    }
    // Preflop action starts left of BB (or button/SB in heads-up).
    const firstToAct = n === 2 ? sbSeat : this.nextSeatAfter(bbSeat);
    this.pendingSeats = this.seatOrder(firstToAct).filter((s) =>
      this.canAct(s),
    );
    this.raiseAllowedSeats = new Set(this.pendingSeats);
    this.advanceActor();
  }
  forcePost(seat, amount, type) {
    const p = this.player(seat);
    const posted = Math.min(amount, p.stack);
    p.stack -= posted;
    p.streetCommitted += posted;
    p.totalCommitted += posted;
    if (p.stack === 0) p.allIn = true;
    this.actions.push({
      seat,
      type,
      amount: posted,
      street: "preflop",
      allIn: p.allIn,
    });
  }
  canAct(seat) {
    const p = this.player(seat);
    return !p.folded && !p.allIn;
  }
  // ---------- public API ----------
  get currentSeat() {
    return this.complete ? null : this.actingSeat;
  }
  get potSize() {
    return this.players.reduce((sum, p) => sum + p.totalCommitted, 0);
  }
  get activePlayers() {
    return this.players.filter((p) => !p.folded);
  }
  getLegalActions(seat) {
    if (this.complete || seat !== this.actingSeat) {
      return {
        types: [],
        callAmount: 0,
        minBet: 0,
        minRaiseTo: 0,
        maxBetTo: 0,
      };
    }
    const p = this.player(seat);
    const toCall = this.currentBet - p.streetCommitted;
    const maxTo = p.streetCommitted + p.stack;
    const types = [];
    if (toCall > 0) {
      types.push("fold", "call");
      const minRaiseTo = this.currentBet + this.lastRaiseIncrement;
      if (maxTo > this.currentBet && this.raiseAllowedSeats.has(seat))
        types.push("raise");
      return {
        types,
        callAmount: Math.min(toCall, p.stack),
        minBet: 0,
        minRaiseTo: Math.min(minRaiseTo, maxTo),
        maxBetTo: maxTo,
      };
    }
    types.push("check");
    if (p.stack > 0) types.push("bet");
    return {
      types,
      callAmount: 0,
      minBet: Math.min(this.config.bigBlind, maxTo),
      minRaiseTo: 0,
      maxBetTo: maxTo,
    };
  }
  applyAction(seat, action, timing) {
    if (this.complete) throw new Error("Hand is complete");
    if (seat !== this.actingSeat) throw new Error(`Not seat ${seat}'s turn`);
    const legal = this.getLegalActions(seat);
    if (!legal.types.includes(action.type)) {
      throw new Error(`Illegal action ${action.type} for seat ${seat}`);
    }
    const p = this.player(seat);
    switch (action.type) {
      case "fold": {
        this.raiseAllowedSeats.delete(seat);
        p.folded = true;
        this.record(seat, "fold", 0, false, timing);
        break;
      }
      case "check": {
        this.raiseAllowedSeats.delete(seat);
        this.record(seat, "check", 0, false, timing);
        break;
      }
      case "call": {
        this.raiseAllowedSeats.delete(seat);
        const amount = Math.min(this.currentBet - p.streetCommitted, p.stack);
        this.commit(p, amount);
        this.record(seat, p.allIn ? "all-in" : "call", amount, p.allIn, timing);
        break;
      }
      case "bet":
      case "raise": {
        let to = action.toAmount ?? 0;
        to = Math.min(to, p.streetCommitted + p.stack);
        const isAllIn = to === p.streetCommitted + p.stack;
        if (action.type === "bet") {
          if (to < legal.minBet && !isAllIn)
            throw new Error(`Bet ${to} below minimum ${legal.minBet}`);
        } else {
          if (to <= this.currentBet)
            throw new Error(
              `Raise to ${to} not above current bet ${this.currentBet}`,
            );
          if (to < legal.minRaiseTo && !isAllIn)
            throw new Error(`Raise to ${to} below minimum ${legal.minRaiseTo}`);
        }
        this.raiseAllowedSeats.delete(seat);
        const increment = to - this.currentBet;
        const fullRaise = increment >= this.lastRaiseIncrement;
        const amount = to - p.streetCommitted;
        this.commit(p, amount);
        if (to > this.currentBet) {
          if (fullRaise || action.type === "bet") {
            this.lastRaiseIncrement = action.type === "bet" ? to : increment;
            // A full bet or raise reopens raising for every other live player.
            this.raiseAllowedSeats = new Set(
              this.players
                .filter(
                  (player) => player.seat !== seat && this.canAct(player.seat),
                )
                .map((player) => player.seat),
            );
          }
          this.currentBet = to;
          // Even a short all-in makes earlier callers respond to the extra
          // chips, but it does not restore their raise option.
          this.pendingSeats = this.seatOrder(this.nextSeatAfter(seat)).filter(
            (s) => s !== seat && this.canAct(s),
          );
        }
        this.record(
          seat,
          p.allIn ? "all-in" : action.type,
          amount,
          p.allIn,
          timing,
        );
        break;
      }
    }
    this.removePending(seat);
    this.afterAction();
  }
  commit(p, amount) {
    const real = Math.min(amount, p.stack);
    p.stack -= real;
    p.streetCommitted += real;
    p.totalCommitted += real;
    if (p.stack === 0) p.allIn = true;
  }
  record(seat, type, amount, allIn, timing) {
    this.actions.push({
      seat,
      type,
      amount,
      street: this.street,
      allIn,
      ...(timing
        ? {
            decisionTimeMs: Math.max(0, Math.round(timing.decisionTimeMs)),
            timedOut: Boolean(timing.timedOut),
          }
        : {}),
    });
  }
  removePending(seat) {
    this.pendingSeats = this.pendingSeats.filter(
      (s) => s !== seat && this.canAct(s),
    );
  }
  afterAction() {
    const live = this.activePlayers;
    if (live.length === 1) {
      this.settle();
      return;
    }
    if (this.pendingSeats.length === 0) {
      this.nextStreet();
      return;
    }
    this.advanceActor();
  }
  advanceActor() {
    this.pendingSeats = this.pendingSeats.filter((s) => this.canAct(s));
    if (this.pendingSeats.length === 0) {
      this.nextStreet();
      return;
    }
    this.actingSeat = this.pendingSeats[0];
  }
  nextStreet() {
    // If at most one player can still act, run out the remaining board.
    const canStillAct = this.activePlayers.filter((p) => !p.allIn);
    for (const p of this.players) p.streetCommitted = 0;
    this.currentBet = 0;
    this.lastRaiseIncrement = this.config.bigBlind;
    if (this.street === "river") {
      this.settle();
      return;
    }
    const next =
      this.street === "preflop"
        ? "flop"
        : this.street === "flop"
          ? "turn"
          : "river";
    this.street = next;
    if (next === "flop") {
      this.deck.pop(); // burn
      this.board.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
    } else {
      this.deck.pop(); // burn
      this.board.push(this.deck.pop());
    }
    if (canStillAct.length <= 1) {
      // No more betting possible; run out remaining streets.
      this.pendingSeats = [];
      this.nextStreet();
      return;
    }
    const firstToAct = this.nextSeatAfter(this.buttonSeat);
    this.pendingSeats = this.seatOrder(firstToAct).filter((s) =>
      this.canAct(s),
    );
    this.raiseAllowedSeats = new Set(this.pendingSeats);
    this.advanceActor();
  }
  // ---------- settlement ----------
  /** Build side pots from committed amounts. */
  static buildPots(players) {
    const contributors = players.filter((p) => p.totalCommitted > 0);
    const levels = [
      ...new Set(
        contributors.filter((p) => !p.folded).map((p) => p.totalCommitted),
      ),
    ].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const level of levels) {
      let amount = 0;
      for (const p of contributors) {
        amount += Math.max(0, Math.min(p.totalCommitted, level) - prev);
      }
      const eligible = contributors
        .filter((p) => !p.folded && p.totalCommitted >= level)
        .map((p) => p.seat);
      if (amount > 0) pots.push({ amount, eligibleSeats: eligible });
      prev = level;
    }
    // Chips above the highest live commitment (over-bets vs folds) refund to that player,
    // handled here by adding them to a pot only they are eligible for.
    const maxLive = levels[levels.length - 1] ?? 0;
    for (const p of contributors) {
      if (!p.folded && p.totalCommitted > maxLive) {
        pots.push({
          amount: p.totalCommitted - maxLive,
          eligibleSeats: [p.seat],
        });
      }
    }
    return pots;
  }
  settle() {
    this.complete = true;
    const live = this.activePlayers;
    const pots = HandEngine.buildPots(this.players);
    const wentToShowdown = live.length > 1;
    // Rake: percentage of total pot, capped; optionally no-flop-no-drop.
    const totalPot = pots.reduce((s, p) => s + p.amount, 0);
    let rake = 0;
    const { percentage, cap, noFlopNoDrop } = this.config.rake;
    if (!(noFlopNoDrop && this.board.length === 0)) {
      rake = Math.min(Math.floor(totalPot * percentage), cap);
    }
    const winnings = new Map();
    const potsAwarded = [];
    const ranks = new Map();
    if (wentToShowdown) {
      for (const p of live) {
        ranks.set(p.seat, evaluate7([...(p.holeCards ?? []), ...this.board]));
      }
    }
    let rakeRemaining = rake;
    for (const pot of pots) {
      // Take rake proportionally from the first pots.
      const potRake = Math.min(rakeRemaining, pot.amount);
      rakeRemaining -= potRake;
      const distributable = pot.amount - potRake;
      let winners;
      if (!wentToShowdown) {
        winners = [live[0].seat];
      } else {
        const eligible = pot.eligibleSeats.filter((s) => ranks.has(s));
        const bestScore = Math.max(...eligible.map((s) => ranks.get(s).score));
        winners = eligible.filter((s) => ranks.get(s).score === bestScore);
      }
      const share = Math.floor(distributable / winners.length);
      let remainder = distributable - share * winners.length;
      // Odd chips go to the first winner(s) left of the button.
      const orderedWinners = this.seatOrder(
        this.nextSeatAfter(this.buttonSeat),
      ).filter((s) => winners.includes(s));
      for (const seat of orderedWinners) {
        const extra = remainder > 0 ? 1 : 0;
        remainder -= extra;
        winnings.set(seat, (winnings.get(seat) ?? 0) + share + extra);
      }
      potsAwarded.push({ amount: distributable, winners: orderedWinners });
    }
    for (const [seat, amount] of winnings) {
      this.player(seat).stack += amount;
    }
    const results = this.players.map((p) => ({
      seat: p.seat,
      playerId: p.playerId,
      net: p.stack - (this.startingStacks.get(p.seat) ?? 0),
      wonAmount: winnings.get(p.seat) ?? 0,
      showedDown: wentToShowdown && !p.folded,
      holeCards:
        wentToShowdown && !p.folded
          ? p.holeCards
          : this.manualSeat === p.seat
            ? p.holeCards
            : null,
      handRank: ranks.get(p.seat) ?? null,
    }));
    this.history = {
      handNumber: this.handNumber,
      buttonSeat: this.buttonSeat,
      players: this.players.map((p) => ({
        seat: p.seat,
        playerId: p.playerId,
        name: p.name,
        startingStack: this.startingStacks.get(p.seat) ?? 0,
        position: this.positionOf(p.seat),
      })),
      holeCards: Object.fromEntries(
        this.players.map((p) => [p.seat, p.holeCards ?? []]),
      ),
      board: this.board.slice(),
      actions: this.actions.slice(),
      potsAwarded,
      rakeTaken: rake,
      results,
      manualSeat: this.manualSeat,
      seedState: this.seedState,
    };
  }
  getHistory() {
    if (!this.history) throw new Error("Hand not complete");
    return this.history;
  }
}
