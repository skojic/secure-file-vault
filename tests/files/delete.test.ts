import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { env } from "@/env";
import type { CurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { files } from "@/server/db/schema";
import { ConflictError, KeyMismatchError, NotFoundError } from "@/server/errors";
import { deleteFile, listFiles } from "@/server/files/service";
import { resetTables } from "../setup/reset";
import { makeUser, uploadPng } from "../setup/users";

let ana: CurrentUser, bojan: CurrentUser, root: CurrentUser;

async function versionOf(user: CurrentUser, fileId: string) {
  const { items } = await listFiles(user, {});
  return items.find((f) => f.id === fileId)!.version;
}

const blobExists = async (fileId: string) => {
  const [row] = await db.select().from(files).where(eq(files.id, fileId));
  return row ? existsSync(join(env.STORAGE_DIR, row.storageKey)) : false;
};

describe("deleting a file (rules 26, 27)", () => {
  beforeEach(async () => {
    await resetTables();
    ana = await makeUser("ana");
    bojan = await makeUser("bojan");
    root = await makeUser("root", "admin");
  });

  it("the uploader deletes their file: row and bytes are gone", async () => {
    const { id } = await uploadPng(ana);
    const [row] = await db.select().from(files).where(eq(files.id, id));
    await deleteFile(ana, { fileId: id, version: await versionOf(ana, id), idempotencyKey: randomUUID() });
    expect(await db.select().from(files)).toHaveLength(0);
    expect(existsSync(join(env.STORAGE_DIR, row.storageKey))).toBe(false);
  });

  it("an admin can delete anyone's file; other staff get 404 and nothing changes", async () => {
    const { id } = await uploadPng(ana);
    const version = await versionOf(ana, id);
    await expect(deleteFile(bojan, { fileId: id, version, idempotencyKey: randomUUID() })).rejects.toBeInstanceOf(NotFoundError);
    expect(await blobExists(id)).toBe(true);
    await deleteFile(root, { fileId: id, version, idempotencyKey: randomUUID() });
    expect(await db.select().from(files)).toHaveLength(0);
  });

  it("E22: a file changed after the user saw it is not deleted: 409, row and bytes intact", async () => {
    const { id } = await uploadPng(ana);
    const seen = await versionOf(ana, id);
    await db.execute(sql`UPDATE files SET updated_at = now() + interval '1 second' WHERE id = ${id}`);
    const err = await deleteFile(ana, { fileId: id, version: seen, idempotencyKey: randomUUID() }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).reason).toBe("stale");
    expect(await blobExists(id)).toBe(true);
  });

  it("E20: repeating a delete with the same key returns the first result instead of a 404", async () => {
    const { id } = await uploadPng(ana);
    const request = { fileId: id, version: await versionOf(ana, id), idempotencyKey: randomUUID() };
    expect(await deleteFile(ana, request)).toEqual({ deleted: id, replayed: false });
    expect(await deleteFile(ana, request)).toEqual({ deleted: id, replayed: true });
  });

  it("E21: the same key for a different file is 422", async () => {
    const a = await uploadPng(ana, "a.png");
    const b = await uploadPng(ana, "b.png");
    const idempotencyKey = randomUUID();
    await deleteFile(ana, { fileId: a.id, version: await versionOf(ana, a.id), idempotencyKey });
    await expect(deleteFile(ana, { fileId: b.id, version: await versionOf(ana, b.id), idempotencyKey })).rejects.toBeInstanceOf(KeyMismatchError);
    expect(await blobExists(b.id)).toBe(true);
  });

  it("a malformed id or version is the standard 404 / a validation error, with nothing deleted", async () => {
    const { id } = await uploadPng(ana);
    await expect(deleteFile(ana, { fileId: "nope", version: "1", idempotencyKey: randomUUID() })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteFile(ana, { fileId: id, version: "yesterday", idempotencyKey: randomUUID() })).rejects.toBeInstanceOf(ConflictError);
    expect(await blobExists(id)).toBe(true);
  });
});
