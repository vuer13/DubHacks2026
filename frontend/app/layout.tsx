import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { TouchTargetAudit } from "@/components/dev/TouchTargetAudit";

import "./globals.css";

export const metadata: Metadata = {
  title: "TrailSense",
  description: "A spoken hiking assistant for blind and low-vision hikers.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B1410",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        {process.env.NODE_ENV === "development" ? <TouchTargetAudit /> : null}
      </body>
    </html>
  );
}
