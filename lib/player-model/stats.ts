import { HandHistory } from "@/types/poker";
import { RecordedDecision } from "@/types/decision";

export interface FreqStat {
  /** Smoothed frequency estimate (Laplace-smoothed). */
  value: number;
  /** Raw numerator / denominator. */
  numerator: number;
  denominator: number;
  /** Wilson 95% interval. */
  ciLow: number;
  ciHigh: number;
  /** 0..1 confidence heuristic based on sample size. */
  confidence: number;
}

const Z = 1.96;

export function freqStat(numerator: number, denominator: number, prior = 0.5, priorWeight = 2): FreqStat {
  const value = (numerator + prior * priorWeight) / (denominator + priorWeight);
  if (denominator === 0) {
    return { value, numerator, denominator, ciLow: 0, ciHigh: 1, confidence: 0 };
  }
  const p = numerator / denominator;
  const n = denominator;
  const denom = 1 + (Z * Z) / n;
  const centre = (p + (Z * Z) / (2 * n)) / denom;
  const half = (Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) / denom;
  // Confidence saturates around 100 observations of the opportunity.
  const confidence = Math.min(1, Math.sqrt(n / 100));
  return {
    value,
    numerator,
    denominator,
    ciLow: Math.max(0, centre - half),
    ciHigh: Math.min(1, centre + half),
    confidence,
  };
}

export interface PlayerTendencies {
  hands: number;
  vpip: FreqStat;
  pfr: FreqStat;
  threeBet: FreqStat;
  foldToThreeBet: FreqStat;
  limp: FreqStat;
  aggressionFactor: number; // (bets+raises)/calls
  aggressionFrequency: FreqStat; // (bets+raises)/(bets+raises+calls+folds+checks facing decision)
  cbet: FreqStat;
  foldToCbet: FreqStat;
  checkRaise: FreqStat;
  riverCall: FreqStat;
  wentToShowdown: FreqStat;
  wonAtShowdown: FreqStat;
  positionalVpip: Record<string, FreqStat>;
  /** Mean/std of bet size as fraction of pot. */
  betSizing: { mean: number; std: number; samples: number[] };
  bluffProxy: FreqStat; // bets/raises later streets with weak showdown value — heuristic
}

/**
 * Compute tendency statistics from recorded decisions + hand results.
 * All values are estimates; small samples produce wide intervals by design.
 */
