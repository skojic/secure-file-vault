import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/server/auth/current-user";

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
  return <p>Signed in as {user.username}.</p>;
}
