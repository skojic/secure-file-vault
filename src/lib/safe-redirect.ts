// Only same-site paths are allowed as a post-login destination; anything else falls back.
// "//evil.example" and "/\evil.example" are protocol-relative in browsers, so they are refused too.
export function safeNextPath(next: unknown, fallback = "/files"): string {
  if (typeof next !== "string" || next.length > 512) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
