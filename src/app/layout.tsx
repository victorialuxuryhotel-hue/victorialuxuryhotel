import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { hotel } from "@/config/hotel";
import "./globals.css";

const display = Cormorant_Garamond({
  variable: "--font-display-base",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const sans = Inter({
  variable: "--font-sans-base",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: hotel.name, template: `%s · ${hotel.shortName}` },
  description: `${hotel.name}, ${hotel.address.line1}, ${hotel.address.city}. Book your stay online.`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NG" className={`${display.variable} ${sans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
