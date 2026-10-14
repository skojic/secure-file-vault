import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "@/server/auth/session";
import { config, proxy } from "@/proxy";

describe("proxy (optimistic redirects only)", () => {
  it("H3: a protected page without a session cookie redirects to /login with the return path", () => {
    const res = proxy(new NextRequest("http://localhost/files?sort=new"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/files?sort=new");
  });

  it("H3: with a cookie it lets the request through; the page still checks the session", () => {
    const req = new NextRequest("http://localhost/files", { headers: { cookie: `${SESSION_COOKIE}=anything` } });
    const res = proxy(req);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("rule 12: the matcher never covers /api, so upload bodies are not buffered (E14)", () => {
    const matchers = ([] as string[]).concat(config.matcher);
    expect(matchers.length).toBeGreaterThan(0);
    for (const m of matchers) expect(m.startsWith("/api")).toBe(false);
  });
});

describe("logout", () => {
  // Server Actions are POST-only, so a GET can never reach logout. This proves no GET route was added.
  it("E8: no route handler exposes logout over GET", () => {
    const routes: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name === "route.ts") routes.push(p);
      }
    };
    walk("src/app");
    for (const file of routes) {
      const text = readFileSync(file, "utf8");
      if (/logout/i.test(file) || /logout/i.test(text)) expect(text).not.toMatch(/export\s+(async\s+)?function\s+GET/);
    }
    const action = readFileSync("src/app/(app)/actions.ts", "utf8");
    expect(action.startsWith('"use server"')).toBe(true);
    expect(action).toMatch(/export async function logoutAction/);
  });
});
