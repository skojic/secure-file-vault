# 06 · Upload transport

**Question:** how do the bytes get from the browser to the server?

## Option A — `PUT /api/files` with the raw file as the body (default)
- **Why it would be better:** the body is the file, so we can count bytes exactly while streaming and sniff the type from the first chunk. No multipart parser dependency. Works for any file size the server allows
- **What could go wrong:** one request per file. Metadata (filename) travels in a header and must be encoded and sanitised. Upload progress needs `XMLHttpRequest` in the browser. No built-in origin check, so we add one (rule 13)

## Option B — multipart form (`<form>` + Server Action, or a multipart route handler)
- **Why it would be better:** native HTML forms, several files and fields in one request, progressive enhancement. Server Actions get a built-in Origin/Host check
- **What could go wrong:** Server Actions cap the body at 1 MB by default (`serverActions.bodySizeLimit`), and raising it means the framework parses large bodies before your code sees them. A multipart route handler either buffers via `request.formData()` *(unverified whether it streams in the installed version; check the Next.js route handler docs)* or needs a streaming parser dependency

## Default, and when to switch
Raw-body PUT. Use a Server Action only for small metadata forms, never for file bytes.
Whatever is chosen, exclude the upload path from `proxy.ts` (E14).

## Sources
- https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions
- https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyClientMaxBodySize
- https://nextjs.org/docs/app/guides/data-security (Server Action origin check)
