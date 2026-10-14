# Narration comments

Comments in this repo serve two readers: the next developer, and you explaining the code out loud
(to a junior, in a system design interview, in a live coding round). The tags below separate the two,
so the teaching layer can be stripped later with the `deslop` skill without touching the comments that must stay.

## Tags
Kept permanently:
- `/** … */` file header — what this file is and why it exists, 1–3 lines
- `/** … */` on every exported function — what it returns and the one rule it enforces
- `// WHY:` — a reason the code alone cannot show (a trade-off, a spec, a bug avoided)
- `// SECURITY:` — an invariant that must not be removed (hashing, scoping, 404-not-403)
- `// TODO(owner):` — known follow-up with an owner

Teaching layer, removed by `deslop`:
- `// STEP n:` — the flow, one line per chunk, so you can walk through the function in order
- `// NARRATE:` — what you would say out loud: the trade-off, the alternative, the interview angle

## Rules
- Explain **why** and **what could go wrong**, not what the syntax does. `// increment i` is noise
- One `STEP` per logical chunk, 3–7 per function. More means the function wants splitting
- A `NARRATE` block is at most 3 lines and names the alternative you rejected
- Never put secrets, real usernames or customer data in comments
- If you delete the code, delete its comments

## Example (illustrative; `db` and `sessions` come from `src/server/db`)
```ts
/** Session creation and lookup. The only file that knows how a token maps to a user. */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { sessions } from "@/server/db/schema";

/**
 * Creates a session row and returns the raw token for the cookie.
 * Only sha256(token) is stored, so a leaked database cannot be replayed as a login.
 */
export async function createSession(userId: string) {
  // NARRATE: This is where "password was correct" becomes "logged in". Everything after
  // NARRATE: trusts the cookie, so the token must be unguessable and the stored copy useless.
  // NARRATE: Alternative was a signed JWT; rejected because we could not revoke it instantly.

  // STEP 1: 32 random bytes = 256 bits of entropy; base64url is safe inside a cookie.
  const token = randomBytes(32).toString("base64url");

  // STEP 2: Hash before storing.
  // SECURITY: never persist the raw token; the row id is its SHA-256.
  const id = createHash("sha256").update(token).digest("hex");

  // STEP 3: Expiry is computed by the database clock, not the app server's.
  // WHY: several app servers may disagree on the time; one database cannot.
  const [row] = await db
    .insert(sessions)
    .values({ id, userId, expiresAt: sql`now() + interval '7 days'` })
    .returning({ expiresAt: sessions.expiresAt });

  // STEP 4: The caller sets the cookie; this module never touches HTTP.
  return { token, expiresAt: row.expiresAt };
}
```
After `deslop`, only the file header, the JSDoc, `SECURITY:` and `WHY:` remain.

## Talk tracks (30 seconds each)
- **Login:** "Normalise the username, load the user, verify with argon2id. If the user does not exist we still verify against a dummy hash so timing does not leak which names exist. On success we delete any old session and create a new one, which blocks session fixation."
- **Upload:** "Origin check, then auth, then a size check on the header. The body streams through a byte counter, the first chunk is sniffed for the real type, and the row goes pending → ready so a crash never leaves an untracked file."
- **Download:** "Validate the id, resolve the user, load the row, ask `canAccessFile`. Every 'no' is the same 404. Open the blob before sending headers so a missing file is an error, not an empty success."
- **Structure:** "Routes are thin, services own the rules, one policy function decides access, and `server-only` stops server code leaking into the browser bundle."

## Questions a junior will ask
- *Why not check auth in proxy?* — Proxy runs before routing and the Next.js docs call its checks optimistic. A route can be reached in ways proxy does not anticipate; the service check cannot be skipped
- *Why 404 and not 403?* — 403 confirms the file exists
- *Why hash the session token?* — the cookie is the credential; the DB should not hold credentials
- *Why not trust `Content-Type`?* — the client writes it; the bytes do not lie as easily
