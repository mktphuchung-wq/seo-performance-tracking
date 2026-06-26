import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Performance SEO Project - SEO Team",
  description: "A lightweight SEO performance dashboard backed by Google Sheets and Search Console."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
