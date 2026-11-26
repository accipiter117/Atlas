// The AI decision recorder (section 9.6): every command the AI sends, with a
// reason key, its parameters and the next two options it weighed. The AI
// journal screen (J) reads it. Kept to the last 50 turns.

export function record(memory, turn, cmd, choice, alternatives = []) {
  // Setup "AI journal: off" (memory.recordOff) keeps nothing.
  if (memory.recordOff) return;
  memory.journal ??= [];
  memory.journal.push({
    turn, type: cmd.type, reasonKey: choice.reasonKey, params: choice.params ?? {},
    alternatives: alternatives.slice(0, 2).map((a) => ({ reasonKey: a.reasonKey, params: a.params ?? {}, score: Math.round((a.score ?? 0) * 10) / 10 })),
    score: Math.round((choice.score ?? 0) * 10) / 10,
  });
  while (memory.journal.length && memory.journal[0].turn < turn - 50) memory.journal.shift();
}
