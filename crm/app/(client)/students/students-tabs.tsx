"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/** Разделы студенческой платформы внутри CRM: вакансии, отклики, кандидаты, сообщения. */
export function StudentsTabs({
  newApplications,
  unreadMessages,
}: {
  newApplications: number;
  unreadMessages: number;
}) {
  const pathname = usePathname();
  const onApplications = pathname.startsWith("/students/applications");
  const onCandidates = pathname.startsWith("/students/candidates");
  const onMessages = pathname.startsWith("/students/messages");
  const tabs = [
    // Вакансии — сам список, форма новой вакансии и правка (/students/new, /students/<id>)
    { href: "/students", label: "Вакансии", badge: 0, active: !onApplications && !onCandidates && !onMessages },
    { href: "/students/applications", label: "Отклики", badge: newApplications, active: onApplications },
    { href: "/students/candidates", label: "Кандидаты", badge: 0, active: onCandidates },
    { href: "/students/messages", label: "Сообщения", badge: unreadMessages, active: onMessages },
  ];

  return (
    <nav className="flex gap-2 overflow-x-auto">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
            tab.active
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
          {tab.badge > 0 && (
            <span
              className={cn(
                "grid min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] font-semibold leading-[18px]",
                tab.active ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground",
              )}
            >
              {tab.badge > 9 ? "9+" : tab.badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
