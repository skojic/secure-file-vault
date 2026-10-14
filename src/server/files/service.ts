// Listing, download and deletion. Every "no" leaves as NotFoundError, whatever the reason (rule 4).
import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { CurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { files, users } from "@/server/db/schema";
import { ConflictError, NotFoundError } from "@/server/errors";
import { requestHash, withIdempotency } from "@/server/idempotency";
import { log } from "@/server/log";
import type { StorageProvider, StoredObject } from "@/server/storage/types";
import { defaultStorage } from "./upload";
import { canAccessFile } from "./policy";

const uuid = z.uuid();
// PostgreSQL's text form of timestamptz keeps microseconds, which a JS Date would drop.
const PG_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/;

export type FileListItem = {
  id: string;
  originalName: string;
  sizeBytes: number;
  contentType: string;
  createdAt: Date;
  uploaderName: string;
  // The row's updated_at as the user saw it; an irreversible action must send it back (rule 27).
  version: string;
};

type Cursor = { createdAt: string; id: string };

const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");

function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Cursor;
    return PG_TIMESTAMP.test(c.createdAt) && uuid.safeParse(c.id).success ? c : null;
  } catch {
    return null;
  }
}

// Staff see their own files, admins all, scoped in SQL (rule 3). Keyset pagination on
// (created_at, id), matching the composite indexes, never OFFSET (B4).
// Exported so the B4 test can EXPLAIN the exact SQL this module runs.
export function buildListQuery(user: CurrentUser, cursor: Cursor | null, limit: number) {
  const scope = user.role === "admin" ? undefined : eq(files.uploaderId, user.id);
  const after = cursor ? sql`(${files.createdAt}, ${files.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)` : undefined;
  return db
    .select({
      id: files.id,
      originalName: files.originalName,
      sizeBytes: files.sizeBytes,
      contentType: files.contentType,
      createdAt: files.createdAt,
      createdAtText: sql<string>`${files.createdAt}::text`,
      version: sql<string>`${files.updatedAt}::text`,
      uploaderName: users.name,
    })
    .from(files)
    .innerJoin(users, eq(users.id, files.uploaderId))
    .where(and(eq(files.status, "ready"), scope, after))
    .orderBy(desc(files.createdAt), desc(files.id))
    .limit(limit + 1);
}

export async function listFiles(user: CurrentUser, opts: { cursor?: string; limit?: number }): Promise<{ items: FileListItem[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const rows = await buildListQuery(user, decodeCursor(opts.cursor), limit);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map((r) => ({
      id: r.id,
      originalName: r.originalName,
      sizeBytes: r.sizeBytes,
      contentType: r.contentType,
      createdAt: r.createdAt,
      uploaderName: r.uploaderName,
      version: r.version,
    })),
    nextCursor: rows.length > limit && last ? encodeCursor({ createdAt: last.createdAtText, id: last.id }) : null,
  };
}

export type Download = { originalName: string; contentType: string; object: StoredObject };

// Validate → load → policy → open the blob. The blob is opened before any header is sent, so a
// missing blob is a 404 and never a truncated 200 (rule 19, F2).
export async function getFileForDownload(user: CurrentUser | null, rawId: string, storage: StorageProvider = defaultStorage()): Promise<Download> {
  const id = uuid.safeParse(rawId);
  if (!id.success) throw new NotFoundError("malformed");
  if (!user) throw new NotFoundError("forbidden");

  const [file] = await db
    .select({ id: files.id, uploaderId: files.uploaderId, originalName: files.originalName, contentType: files.contentType, storageKey: files.storageKey })
    .from(files)
    .where(and(eq(files.id, id.data), eq(files.status, "ready")));
  if (!file) throw new NotFoundError("missing");

  if (!canAccessFile(user, file)) {
    // User id and file id, nothing else (rule 23).
    log.warn("file.access_denied", { userId: user.id, fileId: file.id });
    throw new NotFoundError("forbidden");
  }

  const object = await storage.open(file.storageKey);
  if (!object) {
    log.error("file.blob_missing", { fileId: file.id });
    throw new NotFoundError("missing");
  }
  return { originalName: file.originalName, contentType: file.contentType, object };
}

const DELETE_ROUTE = "files.delete";

// Irreversible, so keyed (rule 26) and checked against the version the user saw (rule 27, E22).
// The row goes in a transaction; the bytes after it commits, so a crash leaves at worst an
// unreferenced blob (logged), never a row without its bytes.
export async function deleteFile(
  user: CurrentUser,
  input: { fileId: string; version: string; idempotencyKey: string },
  storage: StorageProvider = defaultStorage(),
): Promise<{ deleted: string; replayed: boolean }> {
  const id = uuid.safeParse(input.fileId);
  if (!id.success) throw new NotFoundError("malformed");

  const result = await withIdempotency(
    {
      key: input.idempotencyKey,
      userId: user.id,
      route: DELETE_ROUTE,
      requestHash: requestHash(DELETE_ROUTE, { fileId: id.data, version: input.version }),
      staleAfterSeconds: 60,
    },
    async () => {
      const storageKey = await db.transaction(async (tx) => {
        const [file] = await tx
          .select({ id: files.id, uploaderId: files.uploaderId, storageKey: files.storageKey, version: sql<string>`${files.updatedAt}::text` })
          .from(files)
          .where(and(eq(files.id, id.data), eq(files.status, "ready")))
          .for("update");
        if (!file) throw new NotFoundError("missing");
        if (!canAccessFile(user, file)) {
          log.warn("file.access_denied", { userId: user.id, fileId: file.id });
          throw new NotFoundError("forbidden");
        }
        // Compared as timestamps in SQL, so formatting differences cannot cause a false mismatch.
        if (!PG_TIMESTAMP.test(input.version)) throw new ConflictError("stale");
        const [{ same }] = (await tx.execute<{ same: boolean }>(sql`SELECT ${file.version}::timestamptz = ${input.version}::timestamptz AS same`)).rows;
        if (!same) throw new ConflictError("stale");
        await tx.delete(files).where(eq(files.id, file.id));
        return file.storageKey;
      });
      await storage.delete(storageKey).catch((err: unknown) => log.error("file.blob_orphaned", { err, storageKey }));
      log.info("file.deleted", { userId: user.id, fileId: id.data });
      return { status: 200, body: { deleted: id.data } };
    },
  );
  return { deleted: (result.body as { deleted: string }).deleted, replayed: result.replayed };
}
