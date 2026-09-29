"use client";

import { GraduationCap, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const STORAGE_KEY = "students-intro-seen";

function readSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // приватный режим — просто показываем каждый раз
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

const STEPS = [
  {
    title: "Опубликуйте вакансию",
    text: "Опишите, кого ищете: обязанности, график, оплату. Студенты увидят её в ленте вакансий и откликнутся сами — агентство подбирать не будет.",
  },
  {
    title: "Получайте отклики",
    text: "Во вкладке «Отклики» видно, кто откликнулся: вуз, курс, график, навыки. Контакты студента открываются после отклика.",
  },
  {
    title: "Общайтесь и приглашайте",
    text: "Пишите студентам во вкладке «Сообщения», приглашайте на собеседование или пробную смену и отмечайте, кого взяли.",
  },
  {
    title: "Ищите сами",
    text: "Во вкладке «Кандидаты» — поиск и фильтры: можно найти подходящего студента и пригласить его на вашу вакансию.",
  },
];

/**
 * Объяснение студенческой платформы для тех, кто пришёл с договором и ещё не знает,
 * что это. Первый раз раскрыто, дальше сворачивается в ссылку «Как это работает?».
 */
export function StudentsIntro({ contracted }: { contracted: boolean }) {
  const pathname = usePathname();
  const seen = useSyncExternalStore(subscribe, readSeen, () => true);
  const [open, setOpen] = useState<boolean | null>(null);
  // null — решение ещё не принято вручную: раскрыто, пока человек не видел объяснение
  const expanded = open ?? !seen;

  if (pathname !== "/students") return null;

  function close() {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* не запомнилось — покажем снова при следующем заходе */
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <GraduationCap className="size-4" aria-hidden />
        Как работает студенческая платформа?
      </button>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardContent className="relative space-y-4 p-5 pr-12">
        <button
          type="button"
          onClick={close}
          aria-label="Скрыть объяснение"
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>

        <div className="space-y-1.5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <GraduationCap className="size-5" aria-hidden />
            Что такое студенческая платформа
          </h2>
          <p className="text-sm text-muted-foreground">
            Это раздел, где вы сами находите студентов для подработки, стажировок и разовых задач — без подбора от
            агентства. Студенты бывают разные: одни уже с опытом, другие только начинают. Учёбу каждого студента
            подтверждает агентство, а вы выбираете того, кто подходит вашей задаче.
          </p>
        </div>

        <ol className="grid gap-3 sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3 rounded-xl border p-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-medium">{step.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="text-xs text-muted-foreground">
          {contracted
            ? "По вашему договору вакансии публикуются сразу, без проверки."
            : "Перед публикацией агентство проверяет компанию и вакансию — поэтому заполните профиль компании (ИНН, описание) в меню на вашем кружке справа вверху."}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/students/new">Создать первую вакансию</Link>
          </Button>
          <Button size="sm" variant="outline" onClick={close}>
            Понятно
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
