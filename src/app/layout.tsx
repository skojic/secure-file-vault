import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Secure File Vault",
  description: "Upload files and share them only with the people allowed to see them.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
