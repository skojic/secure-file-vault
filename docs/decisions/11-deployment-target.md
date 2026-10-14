# 11 · Deployment target

**Question:** where does the app run? It decides storage, body limits and where migrations run.

## Option A — one Docker container with a persistent volume, managed PostgreSQL (default)
- **Why it would be better:** local-disk storage works unchanged. Long uploads are not cut by function timeouts. Migrations run as a separate step before the container starts (F7). Same image in dev, CI and prod
- **What could go wrong:** you run the box: patching, TLS, backups of the volume and the database together. Scaling past one instance requires decision 05 option B first

## Option B — serverless platform (for example, Vercel) with S3 and managed PostgreSQL
- **Why it would be better:** no servers to patch, preview deployments per PR, automatic scaling and TLS
- **What could go wrong:** no persistent disk, so S3 is mandatory from day one. Platform request-body and duration limits can block large uploads through the function *(check the platform's current limits before choosing)*, which pushes you to direct-to-S3 uploads, a different security design. Connection pooling to PostgreSQL needs care

## Default, and when to switch
Container with a volume. Choose serverless when the team prefers managed infrastructure and accepts S3 plus direct uploads.

## Sources
- https://nextjs.org/docs/app/getting-started/route-handlers
