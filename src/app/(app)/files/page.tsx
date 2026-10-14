import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { env } from "@/env";
import { getCurrentUser } from "@/server/auth/current-user";
import { ACCEPTED_EXTENSIONS } from "@/server/files/allowed-types";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "Files · Secure File Vault" };

export default function FilesPage() {
  return (
    <main>
      <h1>Files</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <Files />
      </Suspense>
    </main>
  );
}

async function Files() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/files");
  return (
    <>
      <UploadForm maxBytes={env.MAX_UPLOAD_BYTES} accept={ACCEPTED_EXTENSIONS} />
    </>
  );
}
