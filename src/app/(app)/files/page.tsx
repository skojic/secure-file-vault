import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { env } from "@/env";
import { getCurrentUser } from "@/server/auth/current-user";
import { ACCEPTED_EXTENSIONS } from "@/server/files/allowed-types";
import { listFiles } from "@/server/files/service";
import { DeleteButton } from "./delete-button";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "Files · Secure File Vault" };

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

export default function FilesPage(props: PageProps<"/files">) {
  return (
    <main>
      <h1>Files</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <Files searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Files({ searchParams }: { searchParams: PageProps<"/files">["searchParams"] }) {
  // The page checks the session itself; the proxy only redirected on a missing cookie.
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/files");

  const { after } = await searchParams;
  const { items, nextCursor } = await listFiles(user, { cursor: typeof after === "string" ? after : undefined });

  return (
    <>
      <UploadForm maxBytes={env.MAX_UPLOAD_BYTES} accept={ACCEPTED_EXTENSIONS} />
      {items.length === 0 ? (
        <p>No files yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Size</th>
              <th scope="col">Uploaded</th>
              {user.role === "admin" && <th scope="col">Uploader</th>}
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((file) => (
              <tr key={file.id}>
                <td>
                  {/* A plain link: downloads are a route handler, not client navigation. */}
                  <a href={`/api/files/${file.id}/download`}>{file.originalName}</a>
                </td>
                <td>{formatSize(file.sizeBytes)}</td>
                <td>
                  <time dateTime={file.createdAt.toISOString()}>{file.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</time>
                </td>
                {user.role === "admin" && <td>{file.uploaderName}</td>}
                <td>
                  <DeleteButton fileId={file.id} version={file.version} name={file.originalName} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {nextCursor && <Link href={`/files?after=${nextCursor}`}>Older files</Link>}
    </>
  );
}
