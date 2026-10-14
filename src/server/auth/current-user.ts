// The one way to ask "who is this request?" (rule 1). React cache() makes one lookup per request;
// nothing is cached across requests, so a role change or a disabled account applies immediately (E6).
import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { type CurrentUser, resolveSession, SESSION_COOKIE } from "./session";

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveSession(token);
});
