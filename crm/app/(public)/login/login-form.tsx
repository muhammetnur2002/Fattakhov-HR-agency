"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { login, type LoginState } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Входим…" : label}
    </Button>
  );
}

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {});

  /*
    Почта и пароль под контролем состояния намеренно.
    React после действия формы сбрасывает неуправляемые поля, и на втором
    шаге, где спрашивается код, форма оказывалась пустой: человек вводил
    код, а уходил запрос без почты и пароля.

    Возвращать их с сервера нельзя: пароль не должен ездить обратно
    в браузер даже своему владельцу.
  */
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.ru"
          required
          autoFocus={!state.needsCode}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Пароль</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {/*
        Поле кода появляется вторым шагом той же формы, а не на отдельной
        странице. Отдельная страница потребовала бы промежуточного
        состояния «пароль принят, но человек ещё не вошёл», то есть
        полусессии, которую надо где-то хранить и не забыть погасить.
        Здесь этого состояния просто нет.
      */}
      {state.needsCode && (
        <div className="space-y-2">
          <Label htmlFor="code">Код подтверждения</Label>
          <Input
            id="code"
            name="code"
            inputMode="text"
            autoComplete="one-time-code"
            placeholder="123456"
            required
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Шесть цифр из приложения-аутентификатора. Нет телефона под
            рукой — введите код восстановления.
          </p>
        </div>
      )}

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <SubmitButton label={state.needsCode ? "Подтвердить" : "Войти"} />
    </form>
  );
}
