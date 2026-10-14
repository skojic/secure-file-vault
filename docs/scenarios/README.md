# Scenarios

Every scenario has an ID, a proposal and a test. Modules list the IDs they must cover; PRs name them.

- [happy-path.md](happy-path.md) — `H1`–`H6`, the flow when everything works
- [failures.md](failures.md) — `F1`–`F10`, something breaks
- [edge-cases.md](edge-cases.md) — `E1`–`E19`, valid but unusual input or state
- [bottlenecks.md](bottlenecks.md) — `B1`–`B6`, what limits scale or speed

## Entry format
- **ID. Name** — what happens
  - **Proposal:** what to build, and why
  - **Test:** the assertion that proves it

## Adding one
Take the next free ID. Never renumber; tests and PRs reference these IDs.
Claims not checked against the installed version are marked *(unverified)* with what would settle them.
