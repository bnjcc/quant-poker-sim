import { Rng } from "@/lib/poker/rng";
import { BehavioralPolicy } from "@/lib/player-model/policy";
import { Aggregator } from "@/lib/analytics/aggregate";
import { TableSession, policyDecider } from "./table";
/**
 * Environment-agnostic batch runner. Runs in the browser (chunked with
 * yields so the UI stays responsive) or server-side; contains no Vercel- or
 * DOM-specific code. A dedicated worker service can call runSimulation
 * directly with onProgress wired to a job-status store.
 */
export async function runSimulation(
  settings,
  policyData,
  onProgress,
  shouldCancel,
  chunkSize = 200,
) {
  const rng = new Rng(settings.seed);
  const policy = BehavioralPolicy.deserialize(policyData);
  const participantSpecs = (settings.participants ?? []).map(
    (participant, index) => ({
      ...participant,
      decider: policyDecider(
        BehavioralPolicy.deserialize(
          index === 0 ? policyData : participant.policy,
        ),
      ),
    }),
  );
  const session = new TableSession({
    config: settings.config,
    pool: settings.pool,
    rng,
    userBuyInBB: settings.userBuyInBB,
    seatUser: participantSpecs.length === 0,
    policyPlayers: participantSpecs,
    fillWithBots: settings.playMode !== "multiplayer-only",
  });
  const decider = policyDecider(policy);
  const agg = new Aggregator(settings.config.bigBlind);
  const participantAggregators = new Map(
    participantSpecs.map((participant) => [
      participant.participantId,
      new Aggregator(settings.config.bigBlind),
    ]),
  );
  const hands = [];
  let cancelled = false;
  for (let i = 0; i < settings.hands; i++) {
    if (shouldCancel?.()) {
      cancelled = true;
      break;
    }
    const h = session.playHand(participantSpecs.length > 0 ? null : decider);
    if (!h) continue;
    agg.addHand(h, session.userSeat, false);
    for (const participant of participantSpecs) {
      const seat = session.participantSeatById.get(participant.participantId);
      participantAggregators.get(participant.participantId)?.addHand(h, seat, false);
    }
    if (settings.mode === "detailed" || i % settings.sampleEvery === 0) {
      hands.push(h);
    }
    if ((i + 1) % chunkSize === 0) {
      onProgress?.({
        handsDone: i + 1,
        handsTotal: settings.hands,
        userNet: agg.snapshot().userNet,
      });
      // Yield to the event loop so the UI never blocks.
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress?.({
    handsDone: agg.snapshot().totalHands,
    handsTotal: settings.hands,
    userNet: agg.snapshot().userNet,
  });
  return {
    aggregates: agg.snapshot(),
    participantResults: participantSpecs.map((participant) => ({
      participantId: participant.participantId,
      userId: participant.userId,
      username: participant.username,
      playerId: participant.playerId,
      strategyId: participant.strategyId,
      strategyName: participant.strategyName,
      strategyMethod: participant.strategyMethod,
      relationshipDegree: participant.relationshipDegree,
      aggregates: participantAggregators
        .get(participant.participantId)
        .snapshot(),
    })),
    hands,
    userDecisionLog: session.userDecisionLog,
    cancelled,
  };
}
