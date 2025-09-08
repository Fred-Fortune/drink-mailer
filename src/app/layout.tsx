import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 🔥 改這裡
export const metadata: Metadata = {
  title: "飲料開團通知系統",
  description: "貼上開團資訊、勾選名單，一鍵寄出 🚀",
  openGraph: {
    title: "飲料開團通知系統",
    description: "貼上開團資訊、勾選名單，一鍵寄出 🚀",
    url: "https://drink-mailer.vercel.app",
    siteName: "Drink Mailer",
    images: [
      {
        url: "https://drink-mailer.vercel.app/og-image.png", // 請放一張 1200x630 的圖到 public/ 下
        width: 1200,
        height: 630,
        alt: "飲料開團通知系統",
      },
    ],
    locale: "zh_TW",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "飲料開團通知系統",
    description: "貼上開團資訊、勾選名單，一鍵寄出 🚀",
    images: ["https://drink-mailer.vercel.app/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
