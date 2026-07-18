/**
 * Core domain constants for No-Limit Texas Hold'em.
 * These values are engine-level and UI-agnostic.
 */
export const SUITS = ["s", "h", "d", "c"];
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export const STREETS = ["preflop", "flop", "turn", "river"];
/** Seat-count-aware position labels for 2..6 handed. */
export const POSITIONS_BY_COUNT = {
  2: ["BTN", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "UTG"],
  5: ["BTN", "SB", "BB", "UTG", "CO"],
  6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
  7: ["BTN", "SB", "BB", "UTG", "MP", "HJ", "CO"],
  8: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "HJ", "CO"],
  9: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "LJ", "HJ", "CO"],
};
