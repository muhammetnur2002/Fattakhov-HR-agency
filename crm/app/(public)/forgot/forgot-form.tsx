"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { forgotPasswordAction, type PasswordState } from "@/app/actions/passwords";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Отправляем…" : "Прислать ссылку"}
    </Button>
  );
}

export function ForgotForm() {
  const [state, action] = useActionState<PasswordState, FormData>(
    forgotPasswordAction,
    {},
  );

  // Один и тот же экран независимо от того, есть такой адрес или нет.
  // Иначе форма превращается в способ узнать, работает ли человек
  // в компании: ввёл адрес, посмотрел на ответ.
  if (state.sent) {
    return (
      <div className="space-y-3 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10">
          <Check className="size-5 text-primary" />
        </div>
        <h2 className="font-medium">Проверьте почту</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Если такой адрес есть в системе, письмо со ссылкой уже отправлено.
          Не пришло за пару минут, посмотрите в спаме или напишите владельцу.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Рабочая почта</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
        />
      </div>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <SubmitButton />
    </form>
  );
}
