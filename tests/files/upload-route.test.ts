// The PUT route's shape gate, called directly with a Request. next/headers is replaced with a
// cookie jar holding a real session.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/env";
import { createSession, SESSION_COOKIE } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { files, users } from "@/server/db/schema";
import { FakeJar } from "../setup/fakes";
import { newKey, pngBytes, storedNames } from "../setup/files";
import { resetTables } from "../setup/reset";

const jar = vi.hoisted(() => ({ current: null as null | { get(n: string): { value: string } | undefined } }));
vi.mock("next/headers", () => ({
  cookies: async () => jar.current ?? { get: () => undefined },
  headers: async () => new Headers(),
}));

const { PUT } = await import("@/app/api/files/route");

const ORIGIN = "http://localhost:3000";

function put(body: BodyInit | null, headers: Record<string, string>) {
  return PUT(
    new Request(`${ORIGIN}/api/files`, {
      method: "PUT",
      body,
      headers: { host: "localhost:3000", origin: ORIGIN, "x-file-name": "photo.png", "idempotency-key": newKey(), ...headers },
      // @ts-expect-error Node's fetch needs this for streaming bodies
      duplex: "half",
    }),
  );
}

// A body whose first read fails the test: proves a request was rejected before the body was read.
function untouchableBody(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    pull() {
      throw new Error("the body must not be read");
    },
  });
}

describe("PUT /api/files", () => {
  beforeEach(async () => {
    await resetTables();
    const { rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const name of storedNames()) rmSync(join(env.STORAGE_DIR, name), { force: true });
    const [u] = await db.insert(users).values({ name: "Ana", username: "ana", passwordHash: "x", role: "staff" }).returning();
    const fake = new FakeJar();
    await createSession(u.id, fake);
    jar.current = fake;
  });

  it("H4: returns 201 with the file id", async () => {
    const res = await put(pngBytes(2000), {});
    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("rule 13: a foreign or missing Origin is 403 and nothing is written", async () => {
    expect((await put(pngBytes(2000), { origin: "https://evil.example" })).status).toBe(403);
    const req = new Request(`${ORIGIN}/api/files`, { method: "PUT", body: pngBytes(2000), headers: { host: "localhost:3000", "x-file-name": "a.png", "idempotency-key": newKey() } });
    expect((await PUT(req)).status).toBe(403);
    expect(await db.select().from(files)).toHaveLength(0);
    expect(storedNames()).toEqual([]);
  });

  it("E11, rule 14: a Content-Length over the limit is 413 before the body is read", async () => {
    const res = await put(untouchableBody(), { "content-length": String(env.MAX_UPLOAD_BYTES + 1) });
    expect(res.status).toBe(413);
  });

  it("rule 26: a missing or malformed Idempotency-Key is 400 before the body is read", async () => {
    for (const key of ["", "not-a-uuid"]) {
      const res = await put(untouchableBody(), { "idempotency-key": key });
      expect(res.status).toBe(400);
    }
  });

  it("a missing file name is 400", async () => {
    expect((await put(untouchableBody(), { "x-file-name": "" })).status).toBe(400);
    expect((await put(untouchableBody(), { "x-file-name": "%E0%A4%A" })).status).toBe(400);
  });

  it("no session is 401 and nothing is written", async () => {
    jar.current = null;
    const res = await put(untouchableBody(), {});
    expect(res.status).toBe(401);
    expect(await db.select().from(files)).toHaveLength(0);
  });

  it("an expired or forged cookie is 401", async () => {
    jar.current = { get: (n: string) => (n === SESSION_COOKIE ? { value: "forged" } : undefined) };
    expect((await put(untouchableBody(), {})).status).toBe(401);
  });

  it("F5: a 5 MB upload through the route succeeds", async () => {
    const res = await put(pngBytes(5 * 1024 * 1024), {});
    expect(res.status).toBe(201);
  }, 30_000);
});
