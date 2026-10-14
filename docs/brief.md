# Brief

Build the foundation of a secure file upload feature for an app used by enterprise customers
with sensitive data. Structure, reasoning and safety matter more than feature count.
Other developers, juniors included, must be able to continue safely after you.

## Required
1. **Setup**
   - Next.js app in TypeScript
   - PostgreSQL with an ORM (see [decisions/04-orm.md](decisions/04-orm.md))
   - No all-in-one backend platform (no Supabase, Firebase or similar). The backend is ours
   - A project structure ready for a growing team, with base config and utilities
2. **Registration:** fields `name`, `username`, `password`, `type` (`admin` | `staff`). Passwords stored securely
3. **Login:** username + password, then session- or token-based access
4. **Upload:** authenticated users only. Store bytes in local or cloud storage. A `files` table holds
   file name, size, storage location (URL or key), uploader reference, created/updated timestamps
5. **Access rules:** only the uploader or any admin may view or download a file. Everyone else is refused
6. **Collaboration readiness:** conventions, documentation and AI context (rule files, setup notes)

Stubs and partial features are acceptable. Unexplained choices are not.

## What good looks like
- **Architecture:** concerns isolated, conventions written down, layers obvious from the folder tree
- **Security:** authentication, authorization and data safety designed, not bolted on
- **AI workflow:** plan, iterate and validate with an agent, visibly
- **Mentorship:** every decision can be explained to a junior in two sentences
- **Code clarity:** readable, maintainable, current Next.js practice

## Interpretations (decide and record, do not assume)
- `type` is stored as `role`. Self-registration cannot create an admin → [decisions/08-registration-and-roles.md](decisions/08-registration-and-roles.md)
- "Refused" means 404, not 403, so the response does not confirm the file exists → [security/rules.md](security/rules.md)
