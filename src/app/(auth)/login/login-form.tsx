"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import type { FormState } from "@/server/action-errors";
import { loginAction } from "./actions";

export function LoginForm() {
  const params = useSearchParams();
  const [state, formAction, pending] = useActionState<FormState, FormData>(loginAction, { status: "idle" });

  return (
    <form action={formAction}>
      {params.get("registered") === "1" && <p role="status">Account created. Sign in to continue.</p>}
      <input type="hidden" name="next" value={params.get("next") ?? ""} />
      <label>
        Username
        <input name="username" autoComplete="username" required />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.status === "error" && state.message && <p role="alert">{state.message}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
