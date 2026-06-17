import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";

import { AppFrame } from "@/components/AppFrame";

import "./globals.css";

const barlow = Barlow({
  subsets: ["latin"],
  variable: "--font-barlow",
  weight: ["400", "500", "600", "700"],
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  variable: "--font-barlow-condensed",
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "SpecWear",
    template: "%s | SpecWear",
  },
  description:
    "SpecWear — магазин спецодягу, спецвзуття та засобів індивідуального захисту для роздрібних і оптових клієнтів.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body>
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
