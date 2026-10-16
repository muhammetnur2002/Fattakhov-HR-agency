"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { toast } from "sonner";

import type { FormState } from "../actions";
import {
  ClientForm,
  type AccountManagerOption,
  type ClientFormValues,
} from "@/components/clients/client-form";
import {
  createClientFromLinkRequestAction,
  linkExistingClientAction as linkAction,
  rejectLinkRequestAction as rejectAction,
} from "./actions";
import { Button } from "@/components/ui/button";
import { ConfirmBlock } from "@/components/ui/confirm-block";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/ui/panel";
import { useConfirmFocus } from "@/lib/hooks/use-return-focus";

type Mode = "closed" | "create" | "existing" | "reject";

function SubmitButton({ label }: { label: string }) {
  return (
    <SubmitButtonBase size="sm" pendingLabel="Сохраняем…">
      {label}
    </SubmitButtonBase>
  );
}

/**
 * Три исхода заявки на привязку — переключатель режима, а не три формы
 * сразу: карточка иначе не помещается на телефоне, а решение здесь
 * всегда одно из трёх и назад не переключают.
 */
export function LinkRequestActions({
  employerId,
  existingClients,
  managers,
  prefill,
}: {
  employerId: string;
  existingClients: Array<{ id: string; name: string }>;
  managers: AccountManagerOption[];
  /** Название и город из профиля на студенческой платформе — предзаполняют форму клиента. */
  prefill: ClientFormValues;
}) {
  const [mode, setMode] = useState<Mode>("closed");
  // Кнопки режимов заменяются формой: после «Отмены» фокус возвращается на ту, что открывала. В форме
  // «Создать клиента» фокус при открытии ставит поле «Название» (autoFocus)
  const { triggerRef: createTrigger, questionId: createQuestionId, groupProps: createGroup } =
    useConfirmFocus(mode === "create");
  const {
    triggerRef: existingTrigger,
    focusRef: existingFocus,
    questionId: existingQuestionId,
  } = useConfirmFocus(mode === "existing");
  // «Отклонить» — подтверждение с полем пояснения: его ведёт ConfirmBlock, ссылка на кнопку — наша
  const rejectTrigger = useRef<HTMLButtonElement>(null);
  const [clientId, setClientId] = useState("");
  const [linkState, linkFormAction] = useActionState<FormState, FormData>(linkAction, {});
  const [rejectState, rejectFormAction] = useActionState<FormState, FormData>(rejectAction, {});

  useEffect(() => {
    if (linkState.ok) toast.success(linkState.ok);
    if (linkState.error) toast.error(linkState.error);
  }, [linkState]);
  useEffect(() => {
    // Закрывать форму по успеху не нужно: отклонённая заявка пропадёт
    // из списка сама, когда сервер перечитает страницу (revalidatePath)
    if (rejectState.ok) toast.success(rejectState.ok);
    if (rejectState.error) toast.error(rejectState.error);
  }, [rejectState]);

  return (
    <>
      {mode === "closed" && (
        <div className="flex flex-wrap gap-2">
          <Button ref={createTrigger} size="sm" onClick={() => setMode("create")}>
            Создать клиента
          </Button>
          <Button ref={existingTrigger} size="sm" variant="outline" onClick={() => setMode("existing")}>
            Привязать к существующему
          </Button>
          <Button ref={rejectTrigger} size="sm" variant="ghost" onClick={() => setMode("reject")}>
            Отклонить
          </Button>
        </div>
      )}

      {mode === "create" && (
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
      )}

      {mode === "existing" && (
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
      )}

      <ConfirmBlock
        open={mode === "reject"}
        onOpenChange={(next) => setMode(next ? "reject" : "closed")}
        triggerRef={rejectTrigger}
        formProps={{ action: rejectFormAction }}
        questionHidden
        question="Отклонить заявку с пояснением"
        confirmLabel="Отклонить с пояснением"
        pendingLabel="Сохраняем…"
        confirmVariant="default"
      >
        <input type="hidden" name="employerId" value={employerId} />
        <Textarea
          name="note"
          required
          rows={2}
          placeholder="Что нужно поправить или уточнить — компания увидит этот текст"
        />
      </ConfirmBlock>
    </>
  );
}
