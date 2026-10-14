"use client";

import { useActionState, useRef, useState } from "react";
import { fieldCodes, PASSWORD_MAX, PASSWORD_MIN, registrationSchema } from "@/lib/schemas/registration";
import type { FormState } from "@/server/action-errors";
import { registerAction } from "./actions";

const FIELD_MESSAGES: Record<string, Record<string, string>> = {
  name: { required: "Enter your name.", too_long: "Use at most 100 characters." },
  username: { invalid: "Use 3–32 characters: lowercase letters, digits, dot, underscore or hyphen." },
  password: { too_short: `Use at least ${PASSWORD_MIN} characters.`, too_long: `Use at most ${PASSWORD_MAX} characters.` },
};

const describe = (field: string, code?: string) => (code ? (FIELD_MESSAGES[field]?.[code] ?? "Check this field.") : undefined);

export function RegisterForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(registerAction, { status: "idle" });
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  // One key per intent. Created when the user submits, never while rendering: a key rendered into a
  // prerendered page would be shared by every visitor. Kept across retries; reset when input changes.
  const key = useRef<string | null>(null);

  function submit(formData: FormData) {
    if (pending) return;
    const check = registrationSchema.safeParse(Object.fromEntries(formData));
    if (!check.success) {
      setClientErrors(fieldCodes(check.error));
      return;
    }
    setClientErrors({});
    key.current ??= crypto.randomUUID();
    formData.set("idempotencyKey", key.current);
    formAction(formData);
  }

  const errors = { ...state.fields, ...clientErrors };

  return (
    <form action={submit} onChange={() => (key.current = null)} noValidate>
      <label>
        Name
        <input name="name" autoComplete="name" required maxLength={100} aria-invalid={Boolean(errors.name)} />
      </label>
      {errors.name && <p role="alert">{describe("name", errors.name)}</p>}

      <label>
        Username
        <input name="username" autoComplete="username" required aria-invalid={Boolean(errors.username)} />
      </label>
      {errors.username && <p role="alert">{describe("username", errors.username)}</p>}

      <label>
        Password
        <input name="password" type="password" autoComplete="new-password" required aria-invalid={Boolean(errors.password)} />
      </label>
      {errors.password && <p role="alert">{describe("password", errors.password)}</p>}

      {state.status === "error" && state.message && <p role="alert">{state.message}</p>}

      <button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
