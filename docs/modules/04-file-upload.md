# 04 · File upload

**Goal:** authenticated users upload one file per request; bytes go to storage, metadata to `files`.

## Files
`src/server/storage/{types,local-disk}.ts` · `src/server/files/{upload,service}.ts` · `src/server/files/allowed-types.ts` ·
`src/app/api/files/route.ts` (PUT) · `src/lib/content-disposition.ts` · `tests/files/upload.test.ts`

## Steps
1. `StorageProvider` interface: `put(key, stream)`, `open(key)`, `delete(key)`. Web streams; no file paths leak out
2. `LocalDiskStorage` writes under `STORAGE_DIR` outside `public/`, to a temp name, renamed on success (F4)
3. Client, before sending: size and type pre-check, one `Idempotency-Key` per selected file (kept across retries), upload button disabled while sending. Convenience only (rule 29)
4. Route (shape): check `Origin` → reject `Content-Length > MAX_UPLOAD_BYTES` → require a UUID `Idempotency-Key` → `getCurrentUser()` → hand the body stream to the service
5. Service, in gate order ([request-flow.md](../security/request-flow.md)): claim the key (request hash = `X-File-Name` + declared length; a completed key replays 201 with the same id) → quota (E13) → insert row `pending` → stream through a byte counter → sniff type from the first chunk (`file-type`) → write with a storage timeout → mark `ready` → complete the key
6. Any failure: delete blob and row, release the key, return a typed error (413 too large, 415 type, 507 or 503 storage)
7. `health.ts` gains the `STORAGE_DIR` writable check (F11)
8. Filename: from an `X-File-Name` header (percent-encoded), stripped of control chars and path separators, max 255
9. Optional: per-user quota before writing (E13)

## Rules
11–18, 24–26, 28, 29 in [security/rules.md](../security/rules.md)

## Scenarios
H4, F1 (orphan blob), F4 (client aborts), F5 (body limits), F9 (disk full), F12 (slow storage), E9 (types without magic bytes), E10 (filename), E11 (size bounds), E12 (duplicates), E13 (quota race), E14 (proxy buffering), E20 (double submit), E21 (key reuse), B1

## Done when
- `MAX` bytes succeeds, `MAX + 1` returns 413 whether or not `Content-Length` is sent
- A `.png`-named HTML file is rejected with 415
- An aborted upload leaves no row and no blob
- A request with a foreign `Origin` returns 403 and writes nothing
- The stored key is a UUID; the original name appears only in the row
- The same upload sent twice with one `Idempotency-Key` leaves one row and one blob and both responses carry the same id; a request without the header returns 400 and writes nothing

## Narrate it
"We write the row first as pending, so every byte in storage has a row we can find; a crash never leaves an invisible copy of sensitive data.
We count bytes while streaming because the client controls `Content-Length` and can lie about it."
