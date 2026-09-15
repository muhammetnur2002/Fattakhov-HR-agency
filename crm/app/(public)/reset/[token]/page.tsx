import Link from "next/link";

import { ResetForm } from "./reset-form";
import { withEmailOff } from "@/components/shared/email-off";
import { RateLimitCard } from "@/components/shared/rate-limit-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { guardRate } from "@/lib/security/guard";
import { getResetTarget } from "@/lib/services/passwords";

export const metadata = { title: "Новый пароль" };

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const rate = await guardRate("publicToken");
  if (!rate.allowed) return <RateLimitCard retryAfter={rate.retryAfter} />;

  const target = await getResetTarget(token);

  // Одно и то же сообщение на просроченную, использованную и выдуманную
  // ссылку: по ответу нельзя понять, существовала ли она
  if (!target) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Ссылка недействительна</CardTitle>
          <CardDescription>
            Она истекла, уже использована или введена с ошибкой. Запросите
            новую, это займёт минуту.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button asChild className="w-full">
            <Link href="/forgot">Запросить новую ссылку</Link>
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link href="/login">Вернуться ко входу</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Новый пароль</CardTitle>
        <CardDescription>
          {target.fullName}, задайте пароль для{" "}
          {withEmailOff(target.email, target.email)}. После смены на других
          устройствах вход придётся выполнить заново.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResetForm token={token} />
      </CardContent>
    </Card>
  );
}
