// The only file access rule (rule 2). Every list, download and delete goes through it.
import "server-only";
import type { CurrentUser } from "@/server/auth/session";

export function canAccessFile(user: CurrentUser | null, file: { uploaderId: string }): boolean {
  if (!user) return false;
  return user.id === file.uploaderId || user.role === "admin";
}
