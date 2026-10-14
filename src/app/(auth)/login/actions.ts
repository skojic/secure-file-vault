"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safe-redirect";
import { type FormState, toFormState } from "@/server/action-errors";
import { login } from "@/server/auth/service";
import { clientIp } from "@/server/client-ip";

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = formData.get("username");
  const password = formData.get("password");
  if (typeof username !== "string" || typeof password !== "string") {
    return { status: "error", message: "Incorrect username or password." };
  }
  try {
    await login({ username, password }, { jar: await cookies(), ip: clientIp(await headers()) });
  } catch (err) {
    return toFormState(err);
  }
  redirect(safeNextPath(formData.get("next")));
}
