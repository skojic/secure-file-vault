# 03 · Password hashing

**Question:** which algorithm turns a password into what we store?

## Option A — argon2id via `@node-rs/argon2` (default)
- **Why it would be better:** OWASP's first recommendation. Memory-hard, so GPU and ASIC guessing is expensive. Prebuilt native binaries, no compiler needed. OWASP minimum: `m=19456` (19 MiB), `t=2`, `p=1`, which are also the package defaults in 2.2.2
- **What could go wrong:** 19 MiB per concurrent hash; a login burst can exhaust memory (F6, B2). Native binary must exist for your platform (check in CI on the deploy OS). `Algorithm` is a `const enum` that `isolatedModules` cannot import; pass `2`

## Option B — bcrypt
- **Why it would be better:** decades of production use, available everywhere, small fixed memory, easy to explain
- **What could go wrong:** ignores input beyond 72 bytes, so long passphrases silently lose strength unless you cap at 72 bytes (E5). Not memory-hard, so GPUs crack it faster than argon2id at equal time cost. OWASP lists it only for legacy systems

## Default, and when to switch
argon2id. Use bcrypt only when argon2id cannot run on the platform. Store parameters in the hash (PHC string) so they can be raised later; `parseOptions()` reads them back for a rehash-on-login check.

## Sources
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://github.com/napi-rs/node-rs/tree/main/packages/argon2
