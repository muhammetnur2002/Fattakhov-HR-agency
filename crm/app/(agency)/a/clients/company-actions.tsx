"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import type { FormState } from "./actions";
import {
  ClientForm,
  type AccountManagerOption,
  type ClientFormValues,
} from "@/components/clients/client-form";
import { createClientFromLinkRequestAction, linkExistingClientAction as linkAction } from "./link-requests/actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Mode = "closed" | "create" | "existing";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Сохраняем…" : label}
    </Button>
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
  const [clientId, setClientId] = useState("");
  const [linkState, linkFormAction] = useActionState<FormState, FormData>(linkAction, {});

  useEffect(() => {
    if (linkState.ok) toast.success(linkState.ok);
    if (linkState.error) toast.error(linkState.error);
  }, [linkState]);

  if (mode === "closed") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setMode("create")}>
          Создать клиента
        </Button>
        <Button size="sm" variant="outline" onClick={() => setMode("existing")}>
          Привязать к существующему
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
