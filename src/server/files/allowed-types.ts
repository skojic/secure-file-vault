// What may be stored (rule 15, E9). Binary types are trusted only when detected from the bytes.
// Text has no signature, so it needs a text extension, valid UTF-8 and no markup: file-type does not
// detect HTML or SVG, so the markup check is the only thing keeping them out.
import "server-only";

// Detected MIME type → stored content type.
export const ALLOWED_BINARY = new Map<string, string>([
  ["image/png", "image/png"],
  ["image/jpeg", "image/jpeg"],
  ["image/gif", "image/gif"],
  ["image/webp", "image/webp"],
  ["application/pdf", "application/pdf"],
  ["application/zip", "application/zip"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
]);

// Extension → stored content type, for files without a signature.
export const ALLOWED_TEXT = new Map<string, string>([
  ["txt", "text/plain; charset=utf-8"],
  ["csv", "text/csv; charset=utf-8"],
  ["md", "text/markdown; charset=utf-8"],
  ["json", "application/json"],
]);

// For the client-side pre-check only (rule 29); the server decides from the bytes.
export const ACCEPTED_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "pdf", "zip", "docx", "xlsx", "pptx", ...ALLOWED_TEXT.keys()];

const MARKUP = /<\s*(!doctype|html|head|body|script|style|svg|iframe|object|embed|meta|link|\?xml)\b/i;

export function looksLikeMarkup(sample: string): boolean {
  return MARKUP.test(sample);
}

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}
