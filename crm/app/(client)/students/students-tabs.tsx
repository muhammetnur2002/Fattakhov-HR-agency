"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/students", label: "Вакансии" },
  { href: "/students/applications", label: "Отклики" },
];

/** Разделы студенческой платформы внутри CRM: вакансии и отклики студентов. */
export function StudentsTabs() {
  const pathname = usePathname();
  const onApplications = pathname.startsWith("/students/applications");
  return (
    <nav className="flex gap-2">
      {TABS.map((tab) => {
        const active = tab.href === "/students/applications" ? onApplications : !onApplications;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
