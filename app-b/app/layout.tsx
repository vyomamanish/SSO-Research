import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = { title: "DSG Demo" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="shell">
          <header className="brand">
            <a href="/">DSG Demo</a>
            <span>localhost:3002</span>
          </header>
          {children}
        </main>
      </body>
    </html>
  );
}
