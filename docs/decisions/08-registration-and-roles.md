# 08 · Registration and roles

**Question:** who can create an account, and who can become admin? The brief lists `type` as a registration field.

## Option A — invite-only, self-registration always `staff` (default)
- **Why it would be better:** on a sensitive-data app, open signup gives anyone a staff account and free storage. Invites (single-use, expiring, hashed) keep the door closed with one table. "Username taken" is safe to show because only invited people see it (E3)
- **What could go wrong:** admins carry the onboarding work. Lost invites need a re-issue flow. The first admin must come from a seed script, which needs its own care (F8)

## Option B — open registration, role chosen by the form
- **Why it would be better:** literal reading of the brief; fastest to build and demo
- **What could go wrong:** if a visitor can pick `admin`, the access rule is meaningless. Even with `staff` forced, anyone gets in, so rate limiting, quotas and malware scanning become blockers, not follow-ups. Username enumeration through registration

## Default, and when to switch
Invite-only, configurable as `REGISTRATION_MODE=invite|open|closed`. The field is stored as `role`; only the seed or an admin creates admins. Users are disabled, never hard-deleted (keeps E18 meaningful).
For a time-boxed build, ship open mode with role forced to `staff`, and say out loud that invite mode is next.

## Sources
- https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
