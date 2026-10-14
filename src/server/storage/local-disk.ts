// Files under STORAGE_DIR, named by their UUID key, never under public/ (rule 18).
import "server-only";
import { constants, createWriteStream } from "node:fs";
import { access, open, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import type { StorageProvider, StoredObject } from "./types";

export type { StorageProvider } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class LocalDiskStorage implements StorageProvider {
  constructor(private readonly dir: string) {}

  // Keys are server-generated UUIDs; anything else is a bug, and must never become a path.
  private paths(key: string) {
    if (!UUID.test(key)) throw new Error("invalid storage key");
    return { final: join(this.dir, key), temp: join(this.dir, `.tmp-${key}`) };
  }

  async put(key: string, stream: ReadableStream<Uint8Array>, signal?: AbortSignal): Promise<void> {
    const { final, temp } = this.paths(key);
    try {
      // `wx` fails if the temp file exists; 0600 keeps it readable by the app user only.
      await pipeline(Readable.fromWeb(stream as NodeWebReadableStream<Uint8Array>), createWriteStream(temp, { flags: "wx", mode: 0o600 }), { signal });
      await rename(temp, final);
    } catch (err) {
      await rm(temp, { force: true });
      throw err;
    }
  }

  // Opens the file before any response header is sent, so a missing blob is a 404, never a cut-off 200.
  async open(key: string): Promise<StoredObject | null> {
    const { final } = this.paths(key);
    try {
      const handle = await open(final, "r");
      const { size } = await handle.stat().catch(async (err: unknown) => {
        await handle.close().catch(() => undefined);
        throw err;
      });
      const nodeStream = handle.createReadStream();
      return { size, stream: Readable.toWeb(nodeStream) as ReadableStream<Uint8Array> };
    } catch (err) {
      if ((err as { code?: string }).code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const { final, temp } = this.paths(key);
    await rm(final, { force: true });
    await rm(temp, { force: true });
  }

  async checkWritable(): Promise<void> {
    const info = await stat(this.dir);
    if (!info.isDirectory()) throw new Error("STORAGE_DIR is not a directory");
    await access(this.dir, constants.W_OK);
  }
}
