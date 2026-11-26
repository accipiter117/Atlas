// Runs the real browser worker file (src/aiWorker.js) in a Node worker thread,
// by giving it the `self` it expects. Used by worker.test.js.
import { parentPort } from 'node:worker_threads';

globalThis.self = {
  postMessage: (m) => parentPort.postMessage(m),
  onmessage: null,
};
parentPort.on('message', (data) => globalThis.self.onmessage?.({ data }));
await import('../../src/aiWorker.js');
parentPort.postMessage({ type: 'loaded' });
