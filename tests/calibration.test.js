import { describe, expect, it } from "vitest";
import { getPreset } from "@/lib/agents/profiles";
import { cardsFromString, holeNotation } from "@/lib/poker/deck";
import { Rng } from "@/lib/poker/rng";
import {
  CalibrationRangeSampler,
  calibrationDefendChance,
  calibrationScenario,
} from "@/lib/simulation/calibration";
import {
  buildPoolConfig,
  DEFAULT_POOL_SETTINGS,
  DEFAULT_TABLE,
} from "@/lib/simulation/defaults";
import { ManualSession } from "@/lib/simulation/manual";
import { decisionTimingBucket } from "@/lib/simulation/timing";

function playMeasurementSession(targetHands = 24) {
  const session = new ManualSession({
    config: {
      ...DEFAULT_TABLE,
      rake: { percentage: 0, cap: 0, noFlopNoDrop: true },
    },
    pool: buildPoolConfig(DEFAULT_POOL_SETTINGS),
    seed: "information-rich-calibration",
    targetHands,
    userBuyInBB: 100,
    startingHands: ["AKs", "QJs", "76s", "55"],
  });
  for (let guard = 0; guard < 20_000; guard++) {
    const step = session.step(false);
    if (step.kind === "session-complete") break;
    if (step.kind !== "awaiting-user") continue;
    const { context } = step;
    let action;
    if (
      context.street === "preflop" &&
      context.numRaisesThisStreet === 0 &&
      context.legal.types.includes("raise")
    ) {
      action = { type: "raise", toAmount: context.legal.minRaiseTo };
    } else if (context.legal.types.includes("call")) {
      action = { type: "call" };
    } else if (context.legal.types.includes("check")) {
      action = { type: "check" };
    } else {
      action = { type: "fold" };
    }
    session.submitUserAction(context, action, 1_500);
  }
  return session;
}

describe("information-rich calibration", () => {
  it("samples starting hands without replacement in exact combo proportions", () => {
    const sampler = new CalibrationRangeSampler(new Rng("range-bag"));
    const range = ["AKs", "77", "AKo"];
    const samples = Array.from({ length: 11 }, () =>
      sampler.nextNotation(range),
    );
    expect(samples.filter((hand) => hand === "AKs")).toHaveLength(2);
    expect(samples.filter((hand) => hand === "77")).toHaveLength(3);
    expect(samples.filter((hand) => hand === "AKo")).toHaveLength(6);
    expect(new Set(samples)).toEqual(new Set(range));
  });

  it("cycles through passive, pressure, and timing probes", () => {
    const scenarios = Array.from({ length: 6 }, (_, index) =>
      calibrationScenario(index + 1),
    );
    expect(scenarios.map((scenario) => scenario.postflop)).toEqual(
      expect.arrayContaining(["passive", "pressure"]),
    );
    expect(new Set(scenarios.map((scenario) => scenario.timing))).toEqual(
      new Set(["snap", "normal", "tank"]),
    );
  });

  it("bases the extra defend chance on cards, price, and commitment", () => {
    const profile = getPreset("tag");
    const context = {
      holeCards: cardsFromString("7c2d"),
      potSize: 9,
      effectiveStack: 194,
      legal: { callAmount: 4, types: ["fold", "call", "raise"] },
    };
    const weak = calibrationDefendChance(profile, context);
    const strong = calibrationDefendChance(profile, {
      ...context,
      holeCards: cardsFromString("AsKs"),
    });
    const expensive = calibrationDefendChance(profile, {
      ...context,
      holeCards: cardsFromString("AsKs"),
      potSize: 20,
      effectiveStack: 100,
      legal: { ...context.legal, callAmount: 60 },
    });
    expect(strong).toBeGreaterThan(weak);
    expect(expensive).toBeLessThan(strong);
    expect(weak).toBeGreaterThan(0);
    expect(strong).toBeLessThan(1);
  });

  it("sometimes defends user opens and still collects later-street decisions", () => {
    const session = playMeasurementSession();
    expect(session.handsPlayed).toBe(24);

    let userOpenRaises = 0;
    let defendedOpenRaises = 0;
    for (const history of session.histories) {
      const actions = history.actions;
      for (let index = 0; index < actions.length; index++) {
        const action = actions[index];
        if (
          action.street !== "preflop" ||
          action.seat !== session.userSeat ||
          action.type !== "raise"
        ) {
          continue;
        }
        const earlierRaise = actions
          .slice(0, index)
          .some(
            (candidate) =>
              candidate.street === "preflop" &&
              ["raise", "all-in"].includes(candidate.type),
          );
        if (earlierRaise) continue;
        userOpenRaises++;
        if (
          actions
            .slice(index + 1)
            .some(
              (candidate) =>
                candidate.street === "preflop" &&
                candidate.seat !== session.userSeat &&
                ["call", "raise", "all-in"].includes(candidate.type),
            )
        ) {
          defendedOpenRaises++;
        }
      }
    }
    expect(userOpenRaises).toBeGreaterThan(5);
    expect(defendedOpenRaises).toBeGreaterThan(0);
    expect(defendedOpenRaises).toBeLessThan(userOpenRaises);

    const streets = new Set(
      session.decisions.map((decision) => decision.context.street),
    );
    expect(streets).toEqual(new Set(["preflop", "flop", "turn", "river"]));
    const postflop = session.decisions.filter(
      (decision) => decision.context.street !== "preflop",
    );
    expect(postflop.some((decision) => decision.context.betFaced > 0)).toBe(
      true,
    );
    expect(postflop.some((decision) => decision.context.betFaced === 0)).toBe(
      true,
    );
    expect(
      session.histories.filter(
        (history) =>
          history.results.find((result) => result.seat === session.userSeat)
            ?.showedDown,
      ).length,
    ).toBeGreaterThan(0);
  });

  it("gives the learner usable snap, normal, and tank observations", () => {
    const session = playMeasurementSession(18);
    const observed = new Set(
      session.decisions
        .map((decision) =>
          decisionTimingBucket(
            decision.context.lastOpponentAction?.decisionTimeMs,
          ),
        )
        .filter((bucket) => bucket !== "none"),
    );
    expect(observed).toEqual(new Set(["snap", "normal", "tank"]));
  });

  it("keeps range-first deals inside the selected range", () => {
    const session = playMeasurementSession(12);
    const selected = new Set(["AKs", "QJs", "76s", "55"]);
    for (const history of session.histories) {
      expect(
        selected.has(holeNotation(history.holeCards[session.userSeat])),
      ).toBe(true);
    }
  });
});
