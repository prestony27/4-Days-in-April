import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/shared/header";
import { Footer } from "@/components/shared/footer";
import { QueryProvider } from "@/providers/query-provider";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Four Days in April 2026",
  description:
    "Pick your golfers, build your team, and compete for cash prizes in the 2026 golf pool.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <QueryProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <Toaster position="top-center" richColors />
        </QueryProvider>
      </body>
    </html>
  );
}
