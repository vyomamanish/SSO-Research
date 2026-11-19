"use client";

// A client component, so the active link follows client-side navigation.
import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav({ sections }: { sections: { href: string; label: string; allowed: boolean }[] }) {
  const pathname = usePathname();
  return (
    <>
      {sections.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          className={`side-link ${pathname === section.href ? "active" : ""} ${section.allowed ? "" : "restricted"}`}
        >
          {section.label}
          {section.allowed ? "" : " 🔒"}
        </Link>
      ))}
    </>
  );
}
