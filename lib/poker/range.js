import { SUITS } from "@/types/poker";
import { holeNotation } from "./deck";
export const RANGE_RANKS = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
const RANK_SYMBOL = {
  14: "A",
  13: "K",
  12: "Q",
  11: "J",
  10: "T",
  9: "9",
  8: "8",
  7: "7",
  6: "6",
  5: "5",
  4: "4",
  3: "3",
  2: "2",
};
const SYMBOL_RANK = Object.fromEntries(
  Object.entries(RANK_SYMBOL).map(([rank, symbol]) => [symbol, Number(rank)]),
);
function notationFor(rowRank, columnRank) {
  if (rowRank === columnRank)
    return `${RANK_SYMBOL[rowRank]}${RANK_SYMBOL[columnRank]}`;
  const high = Math.max(rowRank, columnRank);
  const low = Math.min(rowRank, columnRank);
  return `${RANK_SYMBOL[high]}${RANK_SYMBOL[low]}${rowRank > columnRank ? "s" : "o"}`;
}
export function parseStartingHand(notation) {
  const match = /^([2-9TJQKA])([2-9TJQKA])([so])?$/.exec(
    notation.toUpperCase().replace(/S$/, "s").replace(/O$/, "o"),
  );
  if (!match) return null;
  const first = SYMBOL_RANK[match[1]];
  const second = SYMBOL_RANK[match[2]];
  if (!first || !second) return null;
  if (first === second) {
    if (match[3]) return null;
    return {
      notation: `${match[1]}${match[2]}`,
      highRank: first,
      lowRank: second,
      kind: "pair",
      gap: 0,
      combos: 6,
    };
  }
  if (!match[3] || first < second) return null;
  const kind = match[3] === "s" ? "suited" : "offsuit";
  return {
    notation: `${match[1]}${match[2]}${match[3]}`,
    highRank: first,
    lowRank: second,
    kind,
    gap: first - second - 1,
    combos: kind === "suited" ? 4 : 12,
  };
}
export const STARTING_HAND_GRID = RANGE_RANKS.map((rowRank) =>
  RANGE_RANKS.map((columnRank) =>
    parseStartingHand(notationFor(rowRank, columnRank)),
  ),
);
export const ALL_STARTING_HANDS = STARTING_HAND_GRID.flat();
export function isStartingHandNotation(notation) {
  return parseStartingHand(notation) !== null;
}
export function startingHandCombos(notation) {
  return parseStartingHand(notation)?.combos ?? 0;
}
export function rangeComboCount(range) {
  return [...new Set(range)].reduce(
    (total, notation) => total + startingHandCombos(notation),
    0,
  );
}
export function cardsForStartingHand(notation, rng) {
  const hand = parseStartingHand(notation);
  if (!hand) throw new Error(`Invalid starting-hand notation: ${notation}`);
  if (hand.kind === "pair") {
    const firstSuit = rng.int(SUITS.length);
    const secondOffset = 1 + rng.int(SUITS.length - 1);
    return [
      { rank: hand.highRank, suit: SUITS[firstSuit] },
      {
        rank: hand.lowRank,
        suit: SUITS[(firstSuit + secondOffset) % SUITS.length],
      },
    ];
  }
  if (hand.kind === "suited") {
    const suit = SUITS[rng.int(SUITS.length)];
    return [
      { rank: hand.highRank, suit },
      { rank: hand.lowRank, suit },
    ];
  }
  const firstSuit = rng.int(SUITS.length);
  const secondOffset = 1 + rng.int(SUITS.length - 1);
  return [
    { rank: hand.highRank, suit: SUITS[firstSuit] },
    {
      rank: hand.lowRank,
      suit: SUITS[(firstSuit + secondOffset) % SUITS.length],
    },
  ];
}
export function handIsInRange(cards, range) {
  return cards.length === 2 && range.has(holeNotation(cards));
}
