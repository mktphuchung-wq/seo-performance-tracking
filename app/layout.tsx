import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Không gian KPI SEO",
  description: "Nguồn dữ liệu, hiệu suất và KPI SEO có bằng chứng kiểm toán."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
