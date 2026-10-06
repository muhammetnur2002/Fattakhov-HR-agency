import Link from "next/link";

import { ConfirmEmailForm } from "./confirm-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { readEmailConfirmToken } from "@/lib/services/email-confirmation";

export const metadata = { title: "Подтверждение почты" };

/**
 * Страница по ссылке из письма «Подтвердите почту». Открыта без входа:
 * письмо читают и на телефоне, где кабинет не открыт. Защита — подпись
 * в самой ссылке (lib/services/email-confirmation.ts), а подтверждает
 * кнопка, не переход.
 */
export default async function ConfirmEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const claims = readEmailConfirmToken(token);

  if (!claims) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Ссылка недействительна</CardTitle>
          <CardDescription>
            Она устарела или повреждена. Запросите новую в настройках кабинета.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Перейти ко входу</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Подтверждение почты</CardTitle>
        <CardDescription>
          Подключить <span className="font-medium text-foreground">{claims.email}</span>{" "}
          как рабочую почту в кабинете Fattakhov HR? Сюда будут приходить
          уведомления о кандидатах.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ConfirmEmailForm token={token} />
      </CardContent>
    </Card>
  );
}
