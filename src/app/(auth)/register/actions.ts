"use server";

import { redirect } from "next/navigation";
import { fieldCodes, registrationRequestSchema } from "@/lib/schemas/registration";
import { type FormState, toFormState } from "@/server/action-errors";
import { registerUser } from "@/server/auth/service";

// Shape gate: named fields only, parsed with the shared schema. A `role` field, if sent, is ignored.
export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registrationRequestSchema.safeParse({
    name: formData.get("name"),
    username: formData.get("username"),
    password: formData.get("password"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    const fields = fieldCodes(parsed.error);
    if (fields.idempotencyKey) return { status: "error", message: "Reload the page and try again." };
    return { status: "error", message: "Check the highlighted fields.", fields };
  }

  const { idempotencyKey, ...input } = parsed.data;
  try {
    await registerUser(input, idempotencyKey);
  } catch (err) {
    return toFormState(err);
  }
  redirect("/login?registered=1");
}
