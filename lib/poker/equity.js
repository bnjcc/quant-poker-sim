import { createDeck } from "./deck";
import { fastScore7 } from "./evaluator";
const scratch = [];
function cardKey(c) {
  return `${c.rank}${c.suit}`;
}
/**
 * Monte Carlo equity of `hole` vs `numOpponents` random hands, given `board`.
 * Estimates only — labeled as such wherever displayed.
 */
export function estimateEquity(
  hole,
  board,
  numOpponents,
  rng,
  iterations = 200,
) {
  const used = new Set([...hole, ...board].map(cardKey));
  const remaining = createDeck().filter((c) => !used.has(cardKey(c)));
  let winShare = 0;
  for (let it = 0; it < iterations; it++) {
    // Partial Fisher–Yates: sample just the cards we need.
    const deck = remaining.slice();
    const need = numOpponents * 2 + (5 - board.length);
    for (let i = 0; i < need; i++) {
      const j = i + rng.int(deck.length - i);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    let d = 0;
    const oppHands = [];
    for (let o = 0; o < numOpponents; o++)
      oppHands.push([deck[d++], deck[d++]]);
    const fullBoard = board.slice();
    while (fullBoard.length < 5) fullBoard.push(deck[d++]);
    scratch.length = 0;
    scratch.push(...hole, ...fullBoard);
    const myScore = fastScore7(scratch);
    const best = myScore;
    let tiedWithMe = 1;
    let beaten = false;
    for (const opp of oppHands) {
      scratch.length = 0;
      scratch.push(...opp, ...fullBoard);
      const s = fastScore7(scratch);
      if (s > best) {
        beaten = true;
        break;
      }
      if (s === myScore) tiedWithMe++;
    }
    if (!beaten) winShare += 1 / tiedWithMe;
  }
  return winShare / iterations;
}
/**
 * Preflop hand strength on a 0..1 scale using a Chen-formula-style heuristic.
 * Used for agent range decisions; cheap and deterministic.
 */
export function preflopStrength(hole) {
  const [a, b] = [...hole].sort((x, y) => y.rank - x.rank);
  const rankScore = (r) => (r >= 11 ? r - 4.5 : r / 2); // A=9.5? tweak below
  let score;
  const high =
    a.rank === 14
      ? 10
      : a.rank === 13
        ? 8
        : a.rank === 12
          ? 7
          : a.rank === 11
            ? 6
            : a.rank / 2;
  void rankScore;
  if (a.rank === b.rank) {
    score = Math.max(5, high * 2);
  } else {
    score = high;
    const gap = a.rank - b.rank - 1;
    if (gap === 0) score += 1;
    else if (gap === 1) score -= 1;
    else if (gap === 2) score -= 2;
    else if (gap === 3) score -= 4;
    else score -= 5;
    if (gap <= 1 && a.rank < 12) score += 1; // straight potential bonus
    if (a.suit === b.suit) score += 2;
  }
  // Chen scale roughly -1.5 .. 20; normalize.
  return Math.max(0, Math.min(1, (score + 1.5) / 21.5));
}
