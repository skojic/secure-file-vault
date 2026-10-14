// Upload, in gate order (rule 24, docs/security/request-flow.md):
//   claim the idempotency key → reserve quota with the user row locked → insert the row as pending →
//   stream through a byte counter and type inspector into storage → mark ready → store the result.
// Any failure deletes the bytes and the row and releases the key (rule 17). Nothing is buffered
// beyond the 4100-byte detection sample (B1).
import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { env } from "@/env";
import { sanitizeFileName } from "@/lib/content-disposition";
import type { CurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { files } from "@/server/db/schema";
import {
  AppError,
  DependencyUnavailableError,
  PayloadTooLargeError,
  QuotaExceededError,
  StorageFullError,
  UnsupportedMediaTypeError,
  ValidationError,
} from "@/server/errors";
import { requestHash, withIdempotency } from "@/server/idempotency";
import { log } from "@/server/log";
import { LocalDiskStorage } from "@/server/storage/local-disk";
import type { StorageProvider } from "@/server/storage/types";
import { ALLOWED_BINARY, ALLOWED_TEXT, extensionOf, looksLikeMarkup } from "./allowed-types";

const SAMPLE_BYTES = 4100;
const UPLOAD_ROUTE = "files.upload";

export type UploadRequest = {
  body: ReadableStream<Uint8Array>;
  // Content-Length as sent, or null. It is a claim: bytes are counted regardless.
  declaredLength: number | null;
  fileName: string;
  idempotencyKey: string;
  signal?: AbortSignal;
};

export type UploadDeps = { storage?: StorageProvider; timeoutMs?: number; maxBytes?: number; quotaBytes?: number };

export const defaultStorage = (): StorageProvider => new LocalDiskStorage(env.STORAGE_DIR);

// Counts bytes, keeps a detection sample, and decides the stored type. Throwing from the stream
// makes storage discard the temp file.
class Inspector {
  count = 0;
  contentType: string | null = null;
  private sample = new Uint8Array(SAMPLE_BYTES);
  private sampled = 0;
  private binary = false;
  // Every byte goes through the strict decoder exactly once, in order, until the file is known to
  // be binary. A text file is stored only if all of it is valid UTF-8.
  private decoder = new TextDecoder("utf-8", { fatal: true });
  private utf8Valid = true;

  constructor(
    private readonly limit: number,
    private readonly declared: number | null,
    private readonly fileName: string,
  ) {}

  readonly stream = new TransformStream<Uint8Array, Uint8Array>({
    transform: async (chunk, controller) => {
      this.count += chunk.byteLength;
      if (this.count > this.limit) throw new PayloadTooLargeError("upload exceeds the size limit");
      // More bytes than Content-Length announced: the request lied about its size.
      if (this.declared !== null && this.count > this.declared) throw new ValidationError({ file: "length_mismatch" });
      if (!this.binary) this.feedUtf8(chunk, true);
      if (this.sampled < SAMPLE_BYTES) {
        const take = chunk.subarray(0, SAMPLE_BYTES - this.sampled);
        this.sample.set(take, this.sampled);
        this.sampled += take.byteLength;
        if (this.sampled === SAMPLE_BYTES) await this.decide();
      }
      controller.enqueue(chunk);
    },
    flush: async () => {
      if (this.count === 0) throw new ValidationError({ file: "empty" });
      if (this.contentType === null) await this.decide();
      if (!this.binary) this.feedUtf8(new Uint8Array(0), false);
    },
  });

  private feedUtf8(bytes: Uint8Array, more: boolean) {
    if (this.utf8Valid) {
      try {
        this.decoder.decode(bytes, { stream: more });
      } catch {
        this.utf8Valid = false;
      }
    }
    // Once the file is known to be text, invalid UTF-8 ends the upload.
    if (this.contentType !== null && !this.utf8Valid) throw new UnsupportedMediaTypeError("text file is not valid UTF-8");
  }

  private async decide() {
    const sample = this.sample.subarray(0, this.sampled);
    const detected = await fileTypeFromBuffer(sample);
    if (detected) {
      const stored = ALLOWED_BINARY.get(detected.mime);
      if (!stored) throw new UnsupportedMediaTypeError(`detected type not allowed: ${detected.mime}`);
      this.contentType = stored;
      this.binary = true;
      return;
    }
    const textType = ALLOWED_TEXT.get(extensionOf(this.fileName));
    // Decoded leniently for the markup check only; validity comes from the strict decoder.
    if (!textType || !this.utf8Valid || looksLikeMarkup(new TextDecoder().decode(sample))) {
      throw new UnsupportedMediaTypeError("no allowed type for this content");
    }
    this.contentType = textType;
  }
}

// Storage errors that mean "the dependency failed", not "the request was bad".
function mapStorageError(err: unknown, timedOut: boolean): unknown {
  if (err instanceof AppError) return err;
  if (timedOut) return new DependencyUnavailableError("storage");
  const code = (err as { code?: string }).code;
  if (code === "ENOSPC" || code === "EDQUOT") return new StorageFullError("storage full");
  if (code && ["EACCES", "EPERM", "EROFS", "ENOENT", "EIO", "ENOTDIR"].includes(code)) return new DependencyUnavailableError("storage");
  return err;
}

export async function uploadFile(user: CurrentUser, req: UploadRequest, deps: UploadDeps = {}): Promise<{ id: string; replayed: boolean }> {
  const storage = deps.storage ?? defaultStorage();
  const maxBytes = deps.maxBytes ?? env.MAX_UPLOAD_BYTES;
  const quotaBytes = deps.quotaBytes ?? env.USER_QUOTA_BYTES;
  const timeoutMs = deps.timeoutMs ?? env.UPLOAD_TIMEOUT_MS;
  const fileName = sanitizeFileName(req.fileName);

  if (req.declaredLength !== null && req.declaredLength > maxBytes) throw new PayloadTooLargeError("declared length exceeds the limit");

  const result = await withIdempotency(
    {
      key: req.idempotencyKey,
      userId: user.id,
      route: UPLOAD_ROUTE,
      // The body is not known before it is streamed, so the name and declared size identify the request.
      requestHash: requestHash(UPLOAD_ROUTE, { fileName, declaredLength: req.declaredLength }),
      staleAfterSeconds: Math.ceil(timeoutMs / 1000) + 30,
    },
    async () => {
      const storageKey = randomUUID();
      // Without Content-Length the worst case is reserved, then corrected to the real size (E13).
      const reserve = req.declaredLength ?? maxBytes;

      const fileId = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT 1 FROM users WHERE id = ${user.id} FOR UPDATE`);
        const { rows } = await tx.execute<{ used: string }>(sql`SELECT coalesce(sum(size_bytes), 0)::text AS used FROM files WHERE uploader_id = ${user.id}`);
        if (Number(rows[0].used) + reserve > quotaBytes) throw new QuotaExceededError("quota exceeded");
        const [row] = await tx
          .insert(files)
          .values({ originalName: fileName, sizeBytes: reserve, contentType: "application/octet-stream", storageKey, status: "pending", uploaderId: user.id })
          .returning({ id: files.id });
        return row.id;
      });

      const inspector = new Inspector(maxBytes, req.declaredLength, fileName);
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(new Error("storage timeout")), timeoutMs);
      const signal = req.signal ? AbortSignal.any([req.signal, timeout.signal]) : timeout.signal;
      try {
        await storage.put(storageKey, req.body.pipeThrough(inspector.stream), signal);
        await db
          .update(files)
          .set({ status: "ready", sizeBytes: inspector.count, contentType: inspector.contentType!, updatedAt: sql`now()` })
          .where(and(eq(files.id, fileId), eq(files.status, "pending")));
      } catch (err) {
        await storage.delete(storageKey).catch((e: unknown) => log.error("upload.cleanup.blob_failed", { err: e, fileId }));
        await db.delete(files).where(eq(files.id, fileId)).catch((e: unknown) => log.error("upload.cleanup.row_failed", { err: e, fileId }));
        throw mapStorageError(err, timeout.signal.aborted);
      } finally {
        clearTimeout(timer);
      }
      log.info("upload.ready", { fileId, userId: user.id, sizeBytes: inspector.count, contentType: inspector.contentType });
      return { status: 201, body: { id: fileId } };
    },
  );
  return { id: (result.body as { id: string }).id, replayed: result.replayed };
}

// Deletes rows still pending after `olderThanSeconds`, and their bytes (F1). Run on a schedule:
// `npm run files:sweep`.
export async function sweepStalePending(storage: StorageProvider, olderThanSeconds: number): Promise<number> {
  const stale = await db
    .delete(files)
    .where(and(eq(files.status, "pending"), sql`${files.createdAt} <= now() - make_interval(secs => ${olderThanSeconds})`))
    .returning({ storageKey: files.storageKey });
  for (const { storageKey } of stale) await storage.delete(storageKey);
  return stale.length;
}
