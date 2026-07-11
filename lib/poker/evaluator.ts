import { Card, HandCategory, HandRank, Rank } from "@/types/poker";

/**
 * Hand evaluator.
 *
 * evaluate5 ranks exactly five cards; evaluate7 finds the best 5-card hand
 * out of up to 7 cards. Scores are directly comparable integers: category
 * occupies the high bits, tiebreak ranks fill the low bits (4 bits per rank).
 */

const CATEGORY_ORDER: HandCategory[] = [
  "high-card", "pair", "two-pair", "three-of-a-kind", "straight",
  "flush", "full-house", "four-of-a-kind", "straight-flush",
];

function makeScore(category: HandCategory, ranks: number[]): number {
  let score = CATEGORY_ORDER.indexOf(category);
  for (let i = 0; i < 5; i++) {
    score = score * 16 + (ranks[i] ?? 0);
  }
  return score;
}

/** Returns the high card rank of a straight, or 0 if not a straight. Handles the wheel (A-5). */
function straightHigh(sortedDescUnique: number[]): number {
  if (sortedDescUnique.length < 5) return 0;
  // Wheel check: A,5,4,3,2
  const set = new Set(sortedDescUnique);
  for (const high of sortedDescUnique) {
    if (high >= 6 && [high, high - 1, high - 2, high - 3, high - 4].every((r) => set.has(r))) {
      return high;
    }
  }
  if (set.has(14) && set.has(5) && set.has(4) && set.has(3) && set.has(2)) return 5;
  return 0;
}

export function evaluate5(cards: Card[]): HandRank {
  if (cards.length !== 5) throw new Error("evaluate5 requires exactly 5 cards");
  const ranks = cards.map((c) => c.rank as number).sort((a, b) => b - a);
  const isFlush = cards.every((c) => c.suit === cards[0].suit);
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  const sHigh = straightHigh(unique);

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // Sort by count desc, then rank desc.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  let category: HandCategory;
  let tiebreak: number[];

  if (isFlush && sHigh) {
    category = "straight-flush";
    tiebreak = [sHigh];
  } else if (groups[0][1] === 4) {
    category = "four-of-a-kind";
    tiebreak = [groups[0][0], groups[1][0]];
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    category = "full-house";
    tiebreak = [groups[0][0], groups[1][0]];
  } else if (isFlush) {
    category = "flush";
    tiebreak = ranks;
  } else if (sHigh) {
    category = "straight";
    tiebreak = [sHigh];
  } else if (groups[0][1] === 3) {
    category = "three-of-a-kind";
    tiebreak = [groups[0][0], groups[1][0], groups[2][0]];
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    category = "two-pair";
    tiebreak = [groups[0][0], groups[1][0], groups[2][0]];
  } else if (groups[0][1] === 2) {
    category = "pair";
    tiebreak = [groups[0][0], groups[1][0], groups[2][0], groups[3][0]];
  } else {
    category = "high-card";
    tiebreak = ranks;
  }

  return { category, score: makeScore(category, tiebreak), cards };
}

const COMBOS_7C5: number[][] = (() => {
  const out: number[][] = [];
  for (let a = 0; a < 3; a++)
    for (let b = a + 1; b < 4; b++)
      for (let c = b + 1; c < 5; c++)
        for (let d = c + 1; d < 6; d++)
          for (let e = d + 1; e < 7; e++) out.push([a, b, c, d, e]);
  return out;
})();

const COMBOS_6C5: number[][] = (() => {
  const out: number[][] = [];
  for (let skip = 0; skip < 6; skip++) {
    out.push([0, 1, 2, 3, 4, 5].filter((i) => i !== skip));
  }
  return out;
})();

/** Best 5-card hand from 5, 6, or 7 cards. */
export function evaluate7(cards: Card[]): HandRank {
  if (cards.length === 5) return evaluate5(cards);
  const combos = cards.length === 6 ? COMBOS_6C5 : COMBOS_7C5;
  if (cards.length !== 6 && cards.length !== 7) {
    throw new Error(`evaluate7 requires 5-7 cards, got ${cards.length}`);
  }
  let best: HandRank | null = null;
  for (const combo of combos) {
    const hand = evaluate5(combo.map((i) => cards[i]));
    if (!best || hand.score > best.score) best = hand;
  }
  return best!;
}

export function compareHands(a: HandRank, b: HandRank): number {
  return a.score - b.score;
}

// ---------------------------------------------------------------------------
// Fast path: allocation-free 7-card scoring for Monte Carlo simulation.
// Produces scores on the same scale as evaluate5/evaluate7 (verified by tests).
// ---------------------------------------------------------------------------

