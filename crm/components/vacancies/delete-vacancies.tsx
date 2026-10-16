"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { deleteVacanciesAction } from "@/app/actions/vacancies";
import { Button } from "@/components/ui/button";
import { ConfirmBlock } from "@/components/ui/confirm-block";

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

  return (
    <ConfirmBlock
      trigger={
        <Button type="button" size="sm" variant={variant}>
          <Trash2 className="mr-1 size-4" aria-hidden />
          {label}
        </Button>
      }
      question={question}
      confirmLabel="Да, удалить"
      pendingLabel="Удаляем…"
      onConfirm={async () => {
        const result = await deleteVacanciesAction(ids);
        if (result.error) return { error: result.error };
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      }}
    />
  );
}
