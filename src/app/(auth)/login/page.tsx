import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Secure File Vault" };

export default function LoginPage() {
  return (
    <main>
      <h1>Sign in</h1>
      {/* The form reads the query string, which is request data. */}
      <Suspense fallback={<p>Loading…</p>}>
        <LoginForm />
      </Suspense>
      <p>
        No account yet? <Link href="/register">Create one</Link>
      </p>
    </main>
  );
}
