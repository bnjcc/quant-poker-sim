import { AGENT_PRESETS, getPreset } from "@/lib/agents/profiles";
export const DEFAULT_TABLE = {
  smallBlind: 1,
  bigBlind: 2,
  maxSeats: 6,
  rake: { percentage: 0.05, cap: 6, noFlopNoDrop: true },
};
export const DEFAULT_POOL_SETTINGS = {
  composition: {
    tag: 2,
    lag: 1,
    "loose-passive": 2,
    "calling-station": 1,
    recreational: 2,
    nit: 1,
    "balanced-reg": 1,
  },
  avgSessionHands: 120,
  turnover: 1,
  stopLossBuyIns: 3,
  stopWinBuyIns: 0,
  rebuyProb: 0.6,
  skillShift: 1,
  looseness: 1,
  aggressionShift: 1,
};
export function buildPoolConfig(settings) {
  const composition = Object.entries(settings.composition)
    .filter(([, w]) => w > 0)
    .map(([id, weight]) => ({ profile: getPreset(id), weight }));
  if (composition.length === 0) {
    composition.push({ profile: getPreset("recreational"), weight: 1 });
  }
  return {
    composition,
    avgSessionHands: settings.avgSessionHands,
    turnover: settings.turnover,
    stopLossBuyIns: settings.stopLossBuyIns,
    stopWinBuyIns: settings.stopWinBuyIns,
    rebuyProb: settings.rebuyProb,
    skillShift: settings.skillShift,
    looseness: settings.looseness,
    aggressionShift: settings.aggressionShift,
  };
}
export const CALIBRATION_SIZES = [25, 50, 100, 250];
/** Minimum hands before tendency estimates stop carrying a low-sample warning. */
export const RELIABLE_SAMPLE_THRESHOLD = 100;
export { AGENT_PRESETS };
