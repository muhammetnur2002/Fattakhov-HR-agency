"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ConfirmBlock } from "@/components/ui/confirm-block";
import { vacancyActionAction } from "./actions";

/**
 * «Удалить снятые и отклонённые»: одним нажатием убирает из списка вакансии,
 * которые уже не работают, чтобы не занимали место. Опубликованные и ждущие
 * проверки не трогает — платформа такие удалять всё равно откажется.
 */
export function ClearClosed({ ids }: { ids: string[] }) {
  const router = useRouter();

  return (
    <ConfirmBlock
      trigger={
        <Button type="button" size="sm" variant="outline">
          <Trash2 className="mr-1 size-4" aria-hidden />
          Удалить снятые и отклонённые ({ids.length})
        </Button>
      }
      question={`Удалить снятые и отклонённые вакансии (${ids.length}) из списка? Это нельзя отменить.`}
      confirmLabel="Да, удалить"
      pendingLabel="Удаляем…"
      onConfirm={async () => {
        let failed = 0;
        for (const id of ids) {
          const result = await vacancyActionAction(id, "delete");
          if (result.error) failed += 1;
        }
        router.refresh();
        // Часть удалена, часть нет: остаёмся в блоке с числом неудавшихся — «Да» повторит только оставшиеся
        if (failed > 0) return { error: `Не удалось удалить: ${failed}. Остальные удалены.` };
      }}
    />
  );
}
