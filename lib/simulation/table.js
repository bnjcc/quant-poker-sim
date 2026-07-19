import {
  decideAgentAction,
  freshMemory,
  sampleAgentDecisionTiming,
} from "@/lib/agents/agent";
import { adjustProfile } from "@/lib/agents/profiles";
import { HandEngine } from "@/lib/poker/engine";
import { POSITIONS_BY_COUNT } from "@/types/poker";
import { decisionTimingBucket, timeoutAction } from "./timing";

function positionForSeat(seats, buttonSeat, seat) {
  const sorted = [...seats].sort((a, b) => a - b);
  const buttonIndex = sorted.indexOf(buttonSeat);
  const order = [...sorted.slice(buttonIndex), ...sorted.slice(0, buttonIndex)];
  return POSITIONS_BY_COUNT[sorted.length]?.[order.indexOf(seat)];
}
export function policyDecider(policy) {
  return {
    decide(ctx, rng) {
      const { action, explain, decisionTimeMs, timedOut } = policy.sample(
        ctx,
        rng,
      );
      return {
        action,
        probs: explain.probs,
        confidence: explain.confidence,
        decisionTimeMs,
        timedOut,
      };
    },
  };
}
/**
 * Keep every policy and bot proposal inside the engine's current legal action
 * set. The engine remains the final rules authority; this conversion preserves
 * the intent of a passive action when the available wording changes (for
 * example, a stale "check" proposal becomes a call when facing a bet).
 */
export function normalizeActionToLegal(action, legal) {
  let type = action.type;
  if (!legal.types.includes(type)) {
    if (type === "check" && legal.types.includes("call")) type = "call";
    else if (type === "call" && legal.types.includes("check")) type = "check";
    else if (type === "bet" && legal.types.includes("raise")) type = "raise";
    else if (type === "raise" && legal.types.includes("bet")) type = "bet";
    else if (legal.types.includes("fold")) type = "fold";
    else if (legal.types.includes("check")) type = "check";
    else if (legal.types.includes("call")) type = "call";
    else throw new Error("No legal action is available for the acting seat");
  }
  if (type === "bet" || type === "raise") {
    const minimum = type === "bet" ? legal.minBet : legal.minRaiseTo;
    const requested = Number.isFinite(action.toAmount)
      ? action.toAmount
      : minimum;
    return {
      type,
      toAmount: Math.min(Math.max(requested, minimum), legal.maxBetTo),
    };
  }
  return { type };
}
let agentCounter = 0;
const AGENT_NAMES = [
  "Miko",
  "Dana",
  "Ravi",
  "Lena",
  "Theo",
  "Ines",
  "Kofi",
  "Mara",
  "Jude",
  "Nova",
  "Oren",
  "Pia",
  "Quinn",
  "Rhea",
  "Sami",
  "Tova",
  "Umar",
  "Vera",
  "Wes",
  "Yara",
];
/**
 * A running 2-to-9-player table session: owns seats, the button, turnover, and rebuys.
 * Deterministic given the RNG seed.
 */
