import { ALL_STARTING_HANDS, isStartingHandNotation } from "@/lib/poker/range";
import { Rng } from "@/lib/poker/rng";
import { CalibrationDirector, CalibrationRangeSampler } from "./calibration";
import { TableSession } from "./table";
import {
  clampDecisionTime,
  OPPONENT_LIVE_DELAY_MS,
  timeoutAction,
} from "./timing";
/**
 * Drives the manual calibration session: agents act automatically, the loop
 * pauses whenever it's the user's turn, and every user decision is recorded
 * with its full context for model training.
 */
export class ManualSession {
  session;
  targetHands;
  decisions = [];
  histories = [];
  userSeatByHand = new Map();
  startingHands;
  startingHandsByPosition;
  current = null;
  pendingOpponent = null;
  checkFoldHandNumber = null;
  handsPlayed = 0;
  director;
  rangeSampler;
  constructor(opts) {
    this.targetHands = opts.targetHands;
    const startingHands = [...new Set(opts.startingHands ?? [])];
    if (opts.startingHands && startingHands.length === 0)
      throw new Error("Choose at least one starting hand");
    if (startingHands.some((hand) => !isStartingHandNotation(hand)))
      throw new Error("Starting-hand range contains invalid notation");
    this.startingHands = opts.startingHands ? startingHands : null;
    if (opts.startingHandsByPosition) {
      const entries = Object.entries(opts.startingHandsByPosition);
      if (entries.length === 0)
        throw new Error("Choose at least one positional starting-hand range");
      this.startingHandsByPosition = Object.fromEntries(
        entries.map(([position, range]) => {
          const unique = [...new Set(range ?? [])];
          if (unique.length === 0)
            throw new Error(
              `Choose at least one starting hand for ${position}`,
            );
          if (unique.some((hand) => !isStartingHandNotation(hand))) {
            throw new Error(
              `Starting-hand range for ${position} contains invalid notation`,
            );
          }
          return [position, unique];
        }),
      );
    } else {
      this.startingHandsByPosition = null;
    }
    this.session = new TableSession({
      config: opts.config,
      pool: opts.pool,
      rng: new Rng(opts.seed),
      userBuyInBB: opts.userBuyInBB,
      seatUser: true,
      fixedLineup: opts.fixedLineup,
    });
    this.director = new CalibrationDirector(this.session.userSeat);
    this.rangeSampler = new CalibrationRangeSampler(this.session.rng);
  }
  get userSeat() {
    return this.session.userSeat;
  }
  /** Advance until the user must act or the hand/session ends. */
  step(paceOpponents = false) {
    if (this.handsPlayed >= this.targetHands)
      return { kind: "session-complete" };
    if (this.pendingOpponent && this.current) {
      return {
        kind: "opponent-acting",
        seat: this.pendingOpponent.seat,
        decisionTimeMs: this.pendingOpponent.timing.decisionTimeMs,
        liveDelayMs: OPPONENT_LIVE_DELAY_MS,
        callAmount: this.pendingOpponent.callAmount,
        engine: this.current.engine,
      };
    }
    if (!this.current) {
      const cardsForRange = (range, key) =>
        this.rangeSampler.nextCards(
          range ?? ALL_STARTING_HANDS.map((hand) => hand.notation),
          key,
        );
      const userHoleCards = this.startingHandsByPosition
        ? (position) => {
            const range = this.startingHandsByPosition[position];
            if (!range) {
              throw new Error(`No starting-hand range was set for ${position}`);
            }
            return cardsForRange(range, position);
          }
        : cardsForRange(this.startingHands, "shared");
      const begun = this.session.beginHand(true, "You", true, userHoleCards);
      if (!begun) return { kind: "session-complete" };
      this.current = begun;
      this.director.beginHand(begun.engine);
      this.userSeatByHand.set(begun.engine.handNumber, this.userSeat);
    }
    const { engine, tracker } = this.current;
    let guard = 0;
    while (!engine.complete && guard++ < 500) {
      const seat = engine.currentSeat;
      const ctx = tracker.buildContext(seat);
      if (seat === this.userSeat) {
        if (this.checkFoldHandNumber === engine.handNumber) {
          // Automatic pre-actions are intentional, not timeouts. Omit timing so
          // they do not teach the policy an artificial 0ms timing tell.
          this.recordUserAction(ctx, timeoutAction(ctx));
          continue;
        }
        return { kind: "awaiting-user", context: ctx, engine };
      }
      const agent = this.session.agents.get(seat);
      const proposed = this.director.decide(
        agent.profile,
        ctx,
        this.session.rng,
        agent.memory,
        engine,
        seat,
      );
      const timing = this.director.sampleTiming(
        agent.profile,
        ctx,
        proposed,
        this.session.rng,
      );
      const action = timing.timedOut ? timeoutAction(ctx) : proposed;
      if (paceOpponents) {
        this.pendingOpponent = {
          seat,
          action,
          timing,
          callAmount: ctx.legal.callAmount,
        };
        return {
          kind: "opponent-acting",
          seat,
          decisionTimeMs: timing.decisionTimeMs,
          liveDelayMs: OPPONENT_LIVE_DELAY_MS,
          callAmount: ctx.legal.callAmount,
          engine,
        };
      }
      tracker.apply(seat, action, timing);
    }
    const history = this.session.finishHand(engine);
    this.histories.push(history);
    this.handsPlayed++;
    this.checkFoldHandNumber = null;
    this.current = null;
    return { kind: "hand-complete", history, engine };
  }
  /** Complete a paced opponent action after its brief live preview. */
  completeOpponentAction() {
    if (!this.current || !this.pendingOpponent)
      throw new Error("No opponent action is pending");
    const pending = this.pendingOpponent;
    this.pendingOpponent = null;
    this.current.tracker.apply(pending.seat, pending.action, pending.timing);
  }
  /** Apply the user's chosen action, recording full context. */
  submitUserAction(context, action, responseTimeMs, timedOut = false) {
    if (!this.current) throw new Error("No hand in progress");
    this.recordUserAction(context, action, responseTimeMs, timedOut);
  }
  /** Check when free and fold to any wager for the rest of this hand. */
  submitCheckFoldForHand(context, responseTimeMs) {
    if (!this.current) throw new Error("No hand in progress");
    this.checkFoldHandNumber = this.current.engine.handNumber;
    this.recordUserAction(
      context,
      timeoutAction(context),
      responseTimeMs,
      false,
    );
  }
  recordUserAction(context, action, responseTimeMs, timedOut = false) {
    if (!this.current) throw new Error("No hand in progress");
    const chosen = timedOut ? timeoutAction(context) : action;
    const potFraction =
      (chosen.type === "bet" || chosen.type === "raise") &&
      chosen.toAmount !== undefined &&
      context.potSize > 0
        ? (chosen.toAmount -
            (chosen.type === "raise" ? context.legal.callAmount : 0)) /
          context.potSize
        : null;
    const elapsed =
      responseTimeMs === undefined
        ? undefined
        : clampDecisionTime(responseTimeMs);
    this.decisions.push({
      context,
      action: chosen,
      potFraction,
      ...(elapsed === undefined ? {} : { responseTimeMs: elapsed, timedOut }),
    });
    this.current.tracker.apply(
      this.userSeat,
      chosen,
      elapsed === undefined ? undefined : { decisionTimeMs: elapsed, timedOut },
    );
  }
}
