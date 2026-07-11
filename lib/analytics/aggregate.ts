import { HandHistory } from "@/types/poker";
import { holeNotation } from "@/lib/poker/deck";

export interface BreakdownRow {
  hands: number;
  net: number; // chips
  bb100: number;
}

export interface SimulationAggregates {
  totalHands: number;
  userNet: number; // chips
  bbWon: number;
  bb100: number;
  /** Per-hand standard deviation in bb, and bb/100 std. */
  stdDevBBPerHand: number;
  stdDevBB100: number;
  variance: number;
  /** 95% CI around bb/100. */
  ciLow: number;
  ciHigh: number;
  statisticallySignificant: boolean;
  maxDrawdownBB: number;
  currentDrawdownBB: number;
  profitFactor: number;
  /** Risk of ruin for a given bankroll (computed on demand). */
  showdownNetBB: number;
  nonShowdownNetBB: number;
  wonHands: number;
  winRate: number;
  byPosition: Record<string, BreakdownRow>;
  byHoleCards: Record<string, BreakdownRow>;
  byStackDepth: Record<string, BreakdownRow>;
  byPotType: Record<string, BreakdownRow>;
  actionCounts: Record<string, number>;
  betSizeHistogram: number[]; // pot-fraction buckets: <0.33, 0.33-0.5, 0.5-0.75, 0.75-1, 1-1.5, >1.5
  cumulativeBB: number[]; // sampled equity curve (bb), max ~2000 points
  drawdownCurveBB: number[];
  rakePaid: number;
  handsSampledForCurve: number;
}

const BET_BUCKETS = [0.33, 0.5, 0.75, 1.0, 1.5];

/**
 * Incremental aggregator: O(1) memory per hand aside from a downsampled
 * equity curve, so hundreds of thousands of hands stay cheap.
 */
export class Aggregator {
  private bb: number;
  private n = 0;
  private sum = 0; // bb
  private sumSq = 0;
  private peak = 0;
  private cumulative = 0;
  private maxDD = 0;
  private grossWin = 0;
  private grossLoss = 0;
  private showdownNet = 0;
  private nonShowdownNet = 0;
  private wonHands = 0;
  private netChips = 0;
  private rake = 0;
  private byPosition = new Map<string, { hands: number; net: number }>();
  private byHole = new Map<string, { hands: number; net: number }>();
  private byDepth = new Map<string, { hands: number; net: number }>();
  private byPot = new Map<string, { hands: number; net: number }>();
  private actionCounts: Record<string, number> = { fold: 0, check: 0, call: 0, bet: 0, raise: 0, "all-in": 0 };
  private betHist = [0, 0, 0, 0, 0, 0];
  private curve: number[] = [];
  private ddCurve: number[] = [];
  private curveStride = 1;

  constructor(bigBlind: number) {
    this.bb = bigBlind;
  }

  addHand(h: HandHistory, userSeat: number, isManual: boolean): void {
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

    const player = h.players.find((p) => p.seat === userSeat);
    if (player) {
      bump(this.byPosition, player.position, res.net);
      const depthBB = player.startingStack / this.bb;
      const depthKey = depthBB < 50 ? "<50bb" : depthBB < 100 ? "50-100bb" : depthBB < 150 ? "100-150bb" : "150bb+";
      bump(this.byDepth, depthKey, res.net);
    }
    const hole = h.holeCards[userSeat];
    if (hole && hole.length === 2) bump(this.byHole, holeNotation(hole), res.net);

    // Pot type: raised / 3-bet / limped based on preflop raises.
    const preRaises = h.actions.filter((a) => a.street === "preflop" && (a.type === "raise" || a.type === "bet")).length;
    const potType = preRaises === 0 ? "limped" : preRaises === 1 ? "single-raised" : preRaises === 2 ? "3-bet" : "4-bet+";
    bump(this.byPot, potType, res.net);

    for (const a of h.actions) {
      if (a.seat !== userSeat || a.type === "post-sb" || a.type === "post-bb") continue;
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

  snapshot(): SimulationAggregates {
    const n = Math.max(this.n, 1);
    const meanBB = this.sum / n;
    const variance = n > 1 ? (this.sumSq - (this.sum * this.sum) / n) / (n - 1) : 0;
    const std = Math.sqrt(Math.max(variance, 0));
    const bb100 = meanBB * 100;
    const stdBB100 = std * 10; // std of the per-100-hand mean: std/sqrt(100)*100
    const se100 = (std / Math.sqrt(n)) * 100;
    const ciLow = bb100 - 1.96 * se100;
    const ciHigh = bb100 + 1.96 * se100;

    const toRows = (m: Map<string, { hands: number; net: number }>) =>
      Object.fromEntries(
        [...m.entries()].map(([k, v]) => [
          k,
          { hands: v.hands, net: v.net, bb100: v.hands ? (v.net / this.bb / v.hands) * 100 : 0 },
        ]),
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
      profitFactor: this.grossLoss > 0 ? this.grossWin / this.grossLoss : this.grossWin > 0 ? Infinity : 0,
      showdownNetBB: this.showdownNet,
      nonShowdownNetBB: this.nonShowdownNet,
      wonHands: this.wonHands,
      winRate: this.n ? this.wonHands / this.n : 0,
      byPosition: toRows(this.byPosition),
      byHoleCards: toRows(this.byHole),
      byStackDepth: toRows(this.byDepth),
      byPotType: toRows(this.byPot),
      actionCounts: { ...this.actionCounts },
      betSizeHistogram: [...this.betHist],
      cumulativeBB: [...this.curve],
      drawdownCurveBB: [...this.ddCurve],
      rakePaid: this.rake,
      handsSampledForCurve: this.curveStride,
    };
  }
}

function bump(m: Map<string, { hands: number; net: number }>, key: string, net: number): void {
  const v = m.get(key) ?? { hands: 0, net: 0 };
  v.hands++;
  v.net += net;
  m.set(key, v);
}

function potBeforeAction(h: HandHistory, target: { seat: number; amount: number; street: string }): number {
  let pot = 0;
  for (const a of h.actions) {
    if (a === (target as unknown)) break;
    if (a.seat === target.seat && a.amount === target.amount && a.street === target.street) break;
    pot += a.amount;
  }
  return pot;
}

/**
 * Risk-of-ruin estimate using the standard diffusion approximation:
 * RoR = exp(-2 * winrate * bankroll / variance), with winrate in bb/hand.
 * Only meaningful for positive win rates; an estimate, not a guarantee.
 */
export function riskOfRuin(bb100: number, stdPerHandBB: number, bankrollBB: number): number | null {
  const wr = bb100 / 100;
  if (wr <= 0) return 1;
  const variance = stdPerHandBB * stdPerHandBB;
  if (variance <= 0) return 0;
  const ror = Math.exp((-2 * wr * bankrollBB) / variance);
  return Math.min(1, Math.max(0, ror));
}
