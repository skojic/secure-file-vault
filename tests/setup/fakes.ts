// In-memory stand-ins for request-scoped Next.js APIs.
import type { CookieJar, CookieOptions } from "@/server/auth/session";

export class FakeJar implements CookieJar {
  readonly store = new Map<string, { value: string; options?: CookieOptions }>();
  get(name: string) {
    const entry = this.store.get(name);
    return entry ? { value: entry.value } : undefined;
  }
  set(name: string, value: string, options?: CookieOptions) {
    this.store.set(name, { value, options });
  }
  delete(name: string) {
    this.store.delete(name);
  }
}
