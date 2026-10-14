import { describe, expect, it } from "vitest";
import { contentDisposition, sanitizeFileName } from "@/lib/content-disposition";

describe("file names", () => {
  it("E10: CR/LF, quotes and separators cannot break out of the header", () => {
    const header = contentDisposition(sanitizeFileName('a"\r\nX-Evil: 1.pdf'));
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.startsWith('attachment; filename="')).toBe(true);
    expect(header.match(/"/g)).toHaveLength(2);
    expect(header).toContain("filename*=UTF-8''");
  });

  it("E10: non-ASCII names get an ASCII fallback and an RFC 6266 UTF-8 form", () => {
    const header = contentDisposition("Изјава č.pdf");
    expect(header).toMatch(/^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''[A-Za-z0-9%!'()*._~-]+$/);
    expect(decodeURIComponent(header.split("''")[1])).toBe("Изјава č.pdf");
  });

  it("strips control characters and path separators, caps at 255 characters, never returns empty", () => {
    expect(sanitizeFileName("../../etc/passwd")).not.toMatch(/[/\\]/);
    expect(sanitizeFileName("a\u0000b\u001fc\u007fd")).toBe("abcd");
    expect([...sanitizeFileName("ж".repeat(400))].length).toBe(255);
    const long = sanitizeFileName(`${"ж".repeat(400)}.csv`);
    expect([...long].length).toBe(255);
    expect(long.endsWith(".csv")).toBe(true);
    expect(sanitizeFileName("\u0000\u0001")).toBe("file");
    expect(sanitizeFileName("   ")).toBe("file");
  });
});