export class TableSession {
  config;
  pool;
  rng;
  agents = new Map(); // seat -> agent
  userSeat = null;
  userStack = 0;
  userBuyIns = 0;
  buttonSeat = 0;
  handNumber = 0;
  fixedLineup = false;
  /** Explanations of simulated-user decisions, keyed by hand number. */
  userDecisionLog = [];
  /** Fixed real-user strategy models used by multiplayer simulations. */
  policyPlayers = new Map(); // seat -> participant state
  participantSeatById = new Map();
  participantDecisionLogs = new Map();
  primaryParticipantId = null;
  constructor(opts) {
    this.config = opts.config;
    this.pool = opts.pool;
    this.rng = opts.rng;
    const seats = Array.from(
      { length: this.config.maxSeats },
      (_, seat) => seat,
    );
    let seatIdx = 0;
    const configuredPolicyPlayers = opts.policyPlayers ?? [];
    if (configuredPolicyPlayers.length > seats.length) {
      throw new Error(
        "More real-user strategies were supplied than table seats.",
      );
    }
    if (configuredPolicyPlayers.length > 0) {
      const availableSeats = [...seats];
      configuredPolicyPlayers.forEach((participant, participantIndex) => {
        const selectedIndex = this.rng.int(availableSeats.length);
        const seat = availableSeats.splice(selectedIndex, 1)[0];
        const buyInBB = participant.buyInBB ?? opts.userBuyInBB;
        const state = {
          ...participant,
          seat,
          playerId: participant.playerId ?? `user:${participant.participantId}`,
          name: participant.name ?? `@${participant.username}`,
          buyInBB,
          stack: buyInBB * this.config.bigBlind,
          buyIns: 1,
        };
        this.policyPlayers.set(seat, state);
        this.participantSeatById.set(participant.participantId, seat);
        this.participantDecisionLogs.set(participant.participantId, []);
        if (participantIndex === 0) {
          this.primaryParticipantId = participant.participantId;
          this.userSeat = seat;
          this.userStack = state.stack;
          this.userBuyIns = 1;
        }
      });
    } else if (opts.seatUser) {
      this.userSeat = seats[this.rng.int(seats.length)];
      this.userStack = opts.userBuyInBB * this.config.bigBlind;
      this.userBuyIns = 1;
    }
    const lineup = opts.fixedLineup;
    this.fixedLineup = Boolean(lineup);
    for (const seat of seats) {
      if (seat === this.userSeat || this.policyPlayers.has(seat)) continue;
      if (opts.fillWithBots === false) continue;
      const profile = lineup
        ? lineup[seatIdx % lineup.length]
        : this.drawProfile();
      seatIdx++;
      this.seatAgent(seat, profile);
    }
    this.buttonSeat = seats[this.rng.int(seats.length)];
  }
  drawProfile() {
    const idx = this.rng.weighted(this.pool.composition.map((c) => c.weight));
    const raw =
      this.pool.composition[idx]?.profile ?? this.pool.composition[0].profile;
    return adjustProfile(raw, {
      skill: Math.max(0, Math.min(1, raw.skill * this.pool.skillShift)),
      looseness: this.pool.looseness,
      aggression: this.pool.aggressionShift,
    });
  }
  seatAgent(seat, profile) {
    const buyIn = Math.round(
      profile.buyInBB *
        this.config.bigBlind *
        Math.max(0.4, this.rng.gaussian(1, 0.15)),
    );
    // Geometric session length with configured mean.
    const mean = Math.max(10, this.pool.avgSessionHands);
    const planned = Math.max(
      5,
      Math.round(-mean * Math.log(1 - this.rng.next())),
    );
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
  manageTurnover() {
    for (const [seat, a] of [...this.agents]) {
      a.netAtTable = a.stack - a.totalInvested;
      if (this.fixedLineup) {
        a.sittingOutHands = 0;
        if (a.stack < this.config.bigBlind) {
          const rebuy = Math.round(a.profile.buyInBB * this.config.bigBlind);
          a.stack += rebuy;
          a.totalInvested += rebuy;
        }
        continue;
      }
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
      if (!leaves && a.handsPlayed >= a.plannedSessionHands)
        leaves = this.rng.chance(0.5 * this.pool.turnover + 0.25);
      if (
        !leaves &&
        this.pool.stopLossBuyIns > 0 &&
        -a.netAtTable >= this.pool.stopLossBuyIns * buyInUnit
      ) {
        leaves = this.rng.chance(0.8);
      }
      if (
        !leaves &&
        this.pool.stopWinBuyIns > 0 &&
        a.netAtTable >= this.pool.stopWinBuyIns * buyInUnit
      ) {
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
    for (const player of this.policyPlayers.values()) {
      if (player.stack >= this.config.bigBlind) continue;
      player.stack += player.buyInBB * this.config.bigBlind;
      player.buyIns++;
    }
    if (this.primaryParticipantId) {
      const primarySeat = this.participantSeatById.get(
        this.primaryParticipantId,
      );
      const primary = this.policyPlayers.get(primarySeat);
      if (primary) {
        this.userStack = primary.stack;
        this.userBuyIns = primary.buyIns;
      }
    } else if (
      this.userSeat !== null &&
      this.userStack < this.config.bigBlind
    ) {
      // Legacy single-user runs rebuy at the historical fixed 100bb amount.
      this.userStack += 100 * this.config.bigBlind;
      this.userBuyIns++;
    }
  }
  rotateButton(participants) {
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
  playHand(userDecider) {
    const hasPolicyPlayers = this.policyPlayers.size > 0;
    const begun = this.beginHand(
      hasPolicyPlayers || userDecider !== null,
      userDecider !== null ? "You (model)" : "You",
    );
    if (!begun) return null;
    const { engine, tracker } = begun;
    let guard = 0;
    while (!engine.complete && guard++ < 500) {
      const seat = engine.currentSeat;
      const ctx = tracker.buildContext(seat);
      const policyPlayer = this.policyPlayers.get(seat);
      const activeDecider =
        policyPlayer?.decider ??
        (seat === this.userSeat && userDecider ? userDecider : null);
      if (activeDecider) {
        const decision = activeDecider.decide(ctx, this.rng);
        const timing = {
          decisionTimeMs: decision.decisionTimeMs ?? 0,
          timedOut: Boolean(decision.timedOut),
        };
        const action = timing.timedOut ? timeoutAction(ctx) : decision.action;
        const actionIndex = engine.actions.length;
        const potFraction =
          (action.type === "bet" || action.type === "raise") &&
          action.toAmount !== undefined &&
          ctx.potSize > 0
            ? (action.toAmount -
                (action.type === "raise" ? ctx.legal.callAmount : 0)) /
              ctx.potSize
            : null;
        const logEntry = {
          handNumber: this.handNumber,
          street: ctx.street,
          probs: decision.probs ?? {},
          confidence: decision.confidence ?? 0,
          chosen: action.type,
          actionIndex,
          context: ctx,
          toAmount: action.toAmount,
          potFraction,
          decisionTimeMs: timing.decisionTimeMs,
          timedOut: timing.timedOut,
          opponentTiming: decisionTimingBucket(
            ctx.lastOpponentAction?.decisionTimeMs,
          ),
        };
        if (policyPlayer) {
          this.participantDecisionLogs
            .get(policyPlayer.participantId)
            ?.push(logEntry);
          if (policyPlayer.participantId === this.primaryParticipantId) {
            this.userDecisionLog.push(logEntry);
          }
        } else {
          this.userDecisionLog.push(logEntry);
        }
        tracker.apply(seat, action, timing);
      } else {
        const agent = this.agents.get(seat);
        const proposed = decideAgentAction(
          agent.profile,
          ctx,
          this.rng,
          agent.memory,
        );
        const timing = sampleAgentDecisionTiming(
          agent.profile,
          ctx,
          proposed,
          this.rng,
        );
        tracker.apply(
          seat,
          timing.timedOut ? timeoutAction(ctx) : proposed,
          timing,
        );
      }
    }
    if (!engine.complete)
      throw new Error("Hand failed to complete (guard tripped)");
    return this.finishHand(engine);
  }
  /** Start a hand and return the engine + tracker, or null if too few players. */
  beginHand(includeUser, userName = "You", manual = false, userHoleCards) {
    this.manageTurnover();
    const participants = [];
    for (const [seat, a] of this.agents) {
      if (a.sittingOutHands > 0 || a.stack < this.config.bigBlind) continue;
      participants.push({
        seat,
        playerId: a.playerId,
        name: a.name,
        stack: a.stack,
      });
    }
    if (includeUser && this.policyPlayers.size > 0) {
      for (const [seat, player] of this.policyPlayers) {
        participants.push({
          seat,
          playerId: player.playerId,
          name: `${player.name} (model)`,
          stack: player.stack,
        });
      }
    } else if (this.userSeat !== null && includeUser) {
      participants.push({
        seat: this.userSeat,
        playerId: "user",
        name: userName,
        stack: this.userStack,
      });
    }
    if (participants.length < 2) return null;
    this.handNumber++;
    this.rotateButton(participants.map((p) => p.seat));
    const resolvedUserHoleCards =
      typeof userHoleCards === "function" && this.userSeat !== null
        ? userHoleCards(
            positionForSeat(
              participants.map((participant) => participant.seat),
              this.buttonSeat,
              this.userSeat,
            ),
          )
        : userHoleCards;
    const engine = new HandEngine({
      players: participants,
      buttonSeat: this.buttonSeat,
      config: this.config,
      rng: this.rng,
      handNumber: this.handNumber,
      manualSeat: manual ? this.userSeat : null,
      forcedHoleCards:
        resolvedUserHoleCards && this.userSeat !== null
          ? { [this.userSeat]: resolvedUserHoleCards }
          : undefined,
    });
    return { engine, tracker: new ContextTracker(engine) };
  }
  /** Settle a completed engine back into the session. */
  finishHand(engine) {
    const history = engine.getHistory();
    // Preserve the stable archetype behind each heuristic player. Display names
    // are deliberately varied, so analytics must not try to recover a player
    // type from strings such as "Miko (tag)" after the hand is complete.
    history.players = history.players.map((player) => {
      const agent = this.agents.get(player.seat);
      if (!agent) return player;
      return {
        ...player,
        opponentTypeId: agent.profile.id,
        opponentTypeName: agent.profile.name,
      };
    });
    // Write stacks back and update agent memories.
    for (const p of engine.players) {
      const policyPlayer = this.policyPlayers.get(p.seat);
      if (policyPlayer) {
        policyPlayer.stack = p.stack;
        if (policyPlayer.participantId === this.primaryParticipantId) {
          this.userStack = p.stack;
          this.userBuyIns = policyPlayer.buyIns;
        }
      } else if (p.seat === this.userSeat) {
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
  engine;
  preflopRaises = 0;
  lastPreflopAggressor = null;
  raisesThisStreet = 0;
  lastStreet = "preflop";
  constructor(engine) {
    this.engine = engine;
  }
  buildContext(seat) {
    const e = this.engine;
    if (e.street !== this.lastStreet) {
      this.raisesThisStreet = 0;
      this.lastStreet = e.street;
    }
    const p = e.players.find((x) => x.seat === seat);
    const legal = e.getLegalActions(seat);
    const others = e.activePlayers.filter((x) => x.seat !== seat);
    const maxOtherStack = Math.max(
      0,
      ...others.map((x) => x.stack + x.streetCommitted),
    );
    const effective = Math.min(p.stack + p.streetCommitted, maxOtherStack);
    const pot = e.potSize;
    const previous = [...e.actions]
      .reverse()
      .find(
        (action) =>
          action.street === e.street &&
          action.seat !== seat &&
          action.type !== "post-sb" &&
          action.type !== "post-bb" &&
          action.decisionTimeMs !== undefined,
      );
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
      numRaisesThisStreet:
        e.street === "preflop" ? this.preflopRaises : this.raisesThisStreet,
      facedRaisePreflop: e.street === "preflop" && this.preflopRaises > 0,
      isPreflopAggressor: this.lastPreflopAggressor === seat,
      legal,
      bigBlind: e.config.bigBlind,
      lastOpponentAction: previous
        ? {
            seat: previous.seat,
            type: previous.type,
            decisionTimeMs: previous.decisionTimeMs,
            timedOut: Boolean(previous.timedOut),
          }
        : null,
    };
  }
  apply(seat, action, timing) {
    // Normalize proposals defensively, then let HandEngine enforce the rules.
    const legal = this.engine.getLegalActions(seat);
    const a = normalizeActionToLegal(action, legal);
    if (
      a.type === "raise" ||
      (a.type === "bet" && this.engine.street === "preflop")
    ) {
      if (this.engine.street === "preflop") {
        this.preflopRaises++;
        this.lastPreflopAggressor = seat;
      } else {
        this.raisesThisStreet++;
      }
    } else if (a.type === "bet") {
      this.raisesThisStreet++;
    }
    this.engine.applyAction(seat, a, timing);
  }
}
