// Tables per docs/architecture/data-model.md. Timestamps are timestamptz and default to the
// database's now(), never the app clock.
// No `import "server-only"` here: drizzle-kit loads this file in plain Node, where it throws.
import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const userRole = pgEnum("user_role", ["admin", "staff"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // Stored normalised (E1); the unique constraint is the real duplicate check.
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull(),
  // Users are disabled, never deleted (decisions/08).
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  ...timestamps,
});
