import { ActionType, Card, LegalActions, Position, Street } from "./poker";

export interface OpponentActionTimingCue {
  seat: number;
  type: ActionType;
  decisionTimeMs: number;
  timedOut: boolean;
}

/**
 * Full decision context recorded for every action taken at the table —
 * both by the user during calibration and by agents during simulation.
 */
export interface DecisionContext {
  handNumber: number;
  street: Street;
  position: Position;
  holeCards: Card[];
  board: Card[];
  potSize: number;
  betFaced: number; // chips to call
  effectiveStack: number;
  stackToPotRatio: number;
  activePlayers: number;
  numRaisesThisStreet: number;
  facedRaisePreflop: boolean; // is the player facing a raise (not just blinds)?
  isPreflopAggressor: boolean; // did this player make the last preflop raise?
  legal: LegalActions;
  bigBlind: number;
  /** Most recent voluntary action by another player on this street. */
  lastOpponentAction?: OpponentActionTimingCue | null;
}

export interface ChosenAction {
  type: "fold" | "check" | "call" | "bet" | "raise";
  toAmount?: number;
}

export interface RecordedDecision {
  context: DecisionContext;
  action: ChosenAction;
  /** Bet size as a fraction of pot at decision time (for bets/raises). */
  potFraction: number | null;
  /** Real elapsed time from the action becoming available until it was submitted. */
  responseTimeMs?: number;
  /** True when the online action clock selected check/fold automatically. */
  timedOut?: boolean;
}
