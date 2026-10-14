// Tables per docs/architecture/data-model.md. Timestamps are timestamptz and default to the
// database's now(), never the app clock.
// No `import "server-only"` here: drizzle-kit loads this file in plain Node, where it throws.
import { bigint, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

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

export const fileStatus = pgEnum("file_status", ["pending", "ready"]);

// Metadata only; the bytes live in storage under `storage_key` (rules 16–18). A row exists before
// its bytes (pending) so every stored byte has a row that finds it (F1). Reads filter status = 'ready'.
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Metadata only, never a path (rule 16).
    originalName: text("original_name").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    // Detected from the bytes, never the client's Content-Type (rule 15).
    contentType: text("content_type").notNull(),
    storageKey: uuid("storage_key").notNull().unique(),
    status: fileStatus("status").notNull().default("pending"),
    uploaderId: uuid("uploader_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    // NULLS FIRST is what plain `ORDER BY ... DESC` means; an index with a different null order cannot
    // supply that order, and the list query falls back to a full sort (B4).
    index("files_uploader_created_idx").on(t.uploaderId, t.createdAt.desc().nullsFirst(), t.id.desc().nullsFirst()),
    index("files_created_idx").on(t.createdAt.desc().nullsFirst(), t.id.desc().nullsFirst()),
  ],
);

// The cookie holds the raw token; this table holds only its SHA-256 (rule 8), so a database leak
// does not hand out live sessions.
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId), index("sessions_expires_at_idx").on(t.expiresAt)],
);

// Fixed-window counters (decisions/09). `key` is a SHA-256 of the scope and subject, so raw IPs are not stored.
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] }), index("rate_limits_window_start_idx").on(t.windowStart)],
);

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
