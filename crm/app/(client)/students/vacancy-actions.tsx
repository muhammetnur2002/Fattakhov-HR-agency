"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmBlock, ConfirmExtraAction } from "@/components/ui/confirm-block";
import type { StudentsVacancyStatus } from "@/lib/students-service";
import { vacancyActionAction } from "./actions";

/** Снять с публикации (с выбором — сохранить или удалить сразу) и удалить снятую. */
export function VacancyActions({ id, status }: { id: string; status: StudentsVacancyStatus }) {
  const router = useRouter();

  async function run(action: "close" | "delete", keep?: boolean) {
    const result = await vacancyActionAction(id, action, keep);
    if (result.error) return { error: result.error };
    // Удалённой вакансии больше нет — на её странице делать нечего
    if (action === "delete") router.push("/students");
    else router.refresh();
  }

  // Уже не работает: снятую, отклонённую и черновик можно убрать из списка совсем
  if (status === "CLOSED" || status === "REJECTED" || status === "DRAFT") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Управление</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ConfirmBlock
            trigger={<Button variant="destructive">Удалить</Button>}
            size="default"
            question="Удалить вакансию из списка? Это нельзя отменить."
            confirmLabel="Да, удалить"
            pendingLabel="Удаляем…"
            onConfirm={() => run("delete")}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Управление</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ConfirmBlock
          trigger={<Button variant="outline">Снять с публикации</Button>}
          size="default"
          questionClassName="text-muted-foreground"
          question="Закрыть вакансию? Студенты её не увидят, отклики сохранятся. Сохранить её в истории?"
          confirmLabel="Не сохранять"
          onConfirm={() => run("close", false)}
          // Третий исход: закрыть, оставив вакансию в истории — не красная кнопка, ничего не теряется
          extraActions={<ConfirmExtraAction task={() => run("close", true)}>Сохранить и закрыть</ConfirmExtraAction>}
        />
      </CardContent>
    </Card>
  );
}
