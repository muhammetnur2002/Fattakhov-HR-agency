"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { useEffect } from "react";

import {
  setLeadStatusAction,
  type LeadActionState,
} from "./actions";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Роль кнопки в ряду.
 *
 * - `primary` — следующий шаг, ради которого открыта заявка: слева, залита
 *   цветом;
 * - `secondary` — отказ или обратный ход («Спам», «Не сложилось»): тихая,
 *   с рамкой, отодвинута к правому краю карточки — подальше от основной,
 *   чтобы не нажать её вместо «Взять в работу» по привычке или промахом;
 * - `single` — единственная кнопка («Вернуть в новые»): слева, без заливки.
 *
 * Раньше «Взять в работу» и «Спам» были одного размера и стояли вплотную
 * (gap-2), а «Спам» ещё и прозрачный — выглядел как подпись, а не кнопка.
 * На телефоне — каждая на всю ширину, основная первой.
 *
 * Размер у всех `sm`, как у кнопок кабинета везде: выше кнопки не делаем — решение
 * заказчицы про высоту ≈31px на телефоне (правило 2.4em в globals.css). Роль
 * различают заливка, порядок и положение, а не размер.
 */
const TONES = {
  primary: { variant: "default", size: "sm", className: "w-full sm:w-auto" },
  secondary: { variant: "outline", size: "sm", className: "w-full sm:ml-auto sm:w-auto" },
  single: { variant: "outline", size: "sm", className: "w-full sm:w-auto" },
} as const;

function StatusButton({
  status,
  label,
  tone,
}: {
  status: string;
  label: string;
  tone: keyof typeof TONES;
}) {
  // Форма одна на все статусы: блокируются все кнопки, а индикатор — только
  // у нажатой (SubmitButton сверяет имя и значение с данными формы)
  const { variant, size, className } = TONES[tone];
  return (
    <SubmitButton name="status" value={status} size={size} variant={variant} className={className}>
      {label}
    </SubmitButton>
  );
}

/**
 * Разбор заявки.
 *
 * Одна форма на все статусы: значение приходит из нажатой кнопки.
 * Иначе на каждую заявку висело бы четыре отдельных формы с одинаковым
 * скрытым полем.
 */
export function LeadActions({
  leadId,
  status,
}: {
  leadId: string;
  status: string;
}) {
  const [state, action] = useActionState<LeadActionState, FormData>(
    setLeadStatusAction,
    {},
  );

  useEffect(() => {
    if (state.ok) toast.success(state.ok);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input type="hidden" name="leadId" value={leadId} />

      {status === "NEW" && (
        <>
          <StatusButton status="IN_PROGRESS" label="Взять в работу" tone="primary" />
          <StatusButton status="SPAM" label="Спам" tone="secondary" />
        </>
      )}

      {status === "IN_PROGRESS" && (
        <>
          <StatusButton status="CONVERTED" label="Стал клиентом" tone="primary" />
          <StatusButton status="REJECTED" label="Не сложилось" tone="secondary" />
        </>
      )}

      {status !== "NEW" && status !== "IN_PROGRESS" && (
        <StatusButton status="NEW" label="Вернуть в новые" tone="single" />
      )}
    </form>
  );
}
