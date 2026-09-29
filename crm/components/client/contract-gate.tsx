"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { isContractOnlyPath, type ContractState } from "@/lib/contract-gate";

/**
 * Разделы работы агентства без договора: содержимое видно размытым, чтобы
 * было понятно, что здесь появится, а поверх — замок и причина. Пока договора
 * нет, раздел не кликается и не читается с экрана (inert).
 */
export function ContractGate({
  state,
  telegramHref,
  children,
}: {
  state: ContractState;
  telegramHref: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (state === "active" || !isContractOnlyPath(pathname)) return <>{children}</>;

  const pending = state === "pending";
  return (
    <div className="relative min-h-[26rem]">
      <div aria-hidden inert className="pointer-events-none select-none opacity-60 blur-[7px]">
        {children}
      </div>
      <div className="absolute inset-0 flex items-start justify-center px-4 pt-12 sm:pt-20">
        <div
          role="region"
          aria-label="Раздел закрыт до заключения договора"
          className="w-full max-w-md rounded-2xl border bg-card/95 p-6 text-center shadow-lg backdrop-blur"
        >
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-muted">
            <Lock className="size-5" />
          </div>
          <h2 className="text-lg font-semibold">
            {pending ? "Ждём подтверждения договора" : "Раздел откроется после договора"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {pending
              ? "Вы выбрали условия — агентство свяжется с вами и подтвердит договор. Сразу после этого здесь появятся заявки на подбор, кандидаты от рекрутера, календарь встреч, аналитика и переписка с командой. Подписанный договор можно прислать в разделе «Документы»."
              : "Заявки на подбор, кандидаты от рекрутера, календарь встреч, аналитика и переписка с командой — это работа агентства, она начинается с договора. Скачайте шаблон в разделе «Документы», подпишите и пришлите нам — после проверки раздел откроется."}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button asChild size="sm">
              <Link href="/documents">Договор в «Документах»</Link>
            </Button>
            {!pending && (
              <Button asChild size="sm" variant="outline">
                <Link href="/onboarding">Выбрать тариф</Link>
              </Button>
            )}
            <Button asChild size="sm" variant="outline">
              <a href={telegramHref} target="_blank" rel="noreferrer">
                Обсудить с нами
              </a>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Студенческая платформа и документы работают уже сейчас.
          </p>
        </div>
      </div>
    </div>
  );
}
