// The AI's front door. Phase 4's AI is a placeholder that simply ends its
// turn; the real planners arrive in phase 8. Like every AI to come, it sees
// only view(state, faction) and answers with ordinary commands.

/** Commands an AI faction issues on its turn, given only its view. */
export function takeTurn(view) {
  return [{ type: 'endTurn', faction: view.me }];
}
