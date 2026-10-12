"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { controlProps, FieldError } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FormState } from "@/lib/form-state";
import { useFormAction } from "@/lib/hooks/use-form-action";
import { ROLE_LABELS } from "@/lib/labels";

const CLIENT_ROLES = ["CLIENT_ADMIN", "CLIENT_HIRING", "CLIENT_VIEWER"] as const;

export type InviteFormState = FormState;

function SubmitButton({ loading }: { loading: boolean }) {
  return (
    <SubmitButtonBase loading={loading} pendingLabel="Создаём…">
      Пригласить
    </SubmitButtonBase>
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
  // Приглашение отправляется через useFormAction: «адрес уже занят» не стирает остальное
  // набранное, а текст ошибки встаёт под рядом — у поля с красной рамкой
  const { state, fields, pending, formProps } = useFormAction(action, {}, { resetOnSuccess: true });

  return (
    <form {...formProps} className="space-y-4">
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

        Высоты рядов — не auto, а числом: 20px под подпись, 2rem —
        ровно высота Input/SelectTrigger/Button (h-8): 32px, а на корне
        125% (app/globals.css) — 40px. Пикселями 32 поле вылезало из ряда
        на 8px и съедало отступ до подсказки ниже.

        В ряд — только с lg. На 768 при корне 125% поля, выбор роли (w-60)
        и кнопка в ширину карточки не помещались, и «Пригласить» молча
        срезался её краем на 95px; ниже lg поля идут столбиком, как на
        телефоне.

        И второе, менее очевидное: промежуток между подписью и полем
        задавался дважды — один раз на родителе (общий gap), второй раз
        тем же числом на каждой обёртке (gap-2). Для subgrid это не
        «то же самое, продублировано на всякий случай», а спор: ряд
        subgrid общий с родителем, и его собственный gap по спецификации
        ему не принадлежит — но был объявлен, и браузер отчасти его
        учёл, отчего поле вставало на 4px выше положенного. Число
        одно, место одно — на родителе.
      */}
      {/* На сенсорном экране поля и кнопка выше h-8 (min-height 2.4em,
          globals.css), и ряд поля растёт вместе с ними: иначе поля
          вылезали бы из ряда */}
      <div className="grid gap-x-4 gap-y-4 lg:gap-y-2 lg:grid-cols-[1fr_1fr_auto_auto] lg:grid-rows-[20px_2rem] lg:items-start lg:touch:grid-rows-[20px_2.75rem]">
        <div className="space-y-2 lg:row-span-2 lg:grid lg:grid-rows-subgrid lg:space-y-0">
          <Label htmlFor="invite-email">Почта</Label>
          <Input
            name="email"
            type="email"
            placeholder="name@company.ru"
            required
            {...controlProps("invite-email", { error: fields.email })}
          />
        </div>

        <div className="space-y-2 lg:row-span-2 lg:grid lg:grid-rows-subgrid lg:space-y-0">
          <Label htmlFor="invite-position">Должность</Label>
          <Input
            name="position"
            placeholder="Руководитель отдела"
            {...controlProps("invite-position", { error: fields.position })}
          />
        </div>

        <div className="space-y-2 lg:row-span-2 lg:grid lg:grid-rows-subgrid lg:space-y-0">
          <Label htmlFor="invite-role">Роль</Label>
          <Select
            name="role"
            defaultValue={noUsersYet ? "CLIENT_ADMIN" : "CLIENT_HIRING"}
          >
            {/* 52 не хватало: «Нанимающий менеджер» упирался в стрелку
                и обрезался на последней букве */}
            <SelectTrigger {...controlProps("invite-role", { error: fields.role })} className="w-full lg:w-60">
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
        <div className="lg:col-start-4 lg:row-start-2">
          <SubmitButton loading={pending} />
        </div>
      </div>

      {/* Тексты ошибок — под всем рядом: поля стоят в общей сетке с фиксированными рядами, и
          строка под полем сдвинула бы кнопку. Поле с ошибкой выделено рамкой и связано с текстом. */}
      {(fields.email || fields.position || fields.role) && (
        <div className="space-y-2">
          {fields.email && <FieldError id="invite-email-error">{fields.email}</FieldError>}
          {fields.position && <FieldError id="invite-position-error">{fields.position}</FieldError>}
          {fields.role && <FieldError id="invite-role-error">{fields.role}</FieldError>}
        </div>
      )}

      {/* Приглашённый получает реальный доступ к кандидатам и вакансиям
          компании сразу после перехода по ссылке — предупреждение рядом
          с формой, а не только в самом письме, чтобы его увидели ещё
          до отправки, когда решение ещё можно передумать */}
      <p className="text-xs text-muted-foreground">
        Приглашённый получит доступ к данным компании в этом кабинете —
        зовите только тех, кому доверяете.
      </p>

      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
