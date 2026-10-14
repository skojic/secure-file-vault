// Users and uploaded files for access tests.
import { randomUUID } from "node:crypto";
import type { CurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { uploadFile } from "@/server/files/upload";
import { pngBytes, streamOf } from "./files";

export async function makeUser(username: string, role: "admin" | "staff" = "staff"): Promise<CurrentUser> {
  const [u] = await db.insert(users).values({ name: username, username, passwordHash: "x", role }).returning();
  return { id: u.id, name: u.name, username: u.username, role: u.role };
}

export async function uploadPng(owner: CurrentUser, name = "photo.png", bytes = pngBytes(3000)) {
  const { id } = await uploadFile(owner, { body: streamOf(bytes), declaredLength: bytes.length, fileName: name, idempotencyKey: randomUUID() });
  return { id, bytes };
}
