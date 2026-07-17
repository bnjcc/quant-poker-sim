import { Card, Rank, SUITS } from "@/types/poker";
import { holeNotation } from "./deck";
import { Rng } from "./rng";

export const RANGE_RANKS = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2] as const;
export type StartingHandKind = "pair" | "suited" | "offsuit";

const RANK_SYMBOL: Record<number, string> = {
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
  Object.entries(RANK_SYMBOL).map(([rank, symbol]) => [symbol, Number(rank) as Rank]),
) as Record<string, Rank>;

export interface StartingHandCell {
  notation: string;
  highRank: Rank;
  lowRank: Rank;
  kind: StartingHandKind;
  gap: number;
  combos: number;
}

function notationFor(rowRank: Rank, columnRank: Rank): string {
  if (rowRank === columnRank) return `${RANK_SYMBOL[rowRank]}${RANK_SYMBOL[columnRank]}`;
  const high = Math.max(rowRank, columnRank) as Rank;
  const low = Math.min(rowRank, columnRank) as Rank;
  return `${RANK_SYMBOL[high]}${RANK_SYMBOL[low]}${rowRank > columnRank ? "s" : "o"}`;
}

export function parseStartingHand(notation: string): StartingHandCell | null {
  const match = /^([2-9TJQKA])([2-9TJQKA])([so])?$/.exec(notation.toUpperCase().replace(/S$/, "s").replace(/O$/, "o"));
  if (!match) return null;
  const first = SYMBOL_RANK[match[1]];
  const second = SYMBOL_RANK[match[2]];
  if (!first || !second) return null;
  if (first === second) {
    if (match[3]) return null;
    return { notation: `${match[1]}${match[2]}`, highRank: first, lowRank: second, kind: "pair", gap: 0, combos: 6 };
  }
  if (!match[3] || first < second) return null;
  const kind: StartingHandKind = match[3] === "s" ? "suited" : "offsuit";
  return {
    notation: `${match[1]}${match[2]}${match[3]}`,
    highRank: first,
    lowRank: second,
    kind,
    gap: first - second - 1,
    combos: kind === "suited" ? 4 : 12,
  };
}

export const STARTING_HAND_GRID: StartingHandCell[][] = RANGE_RANKS.map((rowRank) =>
  RANGE_RANKS.map((columnRank) => parseStartingHand(notationFor(rowRank, columnRank))!),
);

export const ALL_STARTING_HANDS = STARTING_HAND_GRID.flat();

export function isStartingHandNotation(notation: string): boolean {
  return parseStartingHand(notation) !== null;
}

export function startingHandCombos(notation: string): number {
  return parseStartingHand(notation)?.combos ?? 0;
}

export function rangeComboCount(range: Iterable<string>): number {
  return [...new Set(range)].reduce((total, notation) => total + startingHandCombos(notation), 0);
}

export function cardsForStartingHand(notation: string, rng: Rng): Card[] {
  const hand = parseStartingHand(notation);
  if (!hand) throw new Error(`Invalid starting-hand notation: ${notation}`);

  if (hand.kind === "pair") {
    const firstSuit = rng.int(SUITS.length);
    const secondOffset = 1 + rng.int(SUITS.length - 1);
    return [
      { rank: hand.highRank, suit: SUITS[firstSuit] },
      { rank: hand.lowRank, suit: SUITS[(firstSuit + secondOffset) % SUITS.length] },
    ];
  }

  if (hand.kind === "suited") {
    const suit = SUITS[rng.int(SUITS.length)];
    return [{ rank: hand.highRank, suit }, { rank: hand.lowRank, suit }];
  }

  const firstSuit = rng.int(SUITS.length);
  const secondOffset = 1 + rng.int(SUITS.length - 1);
  return [
    { rank: hand.highRank, suit: SUITS[firstSuit] },
    { rank: hand.lowRank, suit: SUITS[(firstSuit + secondOffset) % SUITS.length] },
  ];
}

export function handIsInRange(cards: Card[], range: ReadonlySet<string>): boolean {
  return cards.length === 2 && range.has(holeNotation(cards));
}
