import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "College Admissions | Common Data Set Library",
  description: "Search and compare first-year admissions data from official Common Data Set reports.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
