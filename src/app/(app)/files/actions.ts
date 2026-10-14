"use server";

import { z } from "zod";
import { type FormState, toFormState } from "@/server/action-errors";
import { getCurrentUser } from "@/server/auth/current-user";
import { NotFoundError, UnauthorizedError } from "@/server/errors";
import { deleteFile } from "@/server/files/service";

const deleteSchema = z.object({
  fileId: z.string().max(64),
  version: z.string().max(64),
  idempotencyKey: z.uuid(),
});

export type DeleteState = FormState | { status: "done" };

export async function deleteFileAction(_prev: DeleteState, formData: FormData): Promise<DeleteState> {
  const parsed = deleteSchema.safeParse({
    fileId: formData.get("fileId"),
    version: formData.get("version"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError("no session");
    await deleteFile(user, parsed.data);
    return { status: "done" };
  } catch (err) {
    // A file you may not see and a file that is gone read the same (rule 4).
    if (err instanceof NotFoundError) return { status: "error", message: "This file no longer exists." };
    return toFormState(err);
  }
}
