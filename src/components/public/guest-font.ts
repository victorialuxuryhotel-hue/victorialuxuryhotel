import { Inter } from "next/font/google";

/** Body font of the guest website. Put `guest ${guestFont.variable}` on anything rendered for guests. */
export const guestFont = Inter({ variable: "--font-guest", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
