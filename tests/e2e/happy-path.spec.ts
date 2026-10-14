// H1–H6 in a real browser, plus the request guardrails that only show end to end: a double-clicked
// submit, a refused download for another user, and a confirmed delete.
import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { Client } from "pg";

test.describe.configure({ mode: "serial" });

const PASSWORD = "correct horse battery";
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1f, 0x15,
  0xc4, 0x89, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows as T[];
  } finally {
    await client.end();
  }
}

async function register(page: Page, username: string, { doubleClick = false } = {}) {
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill(username);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  const submit = page.getByRole("button", { name: "Create account" });
  if (doubleClick) await submit.dblclick();
  else await submit.click();
  await expect(page).toHaveURL(/\/login\?registered=1/);
}

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/files$/);
}

let fileHref = "";

test("H1, E20: registering with a double-clicked submit creates exactly one account", async ({ page }) => {
  await register(page, "ana", { doubleClick: true });
  await expect(page.getByRole("status")).toHaveText("Account created. Sign in to continue.");
  const rows = await query<{ n: number; role: string }>("SELECT count(*)::int AS n, min(role::text) AS role FROM users WHERE username = 'ana'");
  expect(rows[0]).toEqual({ n: 1, role: "staff" });
});

test("H2, H3: login sets an HttpOnly, SameSite=Lax cookie whose value is not stored", async ({ page, context }) => {
  await login(page, "ana");
  const cookie = (await context.cookies()).find((c) => c.name.endsWith("vault_session"));
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
  const stored = await query<{ id: string }>("SELECT id FROM sessions");
  expect(stored.map((r) => r.id)).not.toContain(cookie!.value);
  await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();
  await expect(page.getByText("No files yet.")).toBeVisible();
});

test("H4, H5: upload shows the file; download returns the same bytes", async ({ page }) => {
  await login(page, "ana");
  await page.locator('input[type="file"]').setInputFiles({ name: "holiday.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByRole("status")).toHaveText("Uploaded.");
  const link = page.getByRole("link", { name: "holiday.png" });
  await expect(link).toBeVisible();
  fileHref = (await link.getAttribute("href"))!;

  const downloadPromise = page.waitForEvent("download");
  await link.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("holiday.png");
  expect(readFileSync(await download.path())).toEqual(PNG);
});

test("rule 4: another staff member gets the standard 404 for that file and an empty list", async ({ page }) => {
  await register(page, "bojan");
  await login(page, "bojan");
  await expect(page.getByText("No files yet.")).toBeVisible();
  const res = await page.request.get(fileHref);
  expect(res.status()).toBe(404);
  expect(await res.json()).toEqual({ error: "not_found" });
});

test("rule 29, E22: delete asks first; dismissing keeps the file, confirming removes it", async ({ page }) => {
  await login(page, "ana");
  const row = page.getByRole("row", { name: /holiday\.png/ });

  page.once("dialog", (d) => d.dismiss());
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(row).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("No files yet.")).toBeVisible();
  expect(await query("SELECT id FROM files")).toHaveLength(0);
});

test("H6: logout ends the session; the old cookie no longer works and the list is not shown again", async ({ page, context, browser }) => {
  await login(page, "ana");
  const oldCookie = (await context.cookies()).find((c) => c.name.endsWith("vault_session"))!;
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  const replay = await browser.newContext();
  await replay.addCookies([oldCookie]);
  const other = await replay.newPage();
  await other.goto("/files");
  await expect(other).toHaveURL(/\/login/);
  await replay.close();
});
