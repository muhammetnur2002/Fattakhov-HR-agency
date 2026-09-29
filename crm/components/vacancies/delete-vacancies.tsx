"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteVacanciesAction } from "@/app/actions/vacancies";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Удаление закрытых вакансий с подтверждением. Используется в двух видах:
 * одна вакансия на её странице (после удаления уходим в список) и «очистить
 * закрытые» в списке (удаляются все закрытые из показанных).
 */
export function DeleteVacancies({
  ids,
  label,
  question,
  redirectTo,
  variant = "outline",
}: {
  ids: string[];
  label: string;
  question: string;
  /** Куда перейти после удаления; без него — просто обновить список. */
  redirectTo?: string;
  variant?: "outline" | "ghost";
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await deleteVacanciesAction(ids);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  }

  if (!confirming) {
    return (
      <Button type="button" size="sm" variant={variant} onClick={() => setConfirming(true)}>
        <Trash2 className="mr-1 size-4" aria-hidden />
        {label}
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm">{question}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={run}>
          {pending ? "Удаляем…" : "Да, удалить"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
          Отмена
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
