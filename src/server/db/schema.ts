// Tables per docs/architecture/data-model.md. Timestamps are timestamptz and default to the
// database's now(), never the app clock.
// No `import "server-only"` here: drizzle-kit loads this file in plain Node, where it throws.
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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

export const idempotencyState = pgEnum("idempotency_state", ["in_progress", "completed"]);

// One row per user intent (rule 26). The key is client-generated; the stored result is small and
// never holds file contents, tokens or request bodies.
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: uuid("key").primaryKey(),
    // Null for anonymous actions (registration).
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    route: text("route").notNull(),
    requestHash: text("request_hash").notNull(),
    state: idempotencyState("state").notNull().default("in_progress"),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("idempotency_keys_expires_at_idx").on(t.expiresAt)],
);