export function computeTendencies(
  decisions: RecordedDecision[],
  hands: HandHistory[],
  userSeatByHand: Map<number, number>,
): PlayerTendencies {
  // Group decisions by hand.
  const byHand = new Map<number, RecordedDecision[]>();
  for (const d of decisions) {
    const list = byHand.get(d.context.handNumber) ?? [];
    list.push(d);
    byHand.set(d.context.handNumber, list);
  }

  let vpipN = 0, vpipD = 0, pfrN = 0, pfrD = 0;
  let tbN = 0, tbD = 0, fttbN = 0, fttbD = 0, limpN = 0, limpD = 0;
  let betsRaises = 0, calls = 0, passive = 0;
  let cbetN = 0, cbetD = 0, ftcN = 0, ftcD = 0, crN = 0, crD = 0, rcN = 0, rcD = 0;
  const posVpip = new Map<string, { n: number; d: number }>();
  const sizings: number[] = [];
  let bluffN = 0, bluffD = 0;

  for (const [handNo, ds] of byHand) {
    const pre = ds.filter((d) => d.context.street === "preflop");
    if (pre.length > 0) {
      vpipD++;
      pfrD++;
      const pos = pre[0].context.position;
      const pv = posVpip.get(pos) ?? { n: 0, d: 0 };
      pv.d++;
      const voluntary = pre.some(
        (d) => d.action.type === "call" || d.action.type === "bet" || d.action.type === "raise",
      );
      // BB checking their option is not VPIP.
      if (voluntary) {
        vpipN++;
        pv.n++;
      }
      posVpip.set(pos, pv);
      if (pre.some((d) => d.action.type === "raise" || d.action.type === "bet")) pfrN++;

      // First voluntary preflop entry into an unraised pot: limp vs raise.
      const firstIn = pre.find((d) => !d.context.facedRaisePreflop && d.action.type !== "fold" && d.action.type !== "check");
      if (firstIn) {
        limpD++;
        if (firstIn.action.type === "call") limpN++;
      }

      // 3-bet opportunity: facing exactly one raise.
      const face1 = pre.filter((d) => d.context.facedRaisePreflop && d.context.numRaisesThisStreet === 1);
      for (const d of face1) {
        tbD++;
        if (d.action.type === "raise") tbN++;
      }
      // Facing a 3-bet after having raised.
      const face3b = pre.filter((d) => d.context.numRaisesThisStreet >= 2 && d.context.isPreflopAggressor);
      for (const d of face3b) {
        fttbD++;
        if (d.action.type === "fold") fttbN++;
      }
    }

    for (const d of ds) {
      if (d.action.type === "bet" || d.action.type === "raise") {
        betsRaises++;
        if (d.potFraction !== null && d.context.street !== "preflop") sizings.push(d.potFraction);
      } else if (d.action.type === "call") calls++;
      else passive++;

      if (d.context.street === "flop" && d.context.isPreflopAggressor && d.context.betFaced === 0) {
        cbetD++;
        if (d.action.type === "bet") cbetN++;
      }
      if (d.context.street === "flop" && !d.context.isPreflopAggressor && d.context.betFaced > 0) {
        ftcD++;
        if (d.action.type === "fold") ftcN++;
      }
      if (d.context.betFaced > 0 && d.context.street !== "preflop") {
        // Check-raise opportunity approximated: facing a bet after checking is possible.
        crD++;
        if (d.action.type === "raise") crN++;
      }
      if (d.context.street === "river" && d.context.betFaced > 0) {
        rcD++;
        if (d.action.type === "call") rcN++;
      }
      if ((d.context.street === "turn" || d.context.street === "river") && (d.action.type === "bet" || d.action.type === "raise")) {
        bluffD++;
      }
    }
    void handNo;
  }

  // Showdown stats from hand histories.
  let wtsdN = 0, wtsdD = 0, wsdN = 0, wsdD = 0;
  for (const h of hands) {
    const seat = userSeatByHand.get(h.handNumber);
    if (seat === undefined) continue;
    const res = h.results.find((r) => r.seat === seat);
    if (!res) continue;
    const sawFlop = h.board.length >= 3 && h.actions.some((a) => a.seat === seat && a.street !== "preflop");
    if (sawFlop) {
      wtsdD++;
      if (res.showedDown) wtsdN++;
    }
    if (res.showedDown) {
      wsdD++;
      if (res.wonAmount > 0) wsdN++;
    }
    // Bluff proxy: aggressive late-street action that lost at showdown with weak hand.
    if (res.showedDown && res.handRank && res.handRank.category === "high-card") {
      const lateAggr = h.actions.some(
        (a) => a.seat === seat && (a.street === "turn" || a.street === "river") && (a.type === "bet" || a.type === "raise"),
      );
      if (lateAggr) bluffN++;
    }
  }

  const mean = sizings.length ? sizings.reduce((a, b) => a + b, 0) / sizings.length : 0.66;
  const std = sizings.length > 1
    ? Math.sqrt(sizings.reduce((a, b) => a + (b - mean) ** 2, 0) / (sizings.length - 1))
    : 0.2;

  return {
    hands: byHand.size,
    vpip: freqStat(vpipN, vpipD, 0.25),
    pfr: freqStat(pfrN, pfrD, 0.18),
    threeBet: freqStat(tbN, tbD, 0.07),
    foldToThreeBet: freqStat(fttbN, fttbD, 0.55),
    limp: freqStat(limpN, limpD, 0.1),
    aggressionFactor: calls > 0 ? betsRaises / calls : betsRaises,
    aggressionFrequency: freqStat(betsRaises, betsRaises + calls + passive, 0.3),
    cbet: freqStat(cbetN, cbetD, 0.6),
    foldToCbet: freqStat(ftcN, ftcD, 0.45),
    checkRaise: freqStat(crN, crD, 0.08),
    riverCall: freqStat(rcN, rcD, 0.4),
    wentToShowdown: freqStat(wtsdN, wtsdD, 0.27),
    wonAtShowdown: freqStat(wsdN, wsdD, 0.5),
    positionalVpip: Object.fromEntries(
      [...posVpip.entries()].map(([pos, { n, d }]) => [pos, freqStat(n, d, 0.25)]),
    ),
    betSizing: { mean, std, samples: sizings },
    bluffProxy: freqStat(bluffN, Math.max(bluffD, 1), 0.15),
  };
}
