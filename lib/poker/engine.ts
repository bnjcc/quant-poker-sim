import {
  Action, ActionType, Card, HandHistory, LegalActions, PlayerState, Position,
  POSITIONS_BY_COUNT, Pot, SeatResult, Street, TableConfig,
} from "@/types/poker";
import { createDeck, shuffle } from "./deck";
import { evaluate7 } from "./evaluator";
import { Rng } from "./rng";

export interface HandSetupPlayer {
  seat: number;
  playerId: string;
  name: string;
  stack: number;
}

export interface EngineAction {
  type: "fold" | "check" | "call" | "bet" | "raise";
  /** For bet/raise: total chips committed on this street after the action ("to" amount). */
  toAmount?: number;
}

/**
 * Deterministic single-hand engine for No-Limit Hold'em.
 * Pure game rules: no agent logic, no persistence, no UI concerns.
 */
export class HandEngine {
  readonly config: TableConfig;
  readonly handNumber: number;
  readonly buttonSeat: number;
  readonly players: PlayerState[];
  readonly board: Card[] = [];
  readonly actions: Action[] = [];
  street: Street = "preflop";
  complete = false;

  private deck: Card[];
  private currentBet = 0;
  private lastRaiseIncrement = 0;
  private actingSeat = -1;
  /** Seats that still need to act this street. */
  private pendingSeats: number[] = [];
  private startingStacks = new Map<number, number>();
  private manualSeat: number | null;
  private forcedHoleCards = new Map<number, Card[]>();
  private seedState: string;
  private history: HandHistory | null = null;

  constructor(opts: {
    players: HandSetupPlayer[];
    buttonSeat: number;
    config: TableConfig;
    rng: Rng;
    handNumber: number;
    manualSeat?: number | null;
    /** Optional known hole cards for scenario-based calibration. */
    forcedHoleCards?: Record<number, Card[]>;
    /** Injectable deck for tests (dealt from the end via pop). */
    deck?: Card[];
  }) {
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

    for (const [seatText, cards] of Object.entries(opts.forcedHoleCards ?? {})) {
      const seat = Number(seatText);
      if (!this.players.some((player) => player.seat === seat)) throw new Error(`Cannot force cards for missing seat ${seat}`);
      if (cards.length !== 2) throw new Error(`Forced hole cards for seat ${seat} must contain exactly two cards`);
      for (const card of cards) {
        const deckIndex = this.deck.findIndex((candidate) => candidate.rank === card.rank && candidate.suit === card.suit);
        if (deckIndex < 0) throw new Error(`Forced card is duplicated or missing from the deck`);
        this.deck.splice(deckIndex, 1);
      }
      this.forcedHoleCards.set(seat, cards.slice());
    }

    this.postBlindsAndDeal();
  }

  // ---------- setup ----------

  private seatOrder(fromSeat: number): number[] {
    const seats = this.players.map((p) => p.seat).sort((a, b) => a - b);
    const idx = seats.indexOf(fromSeat);
    return [...seats.slice(idx), ...seats.slice(0, idx)];
  }

  private nextSeatAfter(seat: number): number {
    const order = this.seatOrder(seat);
    return order[1 % order.length];
  }

  private player(seat: number): PlayerState {
    const p = this.players.find((x) => x.seat === seat);
    if (!p) throw new Error(`No player at seat ${seat}`);
    return p;
  }

  positionOf(seat: number): Position {
    const n = this.players.length;
    const order = this.seatOrder(this.buttonSeat);
    const labels = POSITIONS_BY_COUNT[n];
    return labels[order.indexOf(seat)];
  }

