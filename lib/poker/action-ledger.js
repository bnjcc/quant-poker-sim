function chipLabel(amount) {
  return `${amount.toLocaleString()} ${amount === 1 ? "chip" : "chips"}`;
}
/** Build a human-readable, chronological ledger from incremental engine actions. */
export function buildHandActionLedger(hand) {
  const players = new Map(hand.players.map((player) => [player.seat, player]));
  const committed = new Map();
  let street = "preflop";
  return hand.actions.map((action, index) => {
    if (action.street !== street) {
      street = action.street;
      committed.clear();
    }
    const player = players.get(action.seat);
    if (!player)
      throw new Error(`Hand action references missing seat ${action.seat}`);
    const previous = committed.get(action.seat) ?? 0;
    const highestBefore = Math.max(0, ...committed.values());
    const totalAfter = previous + action.amount;
    committed.set(action.seat, totalAfter);
    let label;
    switch (action.type) {
      case "post-sb":
        label = `posts small blind ${chipLabel(action.amount)}`;
        break;
      case "post-bb":
        label = `posts big blind ${chipLabel(action.amount)}`;
        break;
      case "fold":
        label = "folds";
        break;
      case "check":
        label = "checks";
        break;
      case "call":
        label = `calls ${chipLabel(action.amount)}`;
        break;
      case "bet":
        label = `bets ${chipLabel(action.amount)}`;
        break;
      case "raise":
        label = `raises to ${chipLabel(totalAfter)}`;
        break;
      case "all-in":
        label =
          totalAfter > highestBefore
            ? `${highestBefore > 0 ? "raises" : "bets"} all-in to ${chipLabel(totalAfter)}`
            : `calls all-in for ${chipLabel(action.amount)}`;
        break;
    }
    return {
      index,
      street: action.street,
      seat: action.seat,
      playerId: player.playerId,
      playerName: player.name,
      position: player.position,
      actionType: action.type,
      label,
      decisionTimeMs: action.decisionTimeMs,
      timedOut: action.timedOut,
    };
  });
}
