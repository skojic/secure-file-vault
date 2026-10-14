"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { type DeleteState, deleteFileAction } from "./actions";

// Asks before an irreversible action (rule 29). The server does not rely on the dialog: it deletes
// only if the file still has the version shown here (rule 27).
export function DeleteButton({ fileId, version, name }: { fileId: string; version: string; name: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<DeleteState, FormData>(deleteFileAction, { status: "idle" });
  // One key per confirmed intent, kept if the user retries after an error.
  const key = useRef<string | null>(null);

  useEffect(() => {
    if (state.status === "done") router.refresh();
  }, [state, router]);

  function submit(formData: FormData) {
    if (pending) return;
    if (!window.confirm(`Delete “${name}”? This cannot be undone.`)) return;
    key.current ??= crypto.randomUUID();
    formData.set("idempotencyKey", key.current);
    formAction(formData);
  }

  return (
    <form action={submit}>
      <input type="hidden" name="fileId" value={fileId} />
      <input type="hidden" name="version" value={version} />
      <button type="submit" disabled={pending}>
        {pending ? "Deleting…" : "Delete"}
      </button>
      {state.status === "error" && <span role="alert">{state.message}</span>}
    </form>
  );
}
