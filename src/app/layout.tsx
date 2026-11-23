import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Lora } from "next/font/google";
import { hotel } from "@/config/hotel";
import "./globals.css";

const display = Cormorant_Garamond({
  variable: "--font-display-base",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const sans = Lora({
  variable: "--font-sans-base",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: `${hotel.name}, Akure`, template: `%s · ${hotel.name}` },
  description: `${hotel.name}: rooms, suites and apartments in Alagbaka GRA, Akure, with an indoor pool, spa, restaurant, lounge and bar. Book direct online.`,
  applicationName: hotel.name,
  openGraph: {
    type: "website",
    siteName: hotel.name,
    locale: "en_NG",
    title: `${hotel.name}, Akure`,
    description: "Rooms, suites and apartments in Alagbaka GRA, Akure, with an indoor pool, spa, restaurant, lounge and bar.",
    images: [{ url: "/brand/logo-full.png", alt: hotel.name }],
  },
  twitter: { card: "summary", title: `${hotel.name}, Akure` },
  formatDetection: { telephone: true, address: true, email: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NG" className={`${display.variable} ${sans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
