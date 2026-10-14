// Empties the application tables between tests that share the test database.
import { sql } from "drizzle-orm";

export async function resetTables() {
  const { db } = await import("@/server/db/client");
  await db.execute(sql`TRUNCATE users, idempotency_keys RESTART IDENTITY CASCADE`);
}
