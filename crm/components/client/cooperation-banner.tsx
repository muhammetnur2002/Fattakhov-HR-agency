"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  availableNowText,
  isContractOnlyPath,
  type ContractGateAccess,
  type ContractState,
} from "@/lib/contract-gate";

const STORAGE_KEY = "coop-banner-dismissed";

function readDismissed(state: string): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === state;
  } catch {
    return false; // приватный режим — просто не запоминаем
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * Плашка про условия сотрудничества. На открытых страницах её можно закрыть
 * (запоминается в браузере), на закрытых до договора — стоит всегда: там она
 * объясняет, почему раздел недоступен.
 *
 * Условия выбирает администратор компании; остальным плашка говорит, кто это
 * делает, и обещает только то, что им правда открыто (access).
 */
export function CooperationBanner({
  state,
  access,
  telegramHref,
}: {
  state: Exclude<ContractState, "active">;
  access: ContractGateAccess;
  telegramHref: string;
}) {
  const pathname = usePathname();
  // На сервере и при первой отрисовке плашка показана, закрытое читается из браузера
  const storedDismissed = useSyncExternalStore(subscribe, () => readDismissed(state), () => false);
  const [justDismissed, setJustDismissed] = useState(false);
  const dismissed = storedDismissed || justDismissed;
  const locked = isContractOnlyPath(pathname);

  if (dismissed && !locked) return null;

  function dismiss() {
    setJustDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, state);
    } catch {
      /* не запомнилось — вернётся при следующем заходе */
    }
  }

  const pending = state === "pending";
  const availableNow = availableNowText(access);
  const description = pending
    ? (access.chooseTerms
        ? "Агентство свяжется с вами и подтвердит договор — после этого откроются заявки на подбор, кандидаты, календарь, аналитика."
        : "Агентство подтвердит договор, который выбрал администратор вашей компании, — после этого откроются заявки на подбор, кандидаты, календарь, аналитика.") +
      (availableNow ? ` ${availableNow}` : "")
    : access.documents
      ? "Студенческая платформа, документы и сообщения доступны уже сейчас: в документах — шаблон договора — скачайте, подпишите и пришлите нам на проверку. Заявки на подбор, кандидаты, календарь, аналитика откроются после договора."
      : "Условия сотрудничества выбирает администратор вашей компании. Заявки на подбор, кандидаты, календарь, аналитика откроются после договора." +
        (availableNow ? ` ${availableNow}` : "");
  return (
    <Alert className="relative mb-4 flex flex-wrap items-center justify-between gap-3 pr-10">
      <div>
        <AlertTitle>{pending ? "Договор ещё не подтверждён" : "Условия сотрудничества ещё не выбраны"}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <a href={telegramHref} target="_blank" rel="noreferrer">
            Обсудить с нами
          </a>
        </Button>
        {!pending && access.chooseTerms && (
          <Button asChild size="sm">
            <Link href="/onboarding">Выбрать условия</Link>
          </Button>
        )}
      </div>
      {!locked && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Скрыть"
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </Alert>
  );
}
