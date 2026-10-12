"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { toast } from "sonner";

import type { FormState } from "./actions";
import {
  ClientForm,
  type AccountManagerOption,
  type ClientFormValues,
} from "@/components/clients/client-form";
import { createClientFromLinkRequestAction, linkExistingClientAction as linkAction } from "./link-requests/actions";
import { Button } from "@/components/ui/button";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Panel } from "@/components/ui/panel";
import { useConfirmFocus } from "@/lib/hooks/use-return-focus";

type Mode = "closed" | "create" | "existing";

function SubmitButton({ label }: { label: string }) {
  return (
    <SubmitButtonBase size="sm" pendingLabel="Сохраняем…">
      {label}
    </SubmitButtonBase>
  );
}

/**
 * Добавить одобренную (но ещё не привязанную) компанию как клиента —
 * то же самое действие, что и у заявки на привязку (см. link-requests/
 * link-request-actions.tsx), только тут не было формальной заявки —
 * компания просто уже одобрена на студенческой платформе.
 */
export function CompanyActions({
  employerId,
  existingClients,
  managers,
  prefill,
}: {
  employerId: string;
  existingClients: Array<{ id: string; name: string }>;
  managers: AccountManagerOption[];
  prefill: ClientFormValues;
}) {
  const [mode, setMode] = useState<Mode>("closed");
  // Кнопки режимов заменяются формой: после «Отмены» фокус возвращается на ту, что открывала. В форме
  // «Создать клиента» фокус при открытии ставит поле «Название» (autoFocus), в «Привязать» — выбор клиента
  const { triggerRef: createTrigger, questionId: createQuestionId, groupProps: createGroup } =
    useConfirmFocus(mode === "create");
  const {
    triggerRef: existingTrigger,
    focusRef: existingFocus,
    questionId: existingQuestionId,
  } = useConfirmFocus(mode === "existing");
  const [clientId, setClientId] = useState("");
  const [linkState, linkFormAction] = useActionState<FormState, FormData>(linkAction, {});

  useEffect(() => {
    if (linkState.ok) toast.success(linkState.ok);
    if (linkState.error) toast.error(linkState.error);
  }, [linkState]);

  if (mode === "closed") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button ref={createTrigger} size="sm" onClick={() => setMode("create")}>
          Создать клиента
        </Button>
        <Button ref={existingTrigger} size="sm" variant="outline" onClick={() => setMode("existing")}>
          Привязать к существующему
        </Button>
      </div>
    );
  }

  if (mode === "create") {
    return (
      <Panel {...createGroup}>
        <span id={createQuestionId} className="sr-only">
          Новый клиент из заявки компании
        </span>
        <ClientForm
          action={createClientFromLinkRequestAction}
          employerId={employerId}
          values={prefill}
          managers={managers}
          submitLabel="Создать клиента и привязать"
        />
        <Button type="button" size="sm" variant="ghost" onClick={() => setMode("closed")}>
          Отмена
        </Button>
      </Panel>
    );
  }

  return (
    <form action={linkFormAction} aria-labelledby={existingQuestionId} className="flex flex-wrap items-center gap-2">
      <span id={existingQuestionId} className="sr-only">
        Привязать компанию к существующему клиенту
      </span>
      <input type="hidden" name="employerId" value={employerId} />
      <input type="hidden" name="clientId" value={clientId} />
      <Select value={clientId} onValueChange={setClientId}>
        <SelectTrigger ref={existingFocus} className="w-56">
          <SelectValue placeholder="Выберите клиента" />
        </SelectTrigger>
        <SelectContent>
          {existingClients.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <SubmitButton label="Привязать" />
      <Button type="button" size="sm" variant="ghost" onClick={() => setMode("closed")}>
        Отмена
      </Button>
    </form>
  );
}
