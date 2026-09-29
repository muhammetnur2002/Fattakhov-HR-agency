"use client";

import { Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { NudgeKind } from "@/lib/students-funnel";

const STORAGE_KEY = "students-nudge-dismissed";

function readDismissed(kind: string): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === kind;
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * Мягкое предложение агентства клиенту без договора, у которого на студенческой
 * платформе уже есть отклики. Закрывается; каждую следующую ступень («уже много
 * откликов») показывается заново, потому что там повод другой.
 */
export function StudentsNudge({
  kind,
  applications,
  telegramHref,
}: {
  kind: Exclude<NudgeKind, "none">;
  applications: number;
  telegramHref: string;
}) {
  const stored = useSyncExternalStore(subscribe, () => readDismissed(kind), () => true);
  const [closed, setClosed] = useState(false);
  if (stored || closed) return null;

  function close() {
    setClosed(true);
    try {
      localStorage.setItem(STORAGE_KEY, kind);
    } catch {
      /* не запомнилось — покажем снова */
    }
  }

  const ready = kind === "ready";
  return (
    <Card className="border-primary/30">
      <CardContent className="relative flex flex-wrap items-center justify-between gap-4 p-4 pr-12">
        <button
          type="button"
          onClick={close}
          aria-label="Скрыть подсказку"
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
        <div className="flex min-w-0 flex-1 gap-3">
          <Sparkles className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {ready
                ? `Студенты откликаются: ${applications} ${plural(applications)}. Хотите, чтобы кандидатов подбирало агентство?`
                : "Вам уже откликнулись студенты. Хотите, чтобы кандидатов искало агентство?"}
            </p>
            <p className="text-sm text-muted-foreground">
              Мы сами найдём и проверим кандидатов, договоримся о собеседованиях и сопроводим найм. Для этого нужен
              договор — шаблон и загрузка подписанного лежат в «Документах».
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/documents">Оформить договор</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={telegramHref} target="_blank" rel="noreferrer">
              Обсудить с нами
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function plural(n: number): string {
  const last = n % 10;
  const teen = n % 100 >= 11 && n % 100 <= 14;
  if (!teen && last === 1) return "отклик";
  if (!teen && last >= 2 && last <= 4) return "отклика";
  return "откликов";
}
