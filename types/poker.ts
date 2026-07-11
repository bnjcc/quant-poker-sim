/**
 * Core typed domain models for No-Limit Texas Hold'em.
 * These types are engine-level and UI-agnostic.
 */

export const SUITS = ["s", "h", "d", "c"] as const;
export type Suit = (typeof SUITS)[number];

/** 2 = deuce ... 14 = ace */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type Street = "preflop" | "flop" | "turn" | "river";
export const STREETS: Street[] = ["preflop", "flop", "turn", "river"];

export type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "all-in" | "post-sb" | "post-bb";

export interface Action {
  seat: number;
  type: ActionType;
  /** Total chips committed by this action (incremental, not cumulative). */
  amount: number;
  street: Street;
  /** True when the action put the player all-in. */
  allIn: boolean;
}

export type LegalActionType = "fold" | "check" | "call" | "bet" | "raise";

export interface LegalActions {
  types: LegalActionType[];
  callAmount: number;
  minBet: number;
  minRaiseTo: number;
  maxBetTo: number; // effective all-in
}

export type Position = "BTN" | "SB" | "BB" | "UTG" | "HJ" | "CO";
/** Seat-count-aware position labels for 2..6 handed. */
export const POSITIONS_BY_COUNT: Record<number, Position[]> = {
  2: ["BTN", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "UTG"],
  5: ["BTN", "SB", "BB", "UTG", "CO"],
  6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
};

export interface PlayerState {
  seat: number;
  playerId: string;
  name: string;
  stack: number;
  holeCards: Card[] | null;
  folded: boolean;
  allIn: boolean;
  /** Chips committed on the current street. */
  streetCommitted: number;
  /** Chips committed across the whole hand. */
  totalCommitted: number;
  sittingOut: boolean;
}

export interface Pot {
  amount: number;
  /** Seats eligible to win this pot. */
  eligibleSeats: number[];
}

export type HandCategory =
  | "high-card"
  | "pair"
  | "two-pair"
  | "three-of-a-kind"
  | "straight"
  | "flush"
  | "full-house"
  | "four-of-a-kind"
  | "straight-flush";

export interface HandRank {
  category: HandCategory;
  /** Comparable score: higher wins. Encodes category + kickers. */
  score: number;
  cards: Card[];
}

export interface RakeConfig {
  /** Fraction of pot taken, e.g. 0.05 */
  percentage: number;
  /** Cap in chips (big-blind-relative caps should be pre-multiplied). */
  cap: number;
  /** No rake if the hand ends preflop ("no flop, no drop"). */
  noFlopNoDrop: boolean;
}

export interface TableConfig {
  smallBlind: number;
  bigBlind: number;
  maxSeats: number;
  rake: RakeConfig;
}

export interface SeatResult {
  seat: number;
  playerId: string;
  net: number;
  wonAmount: number;
  showedDown: boolean;
  holeCards: Card[] | null;
  handRank: HandRank | null;
}

export interface HandHistory {
  handNumber: number;
  buttonSeat: number;
  players: { seat: number; playerId: string; name: string; startingStack: number; position: Position }[];
  holeCards: Record<number, Card[]>;
  board: Card[];
  actions: Action[];
  potsAwarded: { amount: number; winners: number[] }[];
  rakeTaken: number;
  results: SeatResult[];
  /** Which seat (if any) was played manually by the user. */
  manualSeat: number | null;
  seedState: string;
}
