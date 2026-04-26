import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Swing",
  description: "Classic seesaw puzzle game rebuilt as a web app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
