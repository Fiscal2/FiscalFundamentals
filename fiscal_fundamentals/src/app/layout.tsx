import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ClientNavbar from "./components/layout/navbar/client-navbar";
import "./globals.css";
import Footer from "./components/layout/footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Castling Financial",
  description: "Always two steps ahead.",
  icons: {
    icon: "/favicon.ico", 
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ClientNavbar />
        {children}
        <Footer />
      </body>
    </html>
  );
}
