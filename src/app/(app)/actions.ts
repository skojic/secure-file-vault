"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logout } from "@/server/auth/service";

// POST only: Server Actions cannot be invoked by GET, so a link or image on another site cannot log users out (E8).
export async function logoutAction(): Promise<void> {
  await logout(await cookies());
  redirect("/login");
}
