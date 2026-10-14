// Byte fixtures and streams for upload tests.
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";

// The 8-byte PNG signature, an IHDR chunk and an IEND chunk: enough for byte sniffing.
export function pngBytes(padTo = 0): Uint8Array<ArrayBuffer> {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = [0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1f, 0x15, 0xc4, 0x89];
  const iend = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
  const head = Uint8Array.from([...sig, ...ihdr, ...iend]);
  if (padTo <= head.length) return head;
  const out = new Uint8Array(padTo);
  out.set(head);
  return out;
}

export const pdfBytes = (): Uint8Array<ArrayBuffer> => new TextEncoder().encode("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n");
export const text = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);

export function streamOf(bytes: Uint8Array, chunkSize = 64 * 1024): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

// `size` bytes produced lazily, so the test itself never holds them in memory.
export function generatedStream(size: number, first: Uint8Array = new Uint8Array(0), chunkSize = 256 * 1024): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= size) return controller.close();
      const n = Math.min(chunkSize, size - sent);
      const chunk = new Uint8Array(n).fill(0x61);
      if (sent === 0) chunk.set(first.subarray(0, n));
      sent += n;
      controller.enqueue(chunk);
    },
  });
}

// Sends one chunk, then fails as a disconnecting client would (F4).
export function abortingStream(first: Uint8Array): ReadableStream<Uint8Array> {
  let step = 0;
  return new ReadableStream({
    pull(controller) {
      if (step++ === 0) controller.enqueue(first);
      else controller.error(Object.assign(new Error("client disconnected"), { name: "AbortError" }));
    },
  });
}

// Sends one chunk, then waits until `release()` is called.
export function heldStream(first: Uint8Array) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let step = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (step++ === 0) return controller.enqueue(first);
      await gate;
      controller.close();
    },
  });
  return { stream, release };
}

export const newKey = () => randomUUID();

// Files currently in the test storage directory, including temp files.
export const storedNames = () => readdirSync(process.env.STORAGE_DIR!);
