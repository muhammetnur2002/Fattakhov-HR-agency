"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { useEffect } from "react";

import {
  setLeadStatusAction,
  type LeadActionState,
} from "./actions";
import { Button } from "@/components/ui/button";

function StatusButton({
  status,
  label,
  variant = "outline",
}: {
  status: string;
  label: string;
  variant?: "default" | "outline" | "ghost";
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      name="status"
      value={status}
      size="sm"
      variant={variant}
      disabled={pending}
    >
      {label}
    </Button>
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
    <form action={action} className="flex flex-wrap gap-2">
      <input type="hidden" name="leadId" value={leadId} />

      {status === "NEW" && (
        <>
          <StatusButton status="IN_PROGRESS" label="Взять в работу" variant="default" />
          <StatusButton status="SPAM" label="Спам" variant="ghost" />
        </>
      )}

      {status === "IN_PROGRESS" && (
        <>
          <StatusButton status="CONVERTED" label="Стал клиентом" variant="default" />
          <StatusButton status="REJECTED" label="Не сложилось" />
        </>
      )}

      {status !== "NEW" && status !== "IN_PROGRESS" && (
        <StatusButton status="NEW" label="Вернуть в новые" variant="ghost" />
      )}
    </form>
  );
}
