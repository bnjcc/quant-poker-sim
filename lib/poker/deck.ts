import { Card, Rank, RANKS, SUITS } from "@/types/poker";
import { Rng } from "./rng";

const RANK_CHARS: Record<Rank, string> = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
  10: "T", 11: "J", 12: "Q", 13: "K", 14: "A",
};
const CHAR_RANKS: Record<string, Rank> = Object.fromEntries(
  Object.entries(RANK_CHARS).map(([r, c]) => [c, Number(r) as Rank]),
) as Record<string, Rank>;

export function cardToString(c: Card): string {
  return RANK_CHARS[c.rank] + c.suit;
}

export function cardFromString(s: string): Card {
  const rank = CHAR_RANKS[s[0].toUpperCase()];
  const suit = s[1].toLowerCase() as Card["suit"];
  if (!rank || !SUITS.includes(suit)) throw new Error(`Invalid card string: ${s}`);
  return { rank, suit };
}

export function cardsFromString(s: string): Card[] {
  const out: Card[] = [];
  const clean = s.replace(/[\s,]/g, "");
  for (let i = 0; i < clean.length; i += 2) out.push(cardFromString(clean.slice(i, i + 2)));
  return out;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  return deck;
}

/** Fisher–Yates shuffle using the seeded RNG. */
export function shuffle(deck: Card[], rng: Rng): Card[] {
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** Canonical 169-style notation for hole cards, e.g. "AKs", "T9o", "77". */
export function holeNotation(cards: Card[]): string {
  const [a, b] = [...cards].sort((x, y) => y.rank - x.rank);
  const ra = RANK_CHARS[a.rank];
  const rb = RANK_CHARS[b.rank];
  if (a.rank === b.rank) return ra + rb;
  return ra + rb + (a.suit === b.suit ? "s" : "o");
}
