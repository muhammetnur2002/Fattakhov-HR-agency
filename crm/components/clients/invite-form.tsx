"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS } from "@/lib/labels";

const CLIENT_ROLES = ["CLIENT_ADMIN", "CLIENT_HIRING", "CLIENT_VIEWER"] as const;

export type InviteFormState = { error?: string; ok?: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Создаём…" : "Пригласить"}
    </Button>
  );
}

export function InviteForm({
  clientId,
  action,
  noUsersYet = false,
}: {
  clientId: string;
  /**
   * Кто именно приглашает, решает вызывающая страница: агентство зовёт
   * пользователей любого своего клиента (app/(agency)/a/clients/actions),
   * а клиентский администратор — только коллег в своей же компании
   * (app/(client)/settings/actions). Право на это разное, и серверная
   * проверка тоже разная — форма от неё не зависит, только отправляет.
   */
  action: (
    prev: InviteFormState,
    formData: FormData,
  ) => Promise<InviteFormState>;
  /**
   * У клиента ещё нет ни одного принятого приглашения.
   *
   * Тариф на /onboarding выбирает только CLIENT_ADMIN (см.
   * app/(onboarding)/onboarding/page.tsx) — без администратора клиент
   * упирается в заглушку «Условия ещё не выбраны» без единой подсказки
   * почему. Раньше это узнавали постфактум: аккаунт-менеджер приглашал
   * первого попавшегося по умолчанию как «Нанимающего менеджера»,
   * и онбординг тихо стопорился. Первому приглашению — роль
   * администратора по умолчанию и явное объяснение, зачем.
   */
  noUsersYet?: boolean;
}) {
  const [state, formAction] = useActionState<InviteFormState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="clientId" value={clientId} />

      {noUsersYet && (
        <Alert>
          <AlertDescription>
            Тариф на онбординге выбирает только «Администратор» — без него
            клиент увидит пустую заглушку. Первого приглашённого стоит
            назначить администратором, остальных — уже по ролям.
          </AlertDescription>
        </Alert>
      )}

      {/*
        Подписи в одном ряду, поля в другом — через subgrid, с явной
        высотой обоих рядов.

        Раньше колонки выравнивались по нижнему краю (items-end), и это
        держалось лишь до тех пор, пока подписи и поля во всех колонках
        были одинаковой высоты. Стоило чему-то отличиться на пиксель —
        и «Email» с «Роль» вставали на разные уровни, а кнопка съезжала
        относительно обоих. Subgrid убирает саму возможность: ряд подписи
        и ряд поля общие для всех трёх колонок.

        Высоты рядов — не auto, а числом: 20px под подпись, 32px —
        ровно высота Input/SelectTrigger/Button (h-8).

        И второе, менее очевидное: промежуток между подписью и полем
        задавался дважды — один раз на родителе (общий gap), второй раз
        тем же числом на каждой обёртке (gap-2). Для subgrid это не
        «то же самое, продублировано на всякий случай», а спор: ряд
        subgrid общий с родителем, и его собственный gap по спецификации
        ему не принадлежит — но был объявлен, и браузер отчасти его
        учёл, отчего поле вставало на 4px выше положенного. Число
        одно, место одно — на родителе.
      */}
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-[1fr_auto_auto] sm:grid-rows-[20px_32px] sm:items-start">
        <div className="space-y-2 sm:row-span-2 sm:grid sm:grid-rows-subgrid sm:space-y-0">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            placeholder="name@company.ru"
            required
          />
        </div>

        <div className="space-y-2 sm:row-span-2 sm:grid sm:grid-rows-subgrid sm:space-y-0">
          <Label htmlFor="invite-role">Роль</Label>
          <Select
            name="role"
            defaultValue={noUsersYet ? "CLIENT_ADMIN" : "CLIENT_HIRING"}
          >
            {/* 52 не хватало: «Нанимающий менеджер» упирался в стрелку
                и обрезался на последней букве */}
            <SelectTrigger id="invite-role" className="w-full sm:w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLIENT_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Колонка указана явно вместе с рядом. С одним только рядом
            раскладка ставила кнопку в первую свободную ячейку строки —
            то есть перед Email, хотя в разметке она последняя */}
        <div className="sm:col-start-3 sm:row-start-2">
          <SubmitButton />
        </div>
      </div>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.ok && (
        <Alert>
          <AlertDescription>{state.ok}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
