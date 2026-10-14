import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";

describe("post-login redirect", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/files?sort=new")).toBe("/files?sort=new");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null, 42, `/${"a".repeat(600)}`])(
    "refuses %s",
    (next) => {
      expect(safeNextPath(next)).toBe("/files");
    },
  );
});
