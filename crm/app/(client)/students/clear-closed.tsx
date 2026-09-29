"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { vacancyActionAction } from "./actions";

/**
 * «Удалить снятые и отклонённые»: одним нажатием убирает из списка вакансии,
 * которые уже не работают, чтобы не занимали место. Опубликованные и ждущие
 * проверки не трогает — платформа такие удалять всё равно откажется.
 */
export function ClearClosed({ ids }: { ids: string[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      let failed = 0;
      for (const id of ids) {
        const result = await vacancyActionAction(id, "delete");
        if (result.error) failed += 1;
      }
      setConfirming(false);
      if (failed > 0) setError(`Не удалось удалить: ${failed}. Остальные удалены.`);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <div className="space-y-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(true)}>
          <Trash2 className="mr-1 size-4" aria-hidden />
          Удалить снятые и отклонённые ({ids.length})
        </Button>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm">Удалить снятые и отклонённые вакансии ({ids.length}) из списка? Это нельзя отменить.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={run}>
          {pending ? "Удаляем…" : "Да, удалить"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
          Отмена
        </Button>
      </div>
    </div>
  );
}
