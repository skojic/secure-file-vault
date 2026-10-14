import { Suspense } from "react";
import { UserNav } from "./user-nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header>
        {/* Reads the session, so it streams in behind a boundary instead of blocking the page. */}
        <Suspense fallback={null}>
          <UserNav />
        </Suspense>
      </header>
      {children}
    </>
  );
}
