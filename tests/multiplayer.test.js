import { describe, expect, it } from "vitest";
import { BehavioralPolicy } from "@/lib/player-model/policy";
import { runSimulation } from "@/lib/simulation/runner";
import {
  buildPoolConfig,
  DEFAULT_POOL_SETTINGS,
  DEFAULT_TABLE,
} from "@/lib/simulation/defaults";
import {
  multiplayerSetupError,
  participantPlayerId,
  PLAY_MODES,
} from "@/lib/social/multiplayer";
import {
  normalizeUsername,
  usernameError,
} from "@/lib/social/usernames";

const policy = new BehavioralPolicy().serialize();
const pool = buildPoolConfig(DEFAULT_POOL_SETTINGS);

function participant(index) {
  const userId = `player-${index}`;
  return {
    participantId: userId,
    userId,
    username: `player_${index}`,
    playerId: participantPlayerId(userId),
    strategyId: `strategy-${index}`,
    strategyName: `Strategy ${index}`,
    strategyMethod: "range-first",
    relationshipDegree: index,
    policy,
  };
}

describe("multiplayer setup rules", () => {
  it("requires two real users with bots and three without bots", () => {
    expect(multiplayerSetupError(PLAY_MODES.WITH_BOTS, 1, 6)).toMatch(/2 real users/);
    expect(multiplayerSetupError(PLAY_MODES.WITH_BOTS, 2, 6)).toBeNull();
    expect(multiplayerSetupError(PLAY_MODES.WITH_BOTS, 2, 2)).toMatch(/one bot/);
    expect(multiplayerSetupError(PLAY_MODES.PLAYERS_ONLY, 2, 3)).toMatch(/3 real users/);
    expect(multiplayerSetupError(PLAY_MODES.PLAYERS_ONLY, 3, 3)).toBeNull();
  });

  it("normalizes and validates public usernames", () => {
    expect(normalizeUsername("  River_Reader ")).toBe("river_reader");
    expect(usernameError("river_reader")).toBeNull();
    expect(usernameError("No spaces allowed")).not.toBeNull();
    expect(usernameError("ab")).not.toBeNull();
  });
});

describe("multiplayer simulation", () => {
  it("runs a three-user players-only table and aggregates every user", async () => {
    const participants = [participant(0), participant(1), participant(2)];
    const output = await runSimulation(
      {
        hands: 3,
        seed: "players-only-test",
        config: { ...DEFAULT_TABLE, maxSeats: 3 },
        pool,
        userBuyInBB: 100,
        mode: "detailed",
        sampleEvery: 1,
        playMode: PLAY_MODES.PLAYERS_ONLY,
        participants,
      },
      policy,
    );

    expect(output.hands).toHaveLength(3);
    expect(output.participantResults).toHaveLength(3);
    expect(output.hands[0].players).toHaveLength(3);
    expect(output.hands[0].players.every((player) => player.playerId.startsWith("user:"))).toBe(true);
    for (const result of output.participantResults) {
      expect(result.aggregates.totalHands).toBe(3);
    }
    expect(output.aggregates).toEqual(output.participantResults[0].aggregates);
  });

  it("fills remaining seats with bots when two real users play", async () => {
    const output = await runSimulation(
      {
        hands: 2,
        seed: "users-with-bots-test",
        config: DEFAULT_TABLE,
        pool,
        userBuyInBB: 100,
        mode: "detailed",
        sampleEvery: 1,
        playMode: PLAY_MODES.WITH_BOTS,
        participants: [participant(0), participant(1)],
      },
      policy,
    );

    expect(output.participantResults).toHaveLength(2);
    expect(output.hands[0].players.filter((player) => player.playerId.startsWith("user:"))).toHaveLength(2);
    expect(output.hands[0].players.some((player) => player.playerId.startsWith("agent-"))).toBe(true);
  });
});
