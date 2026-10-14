import Link from "next/link";
import { getCurrentUser } from "@/server/auth/current-user";
import { logoutAction } from "./actions";

// Display only. Each page checks the session itself; a layout is not re-run on every navigation.
export async function UserNav() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <nav aria-label="Account">
      <Link href="/files">Files</Link>
      <span>
        {user.name} ({user.role})
      </span>
      <form action={logoutAction}>
        <button type="submit">Sign out</button>
      </form>
    </nav>
  );
}
