// Storage behind one interface (decisions/05): local disk now, S3-compatible later.
// Web streams in and out; no file paths leave the provider.
import "server-only";

export type StoredObject = { size: number; stream: ReadableStream<Uint8Array> };

export interface StorageProvider {
  // Writes to a temporary name and makes the object visible only after the stream ended without
  // error. A failing or aborted stream leaves nothing behind.
  put(key: string, stream: ReadableStream<Uint8Array>, signal?: AbortSignal): Promise<void>;
  // Null when the object does not exist (F2).
  open(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  // Throws unless the storage can be written now (readiness, F11).
  checkWritable(): Promise<void>;
}
