import { z } from "zod";
import { normalizeUsername } from "@/lib/username";
import { PASSWORD_MAX } from "./registration";

// Login checks bounds only, never the registration rules, so the error stays generic.
// The caps keep hostile input from reaching argon2 (E4).
export const loginSchema = z.object({
  username: z.string().min(1, "required").max(64, "invalid").transform(normalizeUsername),
  password: z.string().min(1, "required").max(PASSWORD_MAX * 4, "invalid"),
});

export type LoginInput = z.infer<typeof loginSchema>;
