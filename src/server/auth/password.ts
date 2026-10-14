// argon2id at the OWASP minimum (rule 6, decisions/03). Every hash and verify passes through one
// semaphore, because each holds 19 MiB and a login burst could exhaust memory (F6).
import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { env } from "@/env";
import { Semaphore } from "@/server/concurrency";

const OPTIONS = {
  // Argon2id. `Algorithm` is a const enum that isolatedModules cannot import, so the value is inlined.
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const hashSlots = new Semaphore(env.ARGON2_MAX_CONCURRENCY);

export function hashPassword(password: string): Promise<string> {
  return hashSlots.run(() => hash(password, OPTIONS));
}

// False for a wrong password and for a malformed stored hash; never throws on bad input.
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await hashSlots.run(() => verify(storedHash, password));
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

// Runs one real verify against a fixed hash so an unknown username costs the same time as a wrong
// password (rule 10, E2). Always false.
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("dummy password that is never accepted");
  await verifyPassword(await dummyHash, password);
  return false;
}
