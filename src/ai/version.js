// AI version tags (section 9.7). The champion is the AI as committed: this
// code with the weights in rules/<mod>/ai/*.json. A challenger is the same
// code with a data patch (rules-dev/ai/<tag>.json) that changes weights only;
// tools/sim.mjs plays the two against each other with seats swapped, and the
// patch is copied into the rules only if it wins (docs/AI_TUNING.md).

export const AI_VERSION = 'ai-v6';
