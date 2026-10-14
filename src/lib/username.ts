// Shared by the registration form and the server (E1). NFKC folds fullwidth and compatibility
// characters, so "ａｄｍｉｎ" and "admin" are the same username.
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().normalize("NFKC").toLowerCase();
}
