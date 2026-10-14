"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";

type Status = { kind: "idle" } | { kind: "uploading"; percent: number } | { kind: "done" } | { kind: "error"; message: string; retryable: boolean };

const MESSAGES: Record<number, string> = {
  400: "The upload was not accepted. Choose the file again.",
  401: "Your session ended. Sign in again.",
  403: "This upload was refused.",
  409: "This upload is still being processed. Try again in a moment.",
  413: "The file is too large, or it would exceed your storage quota.",
  415: "This file type is not allowed.",
  422: "This upload was already used for a different file. Choose the file again.",
  429: "Too many attempts. Wait a minute and try again.",
  503: "Storage is temporarily unavailable. Try again shortly.",
  507: "Storage is full. Try again later.",
};

// Retrying these with the same key is safe and meaningful; anything else needs a fresh choice.
const RETRYABLE = new Set([0, 409, 429, 503, 507]);

const extensionOf = (name: string) => (name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "");

export function UploadForm({ maxBytes, accept }: { maxBytes: number; accept: string[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // One key per selected file, kept across retries of that file (rule 26).
  const intent = useRef<{ file: File; key: string } | null>(null);

  function onChoose() {
    const file = input.current?.files?.[0];
    intent.current = file ? { file, key: crypto.randomUUID() } : null;
    setStatus({ kind: "idle" });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (status.kind === "uploading") return;
    const chosen = intent.current;
    if (!chosen) return setStatus({ kind: "error", message: "Choose a file first.", retryable: false });

    // Convenience checks only; the server repeats all of them (rule 29).
    const { file, key } = chosen;
    if (file.size === 0) return setStatus({ kind: "error", message: "The file is empty.", retryable: false });
    if (file.size > maxBytes) return setStatus({ kind: "error", message: MESSAGES[413], retryable: false });
    if (!accept.includes(extensionOf(file.name))) return setStatus({ kind: "error", message: MESSAGES[415], retryable: false });

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", "/api/files");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.setRequestHeader("Idempotency-Key", key);
    xhr.upload.onprogress = (e) => e.lengthComputable && setStatus({ kind: "uploading", percent: Math.round((e.loaded / e.total) * 100) });
    xhr.onload = () => {
      if (xhr.status === 201) {
        intent.current = null;
        if (input.current) input.current.value = "";
        setStatus({ kind: "done" });
        router.refresh();
        return;
      }
      const retryable = RETRYABLE.has(xhr.status);
      if (!retryable) intent.current = null;
      setStatus({ kind: "error", message: MESSAGES[xhr.status] ?? "The upload failed. Try again.", retryable });
    };
    xhr.onerror = () => setStatus({ kind: "error", message: "The connection was lost. Try again.", retryable: true });
    setStatus({ kind: "uploading", percent: 0 });
    xhr.send(file);
  }

  const uploading = status.kind === "uploading";
  return (
    <form onSubmit={onSubmit}>
      <label>
        File
        <input ref={input} type="file" accept={accept.map((e) => `.${e}`).join(",")} onChange={onChoose} disabled={uploading} />
      </label>
      <button type="submit" disabled={uploading}>
        {uploading ? `Uploading… ${status.percent}%` : status.kind === "error" && status.retryable ? "Retry upload" : "Upload"}
      </button>
      {status.kind === "error" && <p role="alert">{status.message}</p>}
      {status.kind === "done" && <p role="status">Uploaded.</p>}
    </form>
  );
}
