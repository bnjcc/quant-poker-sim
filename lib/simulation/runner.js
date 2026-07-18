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
  const session = new TableSession({
    config: settings.config,
    pool: settings.pool,
    rng,
    userBuyInBB: settings.userBuyInBB,
    seatUser: true,
  });
  const decider = policyDecider(policy);
  const agg = new Aggregator(settings.config.bigBlind);
  const hands = [];
  let cancelled = false;
  for (let i = 0; i < settings.hands; i++) {
    if (shouldCancel?.()) {
      cancelled = true;
      break;
    }
    const h = session.playHand(decider);
    if (!h) continue;
    agg.addHand(h, session.userSeat, false);
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
    hands,
    userDecisionLog: session.userDecisionLog,
    cancelled,
  };
}
