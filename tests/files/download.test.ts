// GET/HEAD /api/files/[id]/download through the route handler, with next/headers replaced by a jar
// holding a real session.
import { rmSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/env";
import { createSession, type CurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { files, users } from "@/server/db/schema";
import { NOT_FOUND_BODY } from "@/server/http";
import { FakeJar } from "../setup/fakes";
import { storedNames } from "../setup/files";
import { resetTables } from "../setup/reset";
import { makeUser, uploadPng } from "../setup/users";

const jar = vi.hoisted(() => ({ current: null as null | FakeJar }));
vi.mock("next/headers", () => ({
  cookies: async () => jar.current ?? { get: () => undefined },
  headers: async () => new Headers(),
}));

const route = await import("@/app/api/files/[id]/download/route");

async function as(user: CurrentUser | null) {
  if (!user) return void (jar.current = null);
  const fake = new FakeJar();
  await createSession(user.id, fake);
  jar.current = fake;
}

const call = (method: "GET" | "HEAD", id: string, headers: Record<string, string> = {}) =>
  route[method](new Request(`http://localhost/api/files/${id}/download`, { method, headers }), { params: Promise.resolve({ id }) });

let ana: CurrentUser, bojan: CurrentUser, root: CurrentUser;
let file: { id: string; bytes: Uint8Array };

describe("download", () => {
  beforeEach(async () => {
    await resetTables();
    for (const name of storedNames()) rmSync(join(env.STORAGE_DIR, name), { force: true });
    ana = await makeUser("ana");
    bojan = await makeUser("bojan");
    root = await makeUser("root", "admin");
    file = await uploadPng(ana, "Изјава \"q\".png");
  });
  afterEach(() => vi.restoreAllMocks());

  it("H5: the uploader gets the exact bytes with safe headers (rule 20)", async () => {
    await as(ana);
    const res = await call("GET", file.id);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(file.bytes);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-length")).toBe(String(file.bytes.length));
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="[^"\r\n]+"; filename\*=UTF-8''/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("H5: an admin can download anyone's file", async () => {
    await as(root);
    expect((await call("GET", file.id)).status).toBe(200);
  });

  it("rule 4, E16: other staff, anonymous, missing and malformed ids all get the identical 404", async () => {
    const responses = [];
    await as(bojan);
    responses.push(await call("GET", file.id));
    responses.push(await call("GET", "00000000-0000-4000-8000-000000000000"));
    responses.push(await call("GET", "not-a-uuid"));
    responses.push(await call("GET", "'; DROP TABLE files; --"));
    await as(null);
    responses.push(await call("GET", file.id));
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(NOT_FOUND_BODY);
      expect(res.headers.get("content-disposition")).toBeNull();
    }
  });

  it("rule 23: a denied attempt is logged as user id and file id only", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => void lines.push(line));
    await as(bojan);
    await call("GET", file.id);
    const denied = lines.map((l) => JSON.parse(l)).find((l) => l.event === "file.access_denied");
    expect(denied).toEqual({ level: "warn", event: "file.access_denied", time: expect.any(String), userId: bojan.id, fileId: file.id });
  });

  it("F2: a row whose blob is gone is a 404, never an empty 200, and is logged at error level", async () => {
    const [row] = await db.select().from(files).where(eq(files.id, file.id));
    rmSync(join(env.STORAGE_DIR, row.storageKey));
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line: string) => void errors.push(line));
    await as(ana);
    const res = await call("GET", file.id);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(NOT_FOUND_BODY);
    expect(errors.map((l) => JSON.parse(l)).some((l) => l.event === "file.blob_missing" && l.fileId === file.id)).toBe(true);
  });

  it("E17: HEAD runs the same policy; Range is ignored and the full file is sent", async () => {
    await as(bojan);
    expect((await call("HEAD", file.id)).status).toBe(404);
    await as(ana);
    const head = await call("HEAD", file.id);
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe(String(file.bytes.length));
    expect((await head.arrayBuffer()).byteLength).toBe(0);

    const ranged = await call("GET", file.id, { range: "bytes=0-9" });
    expect(ranged.status).toBe(200);
    expect(ranged.headers.get("accept-ranges")).toBe("none");
    expect((await ranged.arrayBuffer()).byteLength).toBe(file.bytes.length);
  });

  it("E18: a disabled uploader's files stay visible to admins only", async () => {
    await db.update(users).set({ disabledAt: sql`now()` }).where(eq(users.id, ana.id));
    await as(root);
    expect((await call("GET", file.id)).status).toBe(200);
    await as(bojan);
    expect((await call("GET", file.id)).status).toBe(404);
  });

  it("a pending file is not downloadable, even by its uploader", async () => {
    await db.update(files).set({ status: "pending" }).where(eq(files.id, file.id));
    await as(ana);
    expect((await call("GET", file.id)).status).toBe(404);
  });
});
