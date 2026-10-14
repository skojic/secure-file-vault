// Cookie names only, so proxy.ts can check for a session without loading the database layer.
// The __Host- prefix needs Secure, so it is used in production only (see server/auth/session.ts).
export const SESSION_COOKIE_PRODUCTION = "__Host-vault_session";
export const SESSION_COOKIE_DEVELOPMENT = "vault_session";
export const SESSION_COOKIE_NAMES = [SESSION_COOKIE_PRODUCTION, SESSION_COOKIE_DEVELOPMENT] as const;
