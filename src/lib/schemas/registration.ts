// One schema for the form and the Server Action (rules 25, 29). The client check is convenience;
// the action parses the same schema again.
import { z } from "zod";
import { USERNAME_PATTERN, normalizeUsername } from "@/lib/username";

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

// Characters as code points, so 12 emoji count as 12, not 24 (E4).
const codePoints = (s: string) => [...s].length;

export const registrationSchema = z.object({
  name: z.string().trim().min(1, "required").max(100, "too_long"),
  // The raw cap bounds the work NFKC does on hostile input.
  username: z.string().max(64, "invalid").transform(normalizeUsername).pipe(z.string().regex(USERNAME_PATTERN, "invalid")),
  password: z
    .string()
    .max(PASSWORD_MAX * 4, "too_long")
    .refine((p) => codePoints(p) >= PASSWORD_MIN, "too_short")
    .refine((p) => codePoints(p) <= PASSWORD_MAX, "too_long"),
});

export const registrationRequestSchema = registrationSchema.extend({
  idempotencyKey: z.uuid("invalid"),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;

// Field → code for the first issue on each field. Codes, never Zod's text or the input.
export function fieldCodes(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    fields[field] ??= issue.message;
  }
  return fields;
}
