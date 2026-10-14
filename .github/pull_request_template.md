## What changed
<!-- One module or one fix per PR. -->

## Scenarios covered
<!-- IDs from docs/scenarios/, e.g. E20, F12. Each has a test named after it. -->

## Request guardrails (docs/security/request-flow.md)
- [ ] Gates run in order: shape → identity → authorization → duplicate → dependencies → effect (rule 24)
- [ ] Input parsed with an explicit schema; only named fields are written (rule 25)
- [ ] Actions that create something or cannot be undone take an idempotency key (rule 26)
- [ ] Irreversible changes check the version the user saw (rule 27)
- [ ] Database and storage calls have timeouts; failures return 503 or 507 and write nothing (rule 28)
- [ ] Client-side checks are repeated on the server (rule 29)

## How it was verified
<!-- Paste the summary lines of lint, typecheck, npm test and npm run test:e2e. -->

## New dependencies
<!-- Name, version, and why it is needed. "None" if none. -->
