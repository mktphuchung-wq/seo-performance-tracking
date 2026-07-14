import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hiệu suất dự án SEO - Đội SEO",
  description: "Bảng điều khiển hiệu suất SEO sử dụng dữ liệu từ Google Sheets và Search Console."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
