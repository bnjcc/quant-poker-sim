export const PLAY_MODES = {
  SOLO: "solo",
  WITH_BOTS: "multiplayer-bots",
  PLAYERS_ONLY: "multiplayer-only",
};

export function multiplayerSetupError(playMode, participantCount, maxSeats) {
  if (playMode === PLAY_MODES.SOLO) return null;
  if (playMode === PLAY_MODES.WITH_BOTS && participantCount < 2) {
    return "Games with bots need at least 2 real users total (you and one other player).";
  }
  if (playMode === PLAY_MODES.PLAYERS_ONLY && participantCount < 3) {
    return "Players-only games need at least 3 real users total (you and two other players).";
  }
  if (participantCount > 9) return "A table can include at most 9 real users.";
  if (playMode === PLAY_MODES.WITH_BOTS && participantCount >= maxSeats) {
    return "Increase the table size or remove a real user so everyone has a seat and at least one bot can play.";
  }
  return null;
}

export function participantPlayerId(userId) {
  return `user:${userId}`;
}
