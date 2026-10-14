# 05 · Storage provider

**Question:** where do file bytes live?

## Option A — local disk behind a `StorageProvider` interface (default)
- **Why it would be better:** zero external services, runs anywhere, trivial to test. The interface (`put`, `open`, `delete` with Web streams) means the S3 adapter later touches one file, not the services. Files live outside `public/`, so nothing is web-reachable by accident
- **What could go wrong:** one machine only; a second instance cannot see the files (B1). Needs a persistent volume and backups taken together with the DB. No encryption at rest unless the disk provides it. File permissions are on you

## Option B — S3-compatible object storage from day one
- **Why it would be better:** scales across instances, server-side encryption and lifecycle rules built in, presigned URLs available later (decision 07). Matches production from the first commit
- **What could go wrong:** needs credentials, a bucket policy and a local emulator for dev and CI. A public bucket or an over-broad IAM policy is a classic data leak. Network failures become a new failure mode (F9)

## Default, and when to switch
Local disk behind the interface. Switch before running more than one instance or on any platform without a persistent disk (decision 11).
Before choosing a local S3 emulator, check that its repository is still maintained.

## Sources
- https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html (store outside the webroot)
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html
