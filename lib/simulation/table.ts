import { DecisionContext } from "@/types/decision";
import { HandHistory, TableConfig } from "@/types/poker";
import { AgentMemory, decideAgentAction, freshMemory } from "@/lib/agents/agent";
import { AgentProfile, adjustProfile } from "@/lib/agents/profiles";
import { HandEngine } from "@/lib/poker/engine";
import { Rng } from "@/lib/poker/rng";
import { BehavioralPolicy } from "@/lib/player-model/policy";

export interface PoolConfig {
  /** Preset profiles and their weights when drawing replacements. */
  composition: { profile: AgentProfile; weight: number }[];
  /** Mean session length in hands (geometric distribution). */
  avgSessionHands: number;
  /** 0..1 multiplier on leave probability (higher = more churn). */
  turnover: number;
  /** Leave after losing this many buy-ins (0 = disabled). */
  stopLossBuyIns: number;
  /** Leave after winning this many buy-ins (0 = disabled). */
  stopWinBuyIns: number;
  /** Probability of rebuying when felted instead of leaving. */
  rebuyProb: number;
  /** Global skill / looseness / aggression multipliers. */
  skillShift: number;
  looseness: number;
  aggressionShift: number;
}

export interface SeatedAgent {
  playerId: string;
  name: string;
  profile: AgentProfile;
  stack: number;
  buyIn: number;
  totalInvested: number;
  handsPlayed: number;
  plannedSessionHands: number;
  memory: AgentMemory;
  sittingOutHands: number;
  netAtTable: number;
}

export interface UserSeatDecider {
  decide(ctx: DecisionContext, rng: Rng): { action: { type: "fold" | "check" | "call" | "bet" | "raise"; toAmount?: number }; probs?: Record<string, number>; confidence?: number };
}

export function policyDecider(policy: BehavioralPolicy): UserSeatDecider {
  return {
    decide(ctx, rng) {
      const { action, explain } = policy.sample(ctx, rng);
      return { action, probs: explain.probs, confidence: explain.confidence };
    },
  };
}

let agentCounter = 0;
const AGENT_NAMES = [
  "Miko", "Dana", "Ravi", "Lena", "Theo", "Ines", "Kofi", "Mara", "Jude", "Nova",
  "Oren", "Pia", "Quinn", "Rhea", "Sami", "Tova", "Umar", "Vera", "Wes", "Yara",
];

/**
 * A running 6-max table session: owns seats, the button, turnover, and rebuys.
 * Deterministic given the RNG seed.
 */
export class TableSession {
  readonly config: TableConfig;
  readonly pool: PoolConfig;
  readonly rng: Rng;
  agents = new Map<number, SeatedAgent>(); // seat -> agent
  userSeat: number | null = null;
  userStack = 0;
  userBuyIns = 0;
  buttonSeat = 0;
  handNumber = 0;
  /** Explanations of simulated-user decisions, keyed by hand number. */
  userDecisionLog: { handNumber: number; street: string; probs: Record<string, number>; confidence: number; chosen: string }[] = [];

  constructor(opts: {
    config: TableConfig;
    pool: PoolConfig;
    rng: Rng;
    userBuyInBB: number;
    seatUser: boolean;
    fixedLineup?: AgentProfile[]; // exact table composition, else drawn from pool
  }) {
    this.config = opts.config;
    this.pool = opts.pool;
    this.rng = opts.rng;

    const seats = [0, 1, 2, 3, 4, 5].slice(0, this.config.maxSeats);
    let seatIdx = 0;
    if (opts.seatUser) {
      this.userSeat = seats[this.rng.int(seats.length)];
      this.userStack = opts.userBuyInBB * this.config.bigBlind;
      this.userBuyIns = 1;
    }
    const lineup = opts.fixedLineup;
    for (const seat of seats) {
      if (seat === this.userSeat) continue;
      const profile = lineup ? lineup[seatIdx % lineup.length] : this.drawProfile();
      seatIdx++;
      this.seatAgent(seat, profile);
    }
    this.buttonSeat = seats[this.rng.int(seats.length)];
  }

  private drawProfile(): AgentProfile {
    const idx = this.rng.weighted(this.pool.composition.map((c) => c.weight));
    const raw = this.pool.composition[idx]?.profile ?? this.pool.composition[0].profile;
    return adjustProfile(raw, {
      skill: Math.max(0, Math.min(1, raw.skill * this.pool.skillShift)),
      looseness: this.pool.looseness,
      aggression: this.pool.aggressionShift,
    });
  }

