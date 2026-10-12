"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";

import { useScrollActiveIntoView } from "@/lib/hooks/use-scroll-active-into-view";
import { cn } from "@/lib/utils";
import { CountBadge } from "@/components/ui/count-badge";

/** Разделы студенческой платформы внутри CRM: вакансии, отклики, кандидаты, сообщения. */
export function StudentsTabs({
  newApplications,
  unreadMessages,
}: {
  newApplications: number;
  unreadMessages: number;
}) {
  const pathname = usePathname();
  // На телефоне ряд шире экрана: при заходе активная вкладка должна быть на виду
  const navRef = useRef<HTMLElement>(null);
  useScrollActiveIntoView(navRef, pathname);
  const onApplications = pathname.startsWith("/students/applications");
  const onCandidates = pathname.startsWith("/students/candidates");
  const onMessages = pathname.startsWith("/students/messages");
  const tabs = [
    // Вакансии — сам список, форма новой вакансии и правка (/students/new, /students/<id>)
    { href: "/students", label: "Вакансии", badge: 0, badgeLabel: "", active: !onApplications && !onCandidates && !onMessages },
    { href: "/students/applications", label: "Отклики", badge: newApplications, badgeLabel: "новых", active: onApplications },
    { href: "/students/candidates", label: "Кандидаты", badge: 0, badgeLabel: "", active: onCandidates },
    { href: "/students/messages", label: "Сообщения", badge: unreadMessages, badgeLabel: "непрочитанных", active: onMessages },
  ];

  return (
    <nav ref={navRef} aria-label="Студенческая платформа" className="pill-scroller flex gap-2">
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
            <CountBadge
              count={tab.badge}
              label={tab.badgeLabel}
              tone={tab.active ? "onPrimary" : "primary"}
            />
          )}
        </Link>
      ))}
    </nav>
  );
}
