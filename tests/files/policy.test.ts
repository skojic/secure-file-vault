// The four required tests for the one access rule (AGENTS.md hard limits, rule 2).
import { describe, expect, it } from "vitest";
import type { CurrentUser } from "@/server/auth/session";
import { canAccessFile } from "@/server/files/policy";

const uploader: CurrentUser = { id: "11111111-1111-4111-8111-111111111111", name: "Ana", username: "ana", role: "staff" };
const admin: CurrentUser = { id: "22222222-2222-4222-8222-222222222222", name: "Root", username: "root", role: "admin" };
const otherStaff: CurrentUser = { id: "33333333-3333-4333-8333-333333333333", name: "Bojan", username: "bojan", role: "staff" };
const file = { uploaderId: uploader.id };

describe("canAccessFile", () => {
  it("uploader allowed", () => expect(canAccessFile(uploader, file)).toBe(true));
  it("admin allowed", () => expect(canAccessFile(admin, file)).toBe(true));
  it("other staff denied", () => expect(canAccessFile(otherStaff, file)).toBe(false));
  it("anonymous denied", () => expect(canAccessFile(null, file)).toBe(false));
});