  private seatAgent(seat: number, profile: AgentProfile): void {
    const buyIn = Math.round(
      profile.buyInBB * this.config.bigBlind * Math.max(0.4, this.rng.gaussian(1, 0.15)),
    );
    // Geometric session length with configured mean.
    const mean = Math.max(10, this.pool.avgSessionHands);
    const planned = Math.max(5, Math.round(-mean * Math.log(1 - this.rng.next())));
    this.agents.set(seat, {
      playerId: `agent-${++agentCounter}`,
      name: `${AGENT_NAMES[this.rng.int(AGENT_NAMES.length)]} (${profile.name.split(" ")[0].toLowerCase()})`,
      profile,
      stack: buyIn,
      buyIn,
      totalInvested: buyIn,
      handsPlayed: 0,
      plannedSessionHands: planned,
      memory: freshMemory(),
      sittingOutHands: 0,
      netAtTable: 0,
    });
  }

  /** Session-management pass between hands: leave / rebuy / replace / sit out. */
  private manageTurnover(): void {
    for (const [seat, a] of [...this.agents]) {
      a.netAtTable = a.stack - a.totalInvested;
      const buyInUnit = Math.max(a.buyIn, 1);
      let leaves = false;

      if (a.stack < this.config.bigBlind) {
        // Felted: rebuy or leave.
        if (this.rng.chance(this.pool.rebuyProb)) {
          const rebuy = Math.round(a.profile.buyInBB * this.config.bigBlind);
          a.stack += rebuy;
          a.totalInvested += rebuy;
        } else {
          leaves = true;
        }
      }
      if (!leaves && a.handsPlayed >= a.plannedSessionHands) leaves = this.rng.chance(0.5 * this.pool.turnover + 0.25);
      if (!leaves && this.pool.stopLossBuyIns > 0 && -a.netAtTable >= this.pool.stopLossBuyIns * buyInUnit) {
        leaves = this.rng.chance(0.8);
      }
      if (!leaves && this.pool.stopWinBuyIns > 0 && a.netAtTable >= this.pool.stopWinBuyIns * buyInUnit) {
        leaves = this.rng.chance(0.4);
      }
      // Small random churn.
      if (!leaves) leaves = this.rng.chance(0.002 * this.pool.turnover);

      if (leaves) {
        this.agents.delete(seat);
        // Replacement arrives after a short delay ~ immediately for simplicity of pacing.
        this.seatAgent(seat, this.drawProfile());
      } else if (a.sittingOutHands > 0) {
        a.sittingOutHands--;
      } else if (this.rng.chance(0.003)) {
        a.sittingOutHands = 1 + this.rng.int(4);
      }
    }
    // Keep the user topped up? No — the user rebuys full buy-in when felted (tracked).
    if (this.userSeat !== null && this.userStack < this.config.bigBlind) {
      this.userStack += 100 * this.config.bigBlind;
      this.userBuyIns++;
    }
  }

  private rotateButton(participants: number[]): void {
    const sorted = [...participants].sort((a, b) => a - b);
    const after = sorted.filter((s) => s > this.buttonSeat);
    this.buttonSeat = after.length ? after[0] : sorted[0];
  }

  /**
   * Play one hand. If `userDecider` is provided the user's seat is played by
   * it (the learned model). If `manualActionProvider` is given, it is awaited
   * for user decisions instead (manual calibration play is driven externally
   * and does not use this method).
   */
  playHand(userDecider: UserSeatDecider | null): HandHistory | null {
    const begun = this.beginHand(userDecider !== null, userDecider !== null ? "You (model)" : "You");
    if (!begun) return null;
    const { engine, tracker } = begun;

    let guard = 0;
    while (!engine.complete && guard++ < 500) {
      const seat = engine.currentSeat!;
      const ctx = tracker.buildContext(seat);
      if (seat === this.userSeat && userDecider) {
        const { action, probs, confidence } = userDecider.decide(ctx, this.rng);
        this.userDecisionLog.push({
          handNumber: this.handNumber,
          street: ctx.street,
          probs: probs ?? {},
          confidence: confidence ?? 0,
          chosen: action.type,
        });
        tracker.apply(seat, action);
      } else {
        const agent = this.agents.get(seat)!;
        const action = decideAgentAction(agent.profile, ctx, this.rng, agent.memory);
        tracker.apply(seat, action);
      }
    }
    if (!engine.complete) throw new Error("Hand failed to complete (guard tripped)");
    return this.finishHand(engine);
  }

