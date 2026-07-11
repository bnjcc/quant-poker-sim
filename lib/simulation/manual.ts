import { ChosenAction, DecisionContext, RecordedDecision } from "@/types/decision";
import { HandHistory, TableConfig } from "@/types/poker";
import { decideAgentAction } from "@/lib/agents/agent";
import { HandEngine } from "@/lib/poker/engine";
import { Rng } from "@/lib/poker/rng";
import { ContextTracker, PoolConfig, TableSession } from "./table";

export type ManualStep =
  | { kind: "awaiting-user"; context: DecisionContext; engine: HandEngine }
  | { kind: "hand-complete"; history: HandHistory; engine: HandEngine }
  | { kind: "session-complete" };

/**
 * Drives the manual calibration session: agents act automatically, the loop
 * pauses whenever it's the user's turn, and every user decision is recorded
 * with its full context for model training.
 */
export class ManualSession {
  readonly session: TableSession;
  readonly targetHands: number;
  readonly decisions: RecordedDecision[] = [];
  readonly histories: HandHistory[] = [];
  readonly userSeatByHand = new Map<number, number>();
  private current: { engine: HandEngine; tracker: ContextTracker } | null = null;
  handsPlayed = 0;

  constructor(opts: {
    config: TableConfig;
    pool: PoolConfig;
    seed: string;
    targetHands: number;
    userBuyInBB: number;
  }) {
    this.targetHands = opts.targetHands;
    this.session = new TableSession({
      config: opts.config,
      pool: opts.pool,
      rng: new Rng(opts.seed),
      userBuyInBB: opts.userBuyInBB,
      seatUser: true,
    });
  }

  get userSeat(): number {
    return this.session.userSeat!;
  }

  /** Advance until the user must act or the hand/session ends. */
  step(): ManualStep {
    if (this.handsPlayed >= this.targetHands) return { kind: "session-complete" };
    if (!this.current) {
      const begun = this.session.beginHand(true, "You", true);
      if (!begun) return { kind: "session-complete" };
      this.current = begun;
      this.userSeatByHand.set(begun.engine.handNumber, this.userSeat);
    }
    const { engine, tracker } = this.current;
    let guard = 0;
    while (!engine.complete && guard++ < 500) {
      const seat = engine.currentSeat!;
      const ctx = tracker.buildContext(seat);
      if (seat === this.userSeat) {
        return { kind: "awaiting-user", context: ctx, engine };
      }
      const agent = this.session.agents.get(seat)!;
      const action = decideAgentAction(agent.profile, ctx, this.session.rng, agent.memory);
      tracker.apply(seat, action);
    }
    const history = this.session.finishHand(engine);
    this.histories.push(history);
    this.handsPlayed++;
    this.current = null;
    return { kind: "hand-complete", history, engine };
  }

  /** Apply the user's chosen action, recording full context. */
  submitUserAction(context: DecisionContext, action: ChosenAction): void {
    if (!this.current) throw new Error("No hand in progress");
    const potFraction =
      (action.type === "bet" || action.type === "raise") && action.toAmount !== undefined && context.potSize > 0
        ? (action.toAmount - (action.type === "raise" ? context.legal.callAmount : 0)) / context.potSize
        : null;
    this.decisions.push({ context, action, potFraction });
    this.current.tracker.apply(this.userSeat, action);
  }
}
