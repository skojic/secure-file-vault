# 07 · Download delivery

**Question:** how does an authorized user receive the bytes?

## Option A — stream through an authorized route handler (default)
- **Why it would be better:** the policy check runs on every single download. Headers (`attachment`, `nosniff`, `no-store`) are ours. Works with local disk. Every download can be logged for audit
- **What could go wrong:** every byte passes through Node (B1). Large or many downloads tie up the server. Range requests and resumable downloads are extra work

## Option B — presigned URLs from object storage
- **Why it would be better:** the server checks policy once, then the storage service serves the bytes. Scales without touching app servers; supports Range natively
- **What could go wrong:** the URL is a bearer token. Anyone holding it can download until it expires: forwarded emails, browser history, proxy logs. Revoking access does not revoke an issued URL. Requires S3 (decision 05)

## Default, and when to switch
Stream. Move to presigned URLs only with S3 in place, a TTL of minutes, issued after `canAccessFile`, and a download audit log.

## Sources
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html
- https://www.rfc-editor.org/rfc/rfc6266 (Content-Disposition)
