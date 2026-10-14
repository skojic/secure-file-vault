# 05 · File access

**Goal:** only the uploader or an admin can list, view or download a file.

## Files
`src/server/files/policy.ts` · `src/server/files/service.ts` (`listFiles`, `getFileForDownload`) ·
`src/app/(app)/files/page.tsx` · `src/app/api/files/[id]/download/route.ts` · `tests/files/policy.test.ts` · `tests/files/download.test.ts`

## Steps
1. Write `canAccessFile(user, file)` and its four tests **first**
2. `listFiles(user)`: staff → `WHERE uploader_id = $1 AND status = 'ready'`; admin → `status = 'ready'` only. Keyset pagination on `(created_at, id)` (B4)
3. `getFileForDownload(user, id)`: validate `id` as UUID → load → policy → open blob. Any "no" is `NotFoundError`
4. Route `GET`: type `ctx` with `RouteContext<'/api/files/[id]/download'>`; `await ctx.params`
5. Response headers per rule 20. Pages listing files also send `Cache-Control: no-store`
6. Log denied attempts (user id, file id) for the audit trail

## Rules
1–5, 19–21, 23, 24 in [security/rules.md](../security/rules.md)

## Scenarios
H5, F2 (row without blob), E16 (bad UUID), E17 (HEAD and Range), E18 (disabled uploader), B4

## Done when
- Policy: uploader allowed, admin allowed, other staff denied, anonymous denied
- Other staff's file, missing file and `not-a-uuid` all return identical 404s
- A staff list never contains another user's file, even with 1,000 rows from others
- A row whose blob is gone returns 404 and logs at error level

## Narrate it
"One function decides access, so there is exactly one place to review and test; every route calls it instead of repeating the rule.
We answer 404 instead of 403 because 403 tells an attacker the file exists."