const SUIT_INDEX: Record<string, number> = { s: 0, h: 1, d: 2, c: 3 };
const fastCounts = new Int8Array(15);
const fastSuitCounts = new Int8Array(4);
const fastSuitMasks = new Int32Array(4);

function topBits(mask: number, n: number, out: number[]): void {
  let found = 0;
  for (let r = 14; r >= 2 && found < n; r--) {
    if (mask & (1 << r)) out[found++] = r;
  }
}

function straightFromMask(mask: number): number {
  // Ace-low support.
  const m = mask | ((mask >> 13) & 0b10); // copy ace bit (14) to bit 1
  for (let high = 14; high >= 5; high--) {
    const run = 0b11111 << (high - 4);
    if ((m & run) === run) return high;
  }
  return 0;
}

function score5(cat: number, r1: number, r2 = 0, r3 = 0, r4 = 0, r5 = 0): number {
  return ((((cat * 16 + r1) * 16 + r2) * 16 + r3) * 16 + r4) * 16 + r5;
}

/** Fast comparable score for exactly 5–7 cards. No allocations beyond scratch. */
export function fastScore7(cards: Card[]): number {
  fastCounts.fill(0);
  fastSuitCounts.fill(0);
  fastSuitMasks.fill(0);
  let rankMask = 0;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    fastCounts[c.rank]++;
    const s = SUIT_INDEX[c.suit];
    fastSuitCounts[s]++;
    fastSuitMasks[s] |= 1 << c.rank;
    rankMask |= 1 << c.rank;
  }

  // Flush / straight flush.
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (fastSuitCounts[s] >= 5) flushSuit = s;
  if (flushSuit >= 0) {
    const sf = straightFromMask(fastSuitMasks[flushSuit]);
    if (sf) return score5(8, sf);
  }

  // Quads.
  let quad = 0, trip1 = 0, trip2 = 0, pair1 = 0, pair2 = 0;
  for (let r = 14; r >= 2; r--) {
    const c = fastCounts[r];
    if (c === 4) quad = quad || r;
    else if (c === 3) {
      if (!trip1) trip1 = r;
      else if (!trip2) trip2 = r;
    } else if (c === 2) {
      if (!pair1) pair1 = r;
      else if (!pair2) pair2 = r;
    }
  }
  if (quad) {
    let kicker = 0;
    for (let r = 14; r >= 2; r--) {
      if (r !== quad && fastCounts[r] > 0) { kicker = r; break; }
    }
    return score5(7, quad, kicker);
  }
  if (trip1 && (trip2 || pair1)) {
    return score5(6, trip1, trip2 || pair1);
  }
  if (flushSuit >= 0) {
    const tops = [0, 0, 0, 0, 0];
    topBits(fastSuitMasks[flushSuit], 5, tops);
    return score5(5, tops[0], tops[1], tops[2], tops[3], tops[4]);
  }
  const st = straightFromMask(rankMask);
  if (st) return score5(4, st);
  if (trip1) {
    let k1 = 0, k2 = 0;
    for (let r = 14; r >= 2; r--) {
      if (r === trip1 || fastCounts[r] === 0) continue;
      if (!k1) k1 = r;
      else { k2 = r; break; }
    }
    return score5(3, trip1, k1, k2);
  }
  if (pair1 && pair2) {
    let kicker = 0;
    for (let r = 14; r >= 2; r--) {
      if (r !== pair1 && r !== pair2 && fastCounts[r] > 0) { kicker = r; break; }
    }
    return score5(2, pair1, pair2, kicker);
  }
  if (pair1) {
    let k1 = 0, k2 = 0, k3 = 0;
    for (let r = 14; r >= 2; r--) {
      if (r === pair1 || fastCounts[r] === 0) continue;
      if (!k1) k1 = r;
      else if (!k2) k2 = r;
      else { k3 = r; break; }
    }
    return score5(1, pair1, k1, k2, k3);
  }
  const tops = [0, 0, 0, 0, 0];
  topBits(rankMask, 5, tops);
  return score5(0, tops[0], tops[1], tops[2], tops[3], tops[4]);
}

export const HAND_CATEGORY_LABEL: Record<HandCategory, string> = {
  "high-card": "High card",
  pair: "Pair",
  "two-pair": "Two pair",
  "three-of-a-kind": "Three of a kind",
  straight: "Straight",
  flush: "Flush",
  "full-house": "Full house",
  "four-of-a-kind": "Four of a kind",
  "straight-flush": "Straight flush",
};

/** Convenience: rank sorted ranks descending. */
export function sortedRanks(cards: Card[]): Rank[] {
  return cards.map((c) => c.rank).sort((a, b) => b - a) as Rank[];
}
