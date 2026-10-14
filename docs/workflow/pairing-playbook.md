# Pairing playbook

For building this module in a time-boxed pair session (60–90 minutes) while a junior watches and asks questions.
Structure and reasoning first; finishing is optional.

## Time split (percent of the session)
- **0–10% · Frame.** Restate the brief in your words. Name the three risks: who gets in, who sees what, what gets stored. Agree that stubs are fine
- **10–25% · Skeleton.** Scaffold, folder tree, `env.ts`, DB container, `AGENTS.md`. Say out loud why each folder exists
- **25–45% · Auth.** Schema for users and sessions, `password.ts`, `createSession`, `getCurrentUser()`. Register and login can be thin forms
- **45–65% · Files.** `canAccessFile` + four tests **first**, then `StorageProvider`, then the upload route, then download
- **65–85% · Verify.** Run lint, typecheck, tests. Show one failing test turning green
- **85–100% · Hand over.** Walk the junior through AGENTS.md and the "next steps" list. Name what you would do with another day

## If time runs short, cut in this order
1. UI polish (plain forms are fine)
2. Rate limiting and invites (say they are next, point to decisions 08 and 09)
3. Upload streaming details (stub the service behind the interface)
Never cut: password hashing, the policy function and its tests, the 404 rule.

## Working with the agent in the session
- Narrate the prompt before sending it: "I'm asking it to plan only, because I want to check the API surface first"
- Read the diff aloud with the junior; reject one thing on purpose if it deserves it and say why
- When the agent claims something about a library, check `node_modules` together; it teaches the habit

## Mentoring moves
- Ask the junior to predict what a test will do before running it
- When they ask "why", answer with the failure it prevents, not the rule
- Leave them one small, safe task in the handover (e.g. add the `E16` test)

## Questions to expect, with short answers
In [narration.md](narration.md) → "Questions a junior will ask", and in each module's "Narrate it".
