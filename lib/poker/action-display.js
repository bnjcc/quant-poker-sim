/**
 * Return only the current betting cycle's latest voluntary action per seat.
 *
 * Once a bet or raise is made, checks and other actions from before that wager
 * are stale: those players still have to fold, call, or raise when action gets
 * back to them. Hiding the stale labels keeps the table display aligned with
 * the engine's legal action state.
 */
export function visibleActionBySeat(actions, street) {
  const streetActions = actions.filter((action) => action.street === street);
  const committedBySeat = new Map();
  let highestCommitment = 0;
  let lastAggressiveIndex = -1;
  for (let index = 0; index < streetActions.length; index++) {
    const action = streetActions[index];
    const committed = (committedBySeat.get(action.seat) ?? 0) + action.amount;
    committedBySeat.set(action.seat, committed);
    const increasedPrice = committed > highestCommitment;
    if (increasedPrice) highestCommitment = committed;
    if (
      action.type !== "post-sb" &&
      action.type !== "post-bb" &&
      increasedPrice
    ) {
      lastAggressiveIndex = index;
    }
  }
  const visible = new Map();
  for (
    let index = lastAggressiveIndex < 0 ? 0 : lastAggressiveIndex;
    index < streetActions.length;
    index++
  ) {
    const action = streetActions[index];
    if (action.type === "post-sb" || action.type === "post-bb") continue;
    visible.set(action.seat, action);
  }
  return visible;
}
