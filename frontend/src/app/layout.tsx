import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Austin AI Events | Discover AI Meetups & Events in Austin, TX",
  description:
    "Your comprehensive calendar for AI, machine learning, and tech events in Austin, Texas. Find meetups, workshops, and conferences from top communities.",
  keywords: [
    "Austin AI events",
    "AI meetups Austin",
    "machine learning Austin",
    "tech events Austin TX",
    "AI community Austin",
  ],
  openGraph: {
    title: "Austin AI Events",
    description:
      "Discover AI meetups, workshops, and conferences in Austin, TX",
    url: "https://austinai.events",
    siteName: "Austin AI Events",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Austin AI Events",
    description:
      "Discover AI meetups, workshops, and conferences in Austin, TX",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased bg-gray-50`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
