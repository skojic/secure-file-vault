import { describe, expect, it } from "vitest";
import { USERNAME_PATTERN, normalizeUsername } from "@/lib/username";

describe("username normalisation", () => {
  it("E1: Admin, ' admin ' and fullwidth ａｄｍｉｎ all normalise to admin", () => {
    for (const raw of ["Admin", " admin ", "ａｄｍｉｎ", "ADMIN"]) expect(normalizeUsername(raw)).toBe("admin");
  });

  it("accepts 3–32 of a-z 0-9 . _ - and rejects the rest", () => {
    expect(USERNAME_PATTERN.test("ana.k_1-x")).toBe(true);
    for (const bad of ["ab", "a".repeat(33), "ana k", "ana@k", "ana/k", ""]) expect(USERNAME_PATTERN.test(bad)).toBe(false);
  });
});
