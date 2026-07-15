import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO Performance Workspace",
  description: "Auditable SEO source, project settings, performance, review, and monthly KPI workflows."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
