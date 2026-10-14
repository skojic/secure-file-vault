// File names are metadata only (rule 16). Stored names lose control characters and path separators;
// the download header carries an ASCII fallback plus the RFC 6266 UTF-8 form (E10).

const MAX_NAME = 255;

export function sanitizeFileName(raw: string): string {
  const cleaned = raw
    .normalize("NFC")
    // Control and format characters, including CR, LF, NUL, DEL and bidi overrides.
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/[/\\]/g, "_")
    .trim();
  const chars = [...cleaned];
  if (chars.length === 0) return "file";
  if (chars.length <= MAX_NAME) return cleaned;
  // Over the cap: shorten the base name and keep a short extension, which decides how a text file is typed.
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 ? [...cleaned.slice(dot)] : [];
  if (ext.length > 1 && ext.length <= 16) return [...chars.slice(0, MAX_NAME - ext.length), ...ext].join("");
  return chars.slice(0, MAX_NAME).join("");
}

// encodeURIComponent leaves ' ( ) * unescaped; RFC 5987 attr-char excludes the first three.
const rfc5987 = (s: string) => encodeURIComponent(s).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${rfc5987(fileName)}`;
}