  private postBlindsAndDeal(): void {
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
        p.holeCards.push(this.forcedHoleCards.get(seat)?.[round] ?? this.deck.pop()!);
      }
    }

    // Preflop action starts left of BB (or button/SB in heads-up).
    const firstToAct = n === 2 ? sbSeat : this.nextSeatAfter(bbSeat);
    this.pendingSeats = this.seatOrder(firstToAct).filter((s) => this.canAct(s));
    this.advanceActor();
  }

  private forcePost(seat: number, amount: number, type: ActionType): void {
    const p = this.player(seat);
    const posted = Math.min(amount, p.stack);
    p.stack -= posted;
    p.streetCommitted += posted;
    p.totalCommitted += posted;
    if (p.stack === 0) p.allIn = true;
    this.actions.push({ seat, type, amount: posted, street: "preflop", allIn: p.allIn });
  }

  private canAct(seat: number): boolean {
    const p = this.player(seat);
    return !p.folded && !p.allIn;
  }

  // ---------- public API ----------

  get currentSeat(): number | null {
    return this.complete ? null : this.actingSeat;
  }

  get potSize(): number {
    return this.players.reduce((sum, p) => sum + p.totalCommitted, 0);
  }

  get activePlayers(): PlayerState[] {
    return this.players.filter((p) => !p.folded);
  }

  getLegalActions(seat: number): LegalActions {
    if (this.complete || seat !== this.actingSeat) {
      return { types: [], callAmount: 0, minBet: 0, minRaiseTo: 0, maxBetTo: 0 };
    }
    const p = this.player(seat);
    const toCall = this.currentBet - p.streetCommitted;
    const maxTo = p.streetCommitted + p.stack;
    const types: LegalActions["types"] = [];

    if (toCall > 0) {
      types.push("fold", "call");
      const minRaiseTo = this.currentBet + this.lastRaiseIncrement;
      if (maxTo > this.currentBet) types.push("raise");
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

  applyAction(seat: number, action: EngineAction): void {
    if (this.complete) throw new Error("Hand is complete");
    if (seat !== this.actingSeat) throw new Error(`Not seat ${seat}'s turn`);
    const legal = this.getLegalActions(seat);
    if (!legal.types.includes(action.type)) {
      throw new Error(`Illegal action ${action.type} for seat ${seat}`);
    }
    const p = this.player(seat);

    switch (action.type) {
      case "fold": {
        p.folded = true;
        this.record(seat, "fold", 0, false);
        break;
      }
      case "check": {
        this.record(seat, "check", 0, false);
        break;
      }
      case "call": {
        const amount = Math.min(this.currentBet - p.streetCommitted, p.stack);
        this.commit(p, amount);
        this.record(seat, p.allIn ? "all-in" : "call", amount, p.allIn);
        break;
      }
      case "bet":
      case "raise": {
        let to = action.toAmount ?? 0;
        to = Math.min(to, p.streetCommitted + p.stack);
        const isAllIn = to === p.streetCommitted + p.stack;
        if (action.type === "bet") {
          if (to < legal.minBet && !isAllIn) throw new Error(`Bet ${to} below minimum ${legal.minBet}`);
        } else {
          if (to <= this.currentBet) throw new Error(`Raise to ${to} not above current bet ${this.currentBet}`);
          if (to < legal.minRaiseTo && !isAllIn) throw new Error(`Raise to ${to} below minimum ${legal.minRaiseTo}`);
        }
        const increment = to - this.currentBet;
        const fullRaise = increment >= this.lastRaiseIncrement;
        const amount = to - p.streetCommitted;
        this.commit(p, amount);
        if (to > this.currentBet) {
          if (fullRaise || action.type === "bet") {
            this.lastRaiseIncrement = action.type === "bet" ? to : increment;
          }
          this.currentBet = to;
          // Aggression reopens action for everyone else who can act.
          this.pendingSeats = this.seatOrder(this.nextSeatAfter(seat)).filter(
            (s) => s !== seat && this.canAct(s),
          );
        }
        this.record(seat, p.allIn ? "all-in" : action.type, amount, p.allIn);
        break;
      }
    }

    this.removePending(seat);
    this.afterAction();
  }

  private commit(p: PlayerState, amount: number): void {
    const real = Math.min(amount, p.stack);
    p.stack -= real;
    p.streetCommitted += real;
    p.totalCommitted += real;
    if (p.stack === 0) p.allIn = true;
  }

  private record(seat: number, type: ActionType, amount: number, allIn: boolean): void {
    this.actions.push({ seat, type, amount, street: this.street, allIn });
  }

  private removePending(seat: number): void {
    this.pendingSeats = this.pendingSeats.filter((s) => s !== seat && this.canAct(s));
  }

  private afterAction(): void {
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

  private advanceActor(): void {
    this.pendingSeats = this.pendingSeats.filter((s) => this.canAct(s));
    if (this.pendingSeats.length === 0) {
      this.nextStreet();
      return;
    }
    this.actingSeat = this.pendingSeats[0];
  }

  private nextStreet(): void {
    // If at most one player can still act, run out the remaining board.
    const canStillAct = this.activePlayers.filter((p) => !p.allIn);

    for (const p of this.players) p.streetCommitted = 0;
    this.currentBet = 0;
    this.lastRaiseIncrement = this.config.bigBlind;

    if (this.street === "river") {
      this.settle();
      return;
    }

    const next: Street = this.street === "preflop" ? "flop" : this.street === "flop" ? "turn" : "river";
    this.street = next;
    if (next === "flop") {
      this.deck.pop(); // burn
      this.board.push(this.deck.pop()!, this.deck.pop()!, this.deck.pop()!);
    } else {
      this.deck.pop(); // burn
      this.board.push(this.deck.pop()!);
    }

    if (canStillAct.length <= 1) {
      // No more betting possible; run out remaining streets.
      this.pendingSeats = [];
      this.nextStreet();
      return;
    }

    const firstToAct = this.nextSeatAfter(this.buttonSeat);
    this.pendingSeats = this.seatOrder(firstToAct).filter((s) => this.canAct(s));
    this.advanceActor();
  }

  // ---------- settlement ----------

  /** Build side pots from committed amounts. */
  static buildPots(players: PlayerState[]): Pot[] {
    const contributors = players.filter((p) => p.totalCommitted > 0);
    const levels = [...new Set(contributors.filter((p) => !p.folded).map((p) => p.totalCommitted))]
      .sort((a, b) => a - b);
    const pots: Pot[] = [];
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
        pots.push({ amount: p.totalCommitted - maxLive, eligibleSeats: [p.seat] });
      }
    }
    return pots;
  }

  private settle(): void {
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

    const winnings = new Map<number, number>();
    const potsAwarded: { amount: number; winners: number[] }[] = [];
    const ranks = new Map<number, ReturnType<typeof evaluate7>>();
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

      let winners: number[];
      if (!wentToShowdown) {
        winners = [live[0].seat];
      } else {
        const eligible = pot.eligibleSeats.filter((s) => ranks.has(s));
        const bestScore = Math.max(...eligible.map((s) => ranks.get(s)!.score));
        winners = eligible.filter((s) => ranks.get(s)!.score === bestScore);
      }
      const share = Math.floor(distributable / winners.length);
      let remainder = distributable - share * winners.length;
      // Odd chips go to the first winner(s) left of the button.
      const orderedWinners = this.seatOrder(this.nextSeatAfter(this.buttonSeat)).filter((s) =>
        winners.includes(s),
      );
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

    const results: SeatResult[] = this.players.map((p) => ({
      seat: p.seat,
      playerId: p.playerId,
      net: p.stack - (this.startingStacks.get(p.seat) ?? 0),
      wonAmount: winnings.get(p.seat) ?? 0,
      showedDown: wentToShowdown && !p.folded,
      holeCards: wentToShowdown && !p.folded ? p.holeCards : this.manualSeat === p.seat ? p.holeCards : null,
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
      holeCards: Object.fromEntries(this.players.map((p) => [p.seat, p.holeCards ?? []])),
      board: this.board.slice(),
      actions: this.actions.slice(),
      potsAwarded,
      rakeTaken: rake,
      results,
      manualSeat: this.manualSeat,
      seedState: this.seedState,
    };
  }

  getHistory(): HandHistory {
    if (!this.history) throw new Error("Hand not complete");
    return this.history;
  }
}
