import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SubmitGuard } from "@/components/submit-guard";

export const metadata: Metadata = {
  title: "Dental Base",
  description: "Внутренняя система клиники",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Dental Base", statusBarStyle: "default" },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f6f4",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <SubmitGuard />
        {children}
      </body>
    </html>
  );
}
