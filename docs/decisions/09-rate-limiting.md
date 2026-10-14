# 09 · Rate limiting

**Question:** where do we count attempts on login, registration and upload?

## Option A — fixed-window counter in a PostgreSQL table (default)
- **Why it would be better:** no new infrastructure. Survives restarts and works across instances. One upsert per attempt (`INSERT … ON CONFLICT DO UPDATE SET count = count + 1`)
- **What could go wrong:** adds write load to the primary database under attack, which is exactly when you need it healthy. Fixed windows allow a burst at the window edge. Needs a cleanup of old rows

## Option B — Redis (or another in-memory store)
- **Why it would be better:** built for this: atomic increments with expiry, sliding windows, very low latency. Keeps attack traffic off the main database
- **What could go wrong:** one more service to run, secure and monitor. If Redis is down you must choose fail-open (attackers pass) or fail-closed (users locked out). A per-process in-memory map is not an alternative: it breaks with two instances

## Default, and when to switch
Postgres, from the first login PR, because argon2 makes each attempt expensive (F6). Switch to Redis when login traffic or attacks measurably load the database.
Key by IP **and** by normalised username. Trust `X-Forwarded-For` only from a known proxy.

## Sources
- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
