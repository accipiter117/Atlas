// One simulator thread: plays the games it is sent (tools/sim.mjs).
import { parentPort } from 'node:worker_threads';
import { playGame } from './lib-sim.mjs';

parentPort.on('message', async (job) => {
  parentPort.postMessage({ id: job.id, result: await playGame(job.game) });
});