  /** Start a hand and return the engine + tracker, or null if too few players. */
  beginHand(includeUser: boolean, userName = "You", manual = false): { engine: HandEngine; tracker: ContextTracker } | null {
    this.manageTurnover();
    const participants: { seat: number; playerId: string; name: string; stack: number }[] = [];
    for (const [seat, a] of this.agents) {
      if (a.sittingOutHands > 0 || a.stack < this.config.bigBlind) continue;
      participants.push({ seat, playerId: a.playerId, name: a.name, stack: a.stack });
    }
    if (this.userSeat !== null && includeUser) {
      participants.push({ seat: this.userSeat, playerId: "user", name: userName, stack: this.userStack });
    }
    if (participants.length < 2) return null;

    this.handNumber++;
    this.rotateButton(participants.map((p) => p.seat));

    const engine = new HandEngine({
      players: participants,
      buttonSeat: this.buttonSeat,
      config: this.config,
      rng: this.rng,
      handNumber: this.handNumber,
      manualSeat: manual ? this.userSeat : null,
    });
    return { engine, tracker: new ContextTracker(engine) };
  }

  /** Settle a completed engine back into the session. */
  finishHand(engine: HandEngine): HandHistory {
    const history = engine.getHistory();

    // Write stacks back and update agent memories.
    for (const p of engine.players) {
      if (p.seat === this.userSeat) {
        this.userStack = p.stack;
      } else {
        const a = this.agents.get(p.seat);
        if (a) {
          a.stack = p.stack;
          a.handsPlayed++;
          a.memory.handsObserved++;
        }
      }
    }
    // Table-level fold/call observation for adaptive agents.
    for (const act of history.actions) {
      for (const a of this.agents.values()) {
        if (act.type === "fold") a.memory.observedFolds++;
        else if (act.type === "call") a.memory.observedCalls++;
      }
    }
    return history;
  }
}

/** Builds DecisionContexts from a live engine and applies actions through it. */
export class ContextTracker {
  private preflopRaises = 0;
  private lastPreflopAggressor: number | null = null;
  private raisesThisStreet = 0;
  private lastStreet = "preflop";

  constructor(private engine: HandEngine) {}

  buildContext(seat: number): DecisionContext {
    const e = this.engine;
    if (e.street !== this.lastStreet) {
      this.raisesThisStreet = 0;
      this.lastStreet = e.street;
    }
    const p = e.players.find((x) => x.seat === seat)!;
    const legal = e.getLegalActions(seat);
    const others = e.activePlayers.filter((x) => x.seat !== seat);
    const maxOtherStack = Math.max(0, ...others.map((x) => x.stack + x.streetCommitted));
    const effective = Math.min(p.stack + p.streetCommitted, maxOtherStack);
    const pot = e.potSize;
    return {
      handNumber: e.handNumber,
      street: e.street,
      position: e.positionOf(seat),
      holeCards: p.holeCards ?? [],
      board: e.board.slice(),
      potSize: pot,
      betFaced: legal.callAmount,
      effectiveStack: effective,
      stackToPotRatio: pot > 0 ? effective / pot : effective,
      activePlayers: e.activePlayers.length,
      numRaisesThisStreet: e.street === "preflop" ? this.preflopRaises : this.raisesThisStreet,
      facedRaisePreflop: e.street === "preflop" && this.preflopRaises > 0,
      isPreflopAggressor: this.lastPreflopAggressor === seat,
      legal,
      bigBlind: e.config.bigBlind,
    };
  }

  apply(seat: number, action: { type: "fold" | "check" | "call" | "bet" | "raise"; toAmount?: number }): void {
    // Sanitize illegal samples defensively (agents can produce edge sizes).
    const legal = this.engine.getLegalActions(seat);
    let a = action;
    if (!legal.types.includes(a.type)) {
      a = legal.types.includes("check") ? { type: "check" } : { type: "fold" };
    }
    if ((a.type === "bet" || a.type === "raise") && a.toAmount !== undefined) {
      const min = a.type === "bet" ? legal.minBet : legal.minRaiseTo;
      a = { type: a.type, toAmount: Math.min(Math.max(a.toAmount, min), legal.maxBetTo) };
    }
    if (a.type === "raise" || (a.type === "bet" && this.engine.street === "preflop")) {
      if (this.engine.street === "preflop") {
        this.preflopRaises++;
        this.lastPreflopAggressor = seat;
      } else {
        this.raisesThisStreet++;
      }
    } else if (a.type === "bet") {
      this.raisesThisStreet++;
    }
    this.engine.applyAction(seat, a);
  }
}
