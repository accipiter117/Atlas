// Packing saves small enough for browser storage and for a copyable text code.
//
// A full-length game logs tens of thousands of commands, so saves are gzipped
// (section 8.2). The browser has gzip built in (CompressionStream); Node tests
// can use zlib instead. Both backends produce standard gzip, so a save packed
// by one opens in the other.
//
// Export codes look like ATLAS1:<base64>, so a pasted code is easy to
// recognise and a future format can use ATLAS2 without confusion.

export const CODE_PREFIX = 'ATLAS1:';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function streamThrough(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const BACKENDS = {
  stream: {
    available: () => typeof globalThis.CompressionStream === 'function',
    compress: (bytes) => streamThrough(bytes, new CompressionStream('gzip')),
    decompress: (bytes) => streamThrough(bytes, new DecompressionStream('gzip')),
  },
  zlib: {
    available: () => typeof globalThis.process?.versions?.node === 'string',
    async compress(bytes) {
      const zlib = await import('node:zlib');
      return new Uint8Array(zlib.gzipSync(bytes));
    },
    async decompress(bytes) {
      const zlib = await import('node:zlib');
      return new Uint8Array(zlib.gunzipSync(bytes));
    },
  },
};

/**
 * A codec with one interface whichever backend sits underneath.
 * Defaults to the browser's CompressionStream, falling back to zlib in Node.
 */
export function createCodec(backend) {
  const name = backend ?? (BACKENDS.stream.available() ? 'stream' : 'zlib');
  const impl = BACKENDS[name];
  if (!impl || !impl.available()) throw new Error(`Compression backend "${name}" is not available here`);
  return {
    backend: name,
    compress: (bytes) => impl.compress(bytes),
    decompress: (bytes) => impl.decompress(bytes),
    async pack(value) {
      return impl.compress(encoder.encode(JSON.stringify(value)));
    },
    async unpack(bytes) {
      return JSON.parse(decoder.decode(await impl.decompress(bytes)));
    },
    async toCode(value) {
      return CODE_PREFIX + bytesToBase64(await this.pack(value));
    },
    async fromCode(code) {
      const text = String(code).trim();
      if (!text.startsWith(CODE_PREFIX)) throw new Error('This is not an Atlas save code (it should start with ATLAS1:)');
      return this.unpack(base64ToBytes(text.slice(CODE_PREFIX.length)));
    },
  };
}

/** Base64 without the call-stack limits of String.fromCharCode(...bigArray). */
export function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(text) {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}
