import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Haven Clinic | Book an appointment",
  description: "Find and book an available clinic appointment in minutes.",
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
