import { holeNotation } from "@/lib/poker/deck";
const BET_BUCKETS = [0.33, 0.5, 0.75, 1.0, 1.5];
/**
 * Incremental aggregator: O(1) memory per hand aside from a downsampled
 * equity curve, so hundreds of thousands of hands stay cheap.
 */
export class Aggregator {
  bb;
  n = 0;
  sum = 0; // bb
  sumSq = 0;
  peak = 0;
  cumulative = 0;
  maxDD = 0;
  grossWin = 0;
  grossLoss = 0;
  showdownNet = 0;
  nonShowdownNet = 0;
  wonHands = 0;
  netChips = 0;
  rake = 0;
  byPosition = new Map();
  byHole = new Map();
  byDepth = new Map();
  byPot = new Map();
  byOpponentType = new Map();
  actionCounts = { fold: 0, check: 0, call: 0, bet: 0, raise: 0, "all-in": 0 };
  betHist = [0, 0, 0, 0, 0, 0];
  curve = [];
  ddCurve = [];
  curveStride = 1;
  constructor(bigBlind) {
    this.bb = bigBlind;
  }
  addHand(h, userSeat, isManual) {
    const res = h.results.find((r) => r.seat === userSeat);
    if (!res) return;
    void isManual;
    const netBB = res.net / this.bb;
    this.n++;
    this.netChips += res.net;
    this.sum += netBB;
    this.sumSq += netBB * netBB;
    this.cumulative += netBB;
    if (this.cumulative > this.peak) this.peak = this.cumulative;
    const dd = this.peak - this.cumulative;
    if (dd > this.maxDD) this.maxDD = dd;
    if (res.net > 0) {
      this.grossWin += netBB;
      this.wonHands++;
    } else if (res.net < 0) {
      this.grossLoss += -netBB;
    }
    if (res.showedDown) this.showdownNet += netBB;
    else this.nonShowdownNet += netBB;
    this.rake += h.rakeTaken;
    this.addOpponentMatchups(h, userSeat, res);
    const player = h.players.find((p) => p.seat === userSeat);
    if (player) {
      bump(this.byPosition, player.position, res.net);
      const depthBB = player.startingStack / this.bb;
      const depthKey =
        depthBB < 50
          ? "<50bb"
          : depthBB < 100
            ? "50-100bb"
            : depthBB < 150
              ? "100-150bb"
              : "150bb+";
      bump(this.byDepth, depthKey, res.net);
    }
    const hole = h.holeCards[userSeat];
    if (hole && hole.length === 2)
      bump(this.byHole, holeNotation(hole), res.net);
    // Pot type: raised / 3-bet / limped based on preflop raises.
    const preRaises = h.actions.filter(
      (a) => a.street === "preflop" && (a.type === "raise" || a.type === "bet"),
    ).length;
    const potType =
      preRaises === 0
        ? "limped"
        : preRaises === 1
          ? "single-raised"
          : preRaises === 2
            ? "3-bet"
            : "4-bet+";
    bump(this.byPot, potType, res.net);
    for (const a of h.actions) {
      if (a.seat !== userSeat || a.type === "post-sb" || a.type === "post-bb")
        continue;
      this.actionCounts[a.type] = (this.actionCounts[a.type] ?? 0) + 1;
      if (a.type === "bet" || a.type === "raise") {
        // Pot size before the action ~ reconstructable, use amount vs final pot as rough proxy:
        const potBefore = potBeforeAction(h, a);
        if (potBefore > 0) {
          const frac = a.amount / potBefore;
          let b = BET_BUCKETS.findIndex((limit) => frac < limit);
          if (b === -1) b = BET_BUCKETS.length;
          this.betHist[b]++;
        }
      }
    }
    // Downsampled equity curve: cap at ~2000 points by doubling the stride.
    if (this.n % this.curveStride === 0) {
      this.curve.push(this.cumulative);
      this.ddCurve.push(-(this.peak - this.cumulative));
      if (this.curve.length > 2000) {
        this.curve = this.curve.filter((_, i) => i % 2 === 0);
        this.ddCurve = this.ddCurve.filter((_, i) => i % 2 === 0);
        this.curveStride *= 2;
      }
    }
  }
  /**
   * Attribute the user's result to the opponent(s) on the other side of the
   * chip transfer. In a multiway pot there is no unique heads-up accounting,
   * so gains are split in proportion to opponents' losses and losses in
   * proportion to opponents' gains. Each archetype is then normalized by its
   * opponent-seat encounters, keeping common pool types from looking stronger
   * or weaker merely because several copies shared a table.
   */
  addOpponentMatchups(h, userSeat, userResult) {
    const typedOpponents = h.players
      .filter(
        (player) =>
          player.seat !== userSeat &&
          typeof player.opponentTypeId === "string" &&
          player.opponentTypeId.length > 0,
      );
    if (typedOpponents.length === 0) return;

    const opposingResults = h.results.filter(
      (result) => result.seat !== userSeat,
    );
    const allocations = new Map();
    if (userResult.net > 0) {
      const losses = opposingResults.filter((result) => result.net < 0);
      const lossPool = losses.reduce((sum, result) => sum - result.net, 0);
      if (lossPool > 0) {
        for (const result of losses) {
          allocations.set(
            result.seat,
            userResult.net * (-result.net / lossPool),
          );
        }
      }
    } else if (userResult.net < 0) {
      const gains = opposingResults.filter((result) => result.net > 0);
      const gainPool = gains.reduce((sum, result) => sum + result.net, 0);
      if (gainPool > 0) {
        for (const result of gains) {
          allocations.set(
            result.seat,
            userResult.net * (result.net / gainPool),
          );
        }
      }
    }

    const typesSeen = new Set();
    for (const opponent of typedOpponents) {
      const key = opponent.opponentTypeId;
      const row = this.byOpponentType.get(key) ?? {
        id: key,
        name: opponent.opponentTypeName ?? key,
        hands: 0,
        encounters: 0,
        decisiveEncounters: 0,
        net: 0,
        sumBB: 0,
        sumSqBB: 0,
      };
      if (!typesSeen.has(key)) {
        row.hands++;
        typesSeen.add(key);
      }
      const allocation = allocations.get(opponent.seat) ?? 0;
      const allocationBB = allocation / this.bb;
      row.encounters++;
      row.net += allocation;
      row.sumBB += allocationBB;
      row.sumSqBB += allocationBB * allocationBB;
      if (allocation !== 0) row.decisiveEncounters++;
      this.byOpponentType.set(key, row);
    }
  }
  snapshot() {
    const n = Math.max(this.n, 1);
    const meanBB = this.sum / n;
    const variance =
      n > 1 ? (this.sumSq - (this.sum * this.sum) / n) / (n - 1) : 0;
    const std = Math.sqrt(Math.max(variance, 0));
    const bb100 = meanBB * 100;
    const stdBB100 = std * 10; // std of the per-100-hand mean: std/sqrt(100)*100
    const se100 = (std / Math.sqrt(n)) * 100;
    const ciLow = bb100 - 1.96 * se100;
    const ciHigh = bb100 + 1.96 * se100;
    const toRows = (m) =>
      Object.fromEntries(
        [...m.entries()].map(([k, v]) => [
          k,
          {
            hands: v.hands,
            net: v.net,
            bb100: v.hands ? (v.net / this.bb / v.hands) * 100 : 0,
          },
        ]),
      );
    const opponentRows = Object.fromEntries(
      [...this.byOpponentType.entries()].map(([key, value]) => {
        const encounters = Math.max(value.encounters, 1);
        const meanBB = value.sumBB / encounters;
        const variance =
          encounters > 1
            ? (value.sumSqBB -
                (value.sumBB * value.sumBB) / encounters) /
              (encounters - 1)
            : 0;
        const standardDeviation = Math.sqrt(Math.max(variance, 0));
        const standardError100 =
          (standardDeviation / Math.sqrt(encounters)) * 100;
        const score = meanBB * 100;
        return [
          key,
          {
            id: value.id,
            name: value.name,
            hands: value.hands,
            encounters: value.encounters,
            decisiveEncounters: value.decisiveEncounters,
            net: value.net,
            bb: value.sumBB,
            score,
            ciLow: score - 1.96 * standardError100,
            ciHigh: score + 1.96 * standardError100,
          },
        ];
      }),
    );
    return {
      totalHands: this.n,
      userNet: this.netChips,
      bbWon: this.sum,
      bb100,
      stdDevBBPerHand: std,
      stdDevBB100: stdBB100,
      variance,
      ciLow,
      ciHigh,
      statisticallySignificant: this.n > 30 && (ciLow > 0 || ciHigh < 0),
      maxDrawdownBB: this.maxDD,
      currentDrawdownBB: this.peak - this.cumulative,
      profitFactor:
        this.grossLoss > 0
          ? this.grossWin / this.grossLoss
          : this.grossWin > 0
            ? Infinity
            : 0,
      showdownNetBB: this.showdownNet,
      nonShowdownNetBB: this.nonShowdownNet,
      wonHands: this.wonHands,
      winRate: this.n ? this.wonHands / this.n : 0,
      byPosition: toRows(this.byPosition),
      byHoleCards: toRows(this.byHole),
      byStackDepth: toRows(this.byDepth),
      byPotType: toRows(this.byPot),
      byOpponentType: opponentRows,
      actionCounts: { ...this.actionCounts },
      betSizeHistogram: [...this.betHist],
      cumulativeBB: [...this.curve],
      drawdownCurveBB: [...this.ddCurve],
      rakePaid: this.rake,
      handsSampledForCurve: this.curveStride,
    };
  }
}
function bump(m, key, net) {
  const v = m.get(key) ?? { hands: 0, net: 0 };
  v.hands++;
  v.net += net;
  m.set(key, v);
}
function potBeforeAction(h, target) {
  let pot = 0;
  for (const a of h.actions) {
    if (a === target) break;
    if (
      a.seat === target.seat &&
      a.amount === target.amount &&
      a.street === target.street
    )
      break;
    pot += a.amount;
  }
  return pot;
}
/**
 * Risk-of-ruin estimate using the standard diffusion approximation:
 * RoR = exp(-2 * winrate * bankroll / variance), with winrate in bb/hand.
 * Only meaningful for positive win rates; an estimate, not a guarantee.
 */
export function riskOfRuin(bb100, stdPerHandBB, bankrollBB) {
  const wr = bb100 / 100;
  if (wr <= 0) return 1;
  const variance = stdPerHandBB * stdPerHandBB;
  if (variance <= 0) return 0;
  const ror = Math.exp((-2 * wr * bankrollBB) / variance);
  return Math.min(1, Math.max(0, ror));
}
