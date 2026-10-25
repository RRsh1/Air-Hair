import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const assistant = localFont({
  src: [
    { path: "../../node_modules/@fontsource-variable/assistant/files/assistant-hebrew-wght-normal.woff2", weight: "200 800" },
    { path: "../../node_modules/@fontsource-variable/assistant/files/assistant-latin-wght-normal.woff2", weight: "200 800" },
  ],
  variable: "--font-assistant",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hair&Air",
  description: "תיעוד החלמה אחרי השתלת שיער",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5f7f6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${assistant.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
