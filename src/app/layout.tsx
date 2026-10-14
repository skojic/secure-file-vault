import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Secure File Vault",
  description: "Upload files and share them only with the people allowed to see them.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      {/* Browser extensions (e.g. cz-shortcut-listen) add attributes to <body> before React loads.
          This silences mismatches on <body>'s own attributes only; its children are still checked. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
