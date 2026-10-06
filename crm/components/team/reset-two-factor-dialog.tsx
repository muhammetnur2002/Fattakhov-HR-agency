"use client";

import { ShieldOff } from "lucide-react";
import { useActionState, useState } from "react";

import {
  FormMessages,
  SubmitButton,
  type AccountAction,
  type AccountFormState,
} from "@/components/shared/account-forms";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * «Сбросить 2FA» — для владельца, когда сотрудник потерял и телефон,
 * и коды восстановления. Действие снимает второй фактор с чужой учётки,
 * поэтому не одной кнопкой, а с подтверждением в диалоге: что именно
 * произойдёт и что сотрудник войдёт и настроит 2FA заново.
 */
export function ResetTwoFactorDialog({
  member,
  action,
}: {
  member: { id: string; fullName: string };
  action: AccountAction;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<AccountFormState, FormData>(action, {});

  return (
    <div className="space-y-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <ShieldOff className="size-4" aria-hidden />
            Сбросить 2FA
          </Button>
        </DialogTrigger>
        <DialogContent>
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="userId" value={member.id} />
            <DialogHeader>
              <DialogTitle>Сбросить 2FA сотруднику?</DialogTitle>
              <DialogDescription>
                {member.fullName} потерял телефон и коды восстановления. Сброс
                удалит его ключ и коды, а все его открытые сессии закроются.
                При следующем входе он по паролю попадёт на экран настройки
                двухфакторной защиты и подключит её заново. Делайте это, только
                убедившись, что просит именно он: на время до настройки вход
                защищён одним паролем.
              </DialogDescription>
            </DialogHeader>
            <FormMessages state={state} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <SubmitButton label="Сбросить 2FA" pending="Сбрасываем…" />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {!open && state.ok && <p className="text-xs text-muted-foreground">{state.ok}</p>}
    </div>
  );
}
