"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [{ href: "/clinic/patients", label: "מטופלים" }];

/** The nav with the current section marked (reads the URL, so it streams in). */
export function CurrentNavLinks() {
  return <NavLinks current={usePathname()} />;
}

export function NavLinks({ current: pathname }: { current: string | null }) {
  return (
    <nav aria-label="אזורי הלוח" className="px-3 pb-2 md:pb-0">
      <ul className="flex gap-1 md:block md:space-y-0.5">
        {sections.map((section) => {
          const current = pathname !== null && (pathname === section.href || pathname.startsWith(`${section.href}/`));
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={current ? "page" : undefined}
                className={`flex h-10 items-center rounded-md px-3 text-[1rem] ${
                  current ? "bg-petrol/8 font-semibold text-petrol-strong" : "text-ink hover:bg-paper"
                }`}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
