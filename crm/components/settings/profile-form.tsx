"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { updateProfileAction, type ProfileState } from "@/app/actions/profile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Сохраняем…" : "Сохранить"}
    </Button>
  );
}

/**
 * Свои данные — единственное место, где их можно поправить.
 *
 * Имя и должность задаются один раз при принятии приглашения; опечатку
 * или смену должности исправить было негде.
 */
export function ProfileForm({
  fullName,
  phone,
  position,
}: {
  fullName: string;
  phone: string | null;
  position: string | null;
}) {
  const [state, formAction] = useActionState<ProfileState, FormData>(
    updateProfileAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fullName">Имя</Label>
        <Input id="fullName" name="fullName" defaultValue={fullName} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="position">Должность</Label>
        <Input
          id="position"
          name="position"
          defaultValue={position ?? ""}
          placeholder="Показывается собеседникам в кабинете"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Телефон</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={phone ?? ""}
          placeholder="+7 999 123-45-67"
        />
      </div>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.ok && (
        <Alert>
          <AlertDescription>{state.ok}</AlertDescription>
        </Alert>
      )}

      <Submit />
    </form>
  );
}
