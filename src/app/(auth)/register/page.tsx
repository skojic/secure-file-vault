import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create an account · Secure File Vault" };

export default function RegisterPage() {
  return (
    <main>
      <h1>Create an account</h1>
      <RegisterForm />
      <p>
        Already registered? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}
