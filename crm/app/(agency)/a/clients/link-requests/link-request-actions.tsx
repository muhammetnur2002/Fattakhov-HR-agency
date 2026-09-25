"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Mode = "closed" | "create" | "existing" | "reject";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Сохраняем…" : label}
    </Button>
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

  if (mode === "closed") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setMode("create")}>
          Создать клиента
        </Button>
        <Button size="sm" variant="outline" onClick={() => setMode("existing")}>
          Привязать к существующему
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMode("reject")}>
          Отклонить
        </Button>
      </div>
    );
  }

  if (mode === "create") {
    return (
      <div className="space-y-3 rounded-lg border p-4">
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
      </div>
    );
  }

  if (mode === "existing") {
    return (
      <form action={linkFormAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="employerId" value={employerId} />
        <input type="hidden" name="clientId" value={clientId} />
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger className="w-56">
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

  return (
    <form action={rejectFormAction} className="space-y-2">
      <input type="hidden" name="employerId" value={employerId} />
      <Textarea
        name="note"
        required
        rows={2}
        placeholder="Что нужно поправить или уточнить — компания увидит этот текст"
      />
      <div className="flex gap-2">
        <SubmitButton label="Отклонить с пояснением" />
        <Button type="button" size="sm" variant="ghost" onClick={() => setMode("closed")}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
