import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/env";
import type { CurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { files, users } from "@/server/db/schema";
import {
  ConflictError,
  DependencyUnavailableError,
  KeyMismatchError,
  PayloadTooLargeError,
  QuotaExceededError,
  StorageFullError,
  UnsupportedMediaTypeError,
  ValidationError,
} from "@/server/errors";
import { sweepStalePending, uploadFile } from "@/server/files/upload";
import { LocalDiskStorage, type StorageProvider } from "@/server/storage/local-disk";
import { abortingStream, generatedStream, heldStream, newKey, pdfBytes, pngBytes, storedNames, streamOf, text } from "../setup/files";
import { resetTables } from "../setup/reset";

let user: CurrentUser;
const storage = () => new LocalDiskStorage(env.STORAGE_DIR);
const MAX = env.MAX_UPLOAD_BYTES;

const upload = (body: Uint8Array | ReadableStream<Uint8Array>, fileName: string, opts: { key?: string; declared?: number | null; storage?: StorageProvider; signal?: AbortSignal } = {}) =>
  uploadFile(
    user,
    {
      body: body instanceof Uint8Array ? streamOf(body) : body,
      declaredLength: opts.declared === undefined ? (body instanceof Uint8Array ? body.length : null) : opts.declared,
      fileName,
      idempotencyKey: opts.key ?? newKey(),
      signal: opts.signal,
    },
    opts.storage ? { storage: opts.storage } : undefined,
  );

async function expectNothingStored() {
  expect(await db.select().from(files)).toHaveLength(0);
  expect(storedNames()).toEqual([]);
}

describe("upload", () => {
  beforeEach(async () => {
    await resetTables();
    for (const name of storedNames()) await storage().delete(name).catch(() => undefined);
    const [u] = await db.insert(users).values({ name: "Ana", username: "ana", passwordHash: "x", role: "staff" }).returning();
    user = { id: u.id, name: u.name, username: u.username, role: u.role };
  });
  afterEach(() => vi.restoreAllMocks());

  it("H4: stores the bytes under a UUID key; the row is ready with the detected type and the original name", async () => {
    const bytes = pngBytes(5000);
    const { id, replayed } = await upload(bytes, "holiday photo.png");
    expect(replayed).toBe(false);
    const [row] = await db.select().from(files).where(eq(files.id, id));
    expect(row).toMatchObject({ status: "ready", contentType: "image/png", sizeBytes: 5000, originalName: "holiday photo.png", uploaderId: user.id });
    expect(row.storageKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(storedNames()).toEqual([row.storageKey]);
    expect(readFileSync(join(env.STORAGE_DIR, row.storageKey))).toEqual(Buffer.from(bytes));
  });

  it("E11: exactly MAX bytes succeeds; MAX+1 fails with and without Content-Length, leaving nothing", async () => {
    await expect(upload(generatedStream(MAX), "max.txt", { declared: MAX })).resolves.toMatchObject({ replayed: false });
    await db.delete(files);
    for (const name of storedNames()) await storage().delete(name);

    await expect(upload(generatedStream(MAX + 1), "over.txt", { declared: null })).rejects.toBeInstanceOf(PayloadTooLargeError);
    await expectNothingStored();
    await expect(upload(generatedStream(MAX + 1), "over.txt", { declared: MAX })).rejects.toBeInstanceOf(PayloadTooLargeError);
    await expectNothingStored();
  }, 60_000);

  it("E11: a body longer than its Content-Length is rejected even under the size limit", async () => {
    await expect(upload(generatedStream(2000), "short.txt", { declared: 1000 })).rejects.toBeInstanceOf(ValidationError);
    await expectNothingStored();
  });

  it("E11: a zero-byte file is rejected (decided: nothing to detect a type from)", async () => {
    await expect(upload(new Uint8Array(0), "empty.txt")).rejects.toBeInstanceOf(ValidationError);
    await expectNothingStored();
  });

  it("E9: valid UTF-8 text with a text extension passes; PDF is detected from bytes", async () => {
    const csv = await upload(text("name,amount\nAna,12\nBojan,7\n"), "report.csv");
    const pdf = await upload(pdfBytes(), "contract.PDF");
    const rows = await db.select({ id: files.id, contentType: files.contentType }).from(files);
    expect(rows.find((r) => r.id === csv.id)?.contentType).toBe("text/csv; charset=utf-8");
    expect(rows.find((r) => r.id === pdf.id)?.contentType).toBe("application/pdf");
  });

  it.each([
    ["HTML renamed .txt", text("<!doctype html><html><script>alert(1)</script></html>"), "notes.txt"],
    ["HTML renamed .png", text("<html><body>hi</body></html>"), "photo.png"],
    ["SVG", text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "logo.svg"],
    ["SVG renamed .csv", text('<svg xmlns="http://www.w3.org/2000/svg"/>'), "data.csv"],
    ["XML", text('<?xml version="1.0"?><a/>'), "data.txt"],
    ["invalid UTF-8 as text", Uint8Array.from([0x68, 0x69, 0xff, 0xfe, 0x00]), "notes.txt"],
    ["unknown binary", Uint8Array.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]), "blob.bin"],
  ])("E9, rule 15: %s is rejected with 415 and leaves nothing", async (_label, bytes, name) => {
    await expect(upload(bytes, name)).rejects.toBeInstanceOf(UnsupportedMediaTypeError);
    await expectNothingStored();
  });

  it("E10: the stored name has no control characters or path separators and is capped at 255", async () => {
    const { id } = await upload(text("x,y\n"), 'a"\r\nX-Evil: 1/../../etc\\passwd\u0000.csv');
    const [row] = await db.select().from(files).where(eq(files.id, id));
    expect(row.originalName).not.toMatch(/[\u0000-\u001f\u007f/\\]/);
    expect(row.originalName.endsWith(".csv")).toBe(true);
    const long = await upload(text("x\n"), `${"ж".repeat(300)}.txt`);
    const [longRow] = await db.select().from(files).where(eq(files.id, long.id));
    expect([...longRow.originalName].length).toBeLessThanOrEqual(255);
  });

  it("F4: a client that disconnects mid-upload leaves no row, no blob and no temp file", async () => {
    await expect(upload(abortingStream(pngBytes(9000)), "photo.png", { declared: 20000 })).rejects.toBeTruthy();
    await expectNothingStored();
  });

  it("F1: if marking the row ready fails, the blob and the row are both removed", async () => {
    vi.spyOn(db, "update").mockImplementationOnce(() => {
      throw new Error("simulated failure on the ready update");
    });
    await expect(upload(pngBytes(3000), "photo.png")).rejects.toThrow("simulated failure");
    await expectNothingStored();
  });

  it("F1: the sweeper removes stale pending rows and their bytes", async () => {
    const held = heldStream(pngBytes(5000));
    const pending = upload(held.stream, "slow.png", { declared: 10000 });
    await vi.waitFor(async () => expect(await db.select().from(files)).toHaveLength(1));
    await sweepStalePending(storage(), 0);
    expect(await db.select().from(files)).toHaveLength(0);
    held.release();
    await pending.catch(() => undefined);
    await expectNothingStored();
  });

  it("F1: if the pending row is gone when marking it ready, the upload fails and removes its blob", async () => {
    const real = storage();
    const sweptMidway: StorageProvider = {
      put: async (key, stream, signal) => {
        await real.put(key, stream, signal);
        await db.delete(files);
      },
      delete: (key) => real.delete(key),
      open: (key) => real.open(key),
      checkWritable: () => real.checkWritable(),
    };
    await expect(upload(pngBytes(3000), "photo.png", { storage: sweptMidway })).rejects.toBeInstanceOf(ConflictError);
    await expectNothingStored();
  });

  it("F1: one blob that fails to delete does not stop the sweep; a missing blob is fine", async () => {
    const real = storage();
    const [failing, written, missing] = [randomUUID(), randomUUID(), randomUUID()];
    for (const key of [failing, written]) await real.put(key, streamOf(pngBytes(100)));
    await db.insert(files).values(
      [failing, written, missing].map((storageKey) => ({ originalName: "x.png", sizeBytes: 100, contentType: "image/png", storageKey, status: "pending" as const, uploaderId: user.id })),
    );
    const flaky: StorageProvider = {
      put: (key, stream, signal) => real.put(key, stream, signal),
      open: (key) => real.open(key),
      checkWritable: () => real.checkWritable(),
      delete: async (key) => {
        if (key === failing) throw Object.assign(new Error("EIO: i/o error"), { code: "EIO" });
        await real.delete(key);
      },
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(sweepStalePending(flaky, 0)).resolves.toEqual({ removed: 3, blobsFailed: 1 });
    expect(await db.select().from(files)).toHaveLength(0);
    expect(storedNames()).toEqual([failing]);
    expect(logged.mock.calls.map(([line]) => JSON.parse(String(line)))).toContainEqual(
      expect.objectContaining({ event: "files.sweep.blob_failed", storageKey: failing }),
    );
  });

  it("F9: a full disk returns 507 and leaves no row", async () => {
    const full: StorageProvider = {
      ...storage(),
      put: async () => {
        throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
      },
      delete: async () => {},
      open: async () => null,
      checkWritable: async () => {},
    };
    await expect(upload(pngBytes(3000), "photo.png", { storage: full })).rejects.toBeInstanceOf(StorageFullError);
    expect(await db.select().from(files)).toHaveLength(0);
  });

  it("F12: storage that hangs fails with 503 within the timeout, and the key can be retried", async () => {
    const hanging: StorageProvider = {
      put: (_key, _stream, signal) =>
        new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason), { once: true })),
      delete: async () => {},
      open: async () => null,
      checkWritable: async () => {},
    };
    const key = newKey();
    const started = Date.now();
    await expect(upload(pngBytes(3000), "photo.png", { storage: hanging, key })).rejects.toBeInstanceOf(DependencyUnavailableError);
    expect(Date.now() - started).toBeLessThan(env.UPLOAD_TIMEOUT_MS + 1500);
    expect(await db.select().from(files)).toHaveLength(0);
    await expect(upload(pngBytes(3000), "photo.png", { key })).resolves.toMatchObject({ replayed: false });
  }, 15_000);

  it("E12: the same content uploaded twice with different keys is two files", async () => {
    const a = await upload(pngBytes(3000), "photo.png");
    const b = await upload(pngBytes(3000), "photo.png");
    expect(a.id).not.toBe(b.id);
    const keys = (await db.select({ k: files.storageKey }).from(files)).map((r) => r.k);
    expect(new Set(keys).size).toBe(2);
  });

  it("E20: the same upload twice with one key stores one file and returns the same id", async () => {
    const key = newKey();
    const first = await upload(pngBytes(3000), "photo.png", { key });
    const second = await upload(pngBytes(3000), "photo.png", { key });
    expect(second).toEqual({ id: first.id, replayed: true });
    expect(await db.select().from(files)).toHaveLength(1);
    expect(storedNames()).toHaveLength(1);
  });

  it("E20: a retry while the first upload is still streaming is 409", async () => {
    const key = newKey();
    const held = heldStream(pngBytes(5000));
    const first = upload(held.stream, "photo.png", { key, declared: 10000 });
    await vi.waitFor(async () => expect(await db.select().from(files)).toHaveLength(1));
    const err = await upload(pngBytes(10000), "photo.png", { key }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    held.release();
    await first;
  });

  it("E21: the same key with a different file name is 422 and stores nothing more", async () => {
    const key = newKey();
    await upload(pngBytes(3000), "photo.png", { key });
    await expect(upload(pngBytes(3000), "other.png", { key })).rejects.toBeInstanceOf(KeyMismatchError);
    expect(await db.select().from(files)).toHaveLength(1);
  });

  it("E13: two parallel uploads that together exceed the quota: one succeeds, one is refused", async () => {
    const size = 3 * 1024 * 1024;
    const quotaBytes = 5 * 1024 * 1024;
    const send = (name: string) =>
      uploadFile(user, { body: generatedStream(size, pngBytes()), declaredLength: size, fileName: name, idempotencyKey: newKey() }, { quotaBytes });
    const results = await Promise.allSettled([send("a.png"), send("b.png")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(QuotaExceededError);
    expect(await db.select().from(files)).toHaveLength(1);
  }, 60_000);

  it("B1: a file far larger than the heap growth it causes is streamed, not buffered", async () => {
    const size = 64 * 1024 * 1024;
    globalThis.gc?.();
    const before = process.memoryUsage().heapUsed;
    let peak = before;
    const timer = setInterval(() => (peak = Math.max(peak, process.memoryUsage().heapUsed)), 5);
    const { id } = await uploadFile(
      user,
      { body: generatedStream(size, pngBytes()), declaredLength: size, fileName: "big.png", idempotencyKey: randomUUID() },
      { maxBytes: size, quotaBytes: size * 2 },
    );
    clearInterval(timer);
    const [row] = await db.select().from(files).where(eq(files.id, id));
    expect(row.sizeBytes).toBe(size);
    expect(peak - before).toBeLessThan(size / 4);
  }, 60_000);
});
