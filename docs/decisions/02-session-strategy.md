# 02 · Session strategy

**Question:** where does "who is logged in" live?

## Option A — opaque token, session row in PostgreSQL (default)
- **Why it would be better:** instant revocation. Logout, disabling a user or a role change takes effect on the next request. The cookie holds no data, only a random token; the DB holds its SHA-256, so a DB leak does not yield usable cookies
- **What could go wrong:** one indexed lookup per request (cheap, see B3). If the DB is down, nobody is authenticated; handle it as 503, not anonymous (F3)

## Option B — stateless signed JWT in a cookie
- **Why it would be better:** no DB read per request; works across services that share the signing key; fits edge runtimes
- **What could go wrong:** a token stays valid until it expires, so disabling a user does not take effect immediately unless you add a denylist, which is a session table again. Key rotation and algorithm configuration become your problem. Role stored in the token goes stale

## Default, and when to switch
DB sessions. Sensitive data means revocation matters more than one saved query.
Consider JWTs only for short-lived service-to-service calls, never as the user session here.

## Sources
- https://nextjs.org/docs/app/guides/authentication (stateless vs database sessions)
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
