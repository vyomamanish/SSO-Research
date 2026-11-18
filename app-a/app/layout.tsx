import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = { title: "OTT Demo" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="shell">
          <header className="brand">
            <a href="/">OTT Demo</a>
            <span>localhost:3001</span>
          </header>
          {children}
        </main>
      </body>
    </html>
  );
}
