"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StudentsVacancyStatus } from "@/lib/students-service";
import { vacancyActionAction } from "./actions";

/** Снять с публикации (с выбором — сохранить или удалить сразу) и удалить снятую. */
export function VacancyActions({ id, status }: { id: string; status: StudentsVacancyStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(action: "close" | "delete", keep?: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await vacancyActionAction(id, action, keep);
      if (result.error) {
        setError(result.error);
        return;
      }
      setClosing(false);
      router.refresh();
    });
  }

  if (status === "CLOSED") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Управление</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button variant="destructive" disabled={pending} onClick={() => run("delete")}>
            Удалить
          </Button>
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
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {closing ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Закрыть вакансию? Студенты её не увидят, отклики сохранятся. Сохранить её в истории?
            </p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending} onClick={() => run("close", true)}>
                Сохранить и закрыть
              </Button>
              <Button variant="destructive" disabled={pending} onClick={() => run("close", false)}>
                Не сохранять
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => setClosing(false)}>
                Отмена
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" disabled={pending} onClick={() => setClosing(true)}>
            Снять с публикации
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
