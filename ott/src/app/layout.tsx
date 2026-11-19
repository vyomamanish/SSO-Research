import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NavBar } from "@/components/NavBar";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = { title: "Vyoma OTT" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body>
        <NavBar user={user} />
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
