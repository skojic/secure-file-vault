// NARRATE: What it proves (F2, resource safety): if reading the size of an opened blob fails, LocalDiskStorage.open
// NARRATE: closes the file handle before re-throwing, so a failing stat cannot leak a file descriptor per download.
import { randomUUID } from "node:crypto";
import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalDiskStorage } from "@/server/storage/local-disk";

// NARRATE: Wrap the real open() in a spy so one call can hand back a handle whose stat() fails.
vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return { ...real, open: vi.fn(real.open) };
});

describe("LocalDiskStorage.open", () => {
  let dir: string | undefined;
  afterEach(async () => {
    vi.restoreAllMocks();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("closes the file handle when stat() fails, and re-throws the error", async () => {
    dir = await mkdtemp(join(tmpdir(), "local-disk-"));
    const key = randomUUID();
    await writeFile(join(dir, key), "bytes");
    const realOpen = vi.mocked(open).getMockImplementation()!;
    let close: ReturnType<typeof vi.fn> | undefined;
    vi.mocked(open).mockImplementationOnce(async (...args) => {
      const handle = await realOpen(...args);
      vi.spyOn(handle, "stat").mockRejectedValue(Object.assign(new Error("EIO: i/o error"), { code: "EIO" }));
      close = vi.spyOn(handle, "close") as unknown as ReturnType<typeof vi.fn>;
      return handle;
    });

    await expect(new LocalDiskStorage(dir).open(key)).rejects.toThrow("EIO");
    expect(close).toHaveBeenCalledTimes(1);
  });
});
