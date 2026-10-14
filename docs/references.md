# References

Official documentation first. Every URL below returned HTTP 200 on 2026-10-14.
For Next.js, the installed version's docs in `node_modules/next/dist/docs/` win over the website.

## Next.js
- Authentication guide (sessions, DAL, optimistic Proxy checks): https://nextjs.org/docs/app/guides/authentication
- Data security (Server Action origin check, `server-only`): https://nextjs.org/docs/app/guides/data-security
- Proxy file convention (formerly Middleware): https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- `proxyClientMaxBodySize` (10 MB default buffer): https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyClientMaxBodySize
- `serverActions.bodySizeLimit` (1 MB default): https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions
- Route handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Content Security Policy: https://nextjs.org/docs/app/guides/content-security-policy

## Security
- OWASP Password Storage: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP File Upload: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- OWASP Session Management: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP Authentication: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Authorization: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP CSRF Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- RFC 6266, Content-Disposition: https://www.rfc-editor.org/rfc/rfc6266

## Libraries
- Drizzle + PostgreSQL: https://orm.drizzle.team/docs/get-started-postgresql · migrations: https://orm.drizzle.team/docs/migrations
- Prisma + Next.js: https://www.prisma.io/docs/guides/nextjs · Migrate: https://www.prisma.io/docs/orm/prisma-migrate
- Better Auth: https://www.better-auth.com/docs/installation · username plugin: https://www.better-auth.com/docs/plugins/username
- Auth.js credentials: https://authjs.dev/getting-started/authentication/credentials
- `@node-rs/argon2`: https://github.com/napi-rs/node-rs/tree/main/packages/argon2
- `file-type`: https://github.com/sindresorhus/file-type
- Zod: https://zod.dev
- Vitest: https://vitest.dev/guide/ · Playwright: https://playwright.dev/docs/intro
- PostgreSQL: https://www.postgresql.org/docs/current/
- S3 presigned URLs: https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html

## Agent tooling
- AGENTS.md format: https://agents.md/
- Claude Code memory (CLAUDE.md, `@` imports, AGENTS.md): https://code.claude.com/docs/en/memory
- Claude Code skills: https://code.claude.com/docs/en/skills
- Agent Skills standard: https://agentskills.io
- Warp skills (reads `.claude/skills/`): https://docs.warp.dev/agent-platform/warp-agents/skills
