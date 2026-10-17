import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "./login-form";
import { QuickLogin } from "./quick-login";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { sanitizeCallbackUrl } from "@/lib/auth/login-redirect";
import { getActor } from "@/lib/auth/session";
import { smsConfigured } from "@/lib/notifications/sms";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Вход" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; expired?: string; sessions?: string }>;
}) {
  // Уже вошедшего разворачиваем: маршрутизацию по ролям сделает middleware
  if (await getActor()) redirect("/dashboard");

  const { callbackUrl, expired, sessions } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-2xl">Вход в платформу</CardTitle>
        <CardDescription>
          Кабинет клиента и рабочее место рекрутера
        </CardDescription>
      </CardHeader>
      <CardContent>
        {expired === "1" && (
          <Alert className="mb-4" role="status">
            <AlertDescription>
              Сессия закончилась, и последнее действие не выполнилось. Войдите снова — вы вернётесь на ту
              же страницу, а то, что успели ввести в форму, придётся ввести заново.
            </AlertDescription>
          </Alert>
        )}
        {sessions === "revoked" && (
          <Alert className="mb-4" role="status">
            <AlertDescription>
              Все сессии завершены. Войдите заново; если подозреваете чужой доступ, смените пароль.
            </AlertDescription>
          </Alert>
        )}
        {/* Пароль — главный способ; телефон — запасной под ним:
            у зарегистрированных по телефону пароля нет, и без этого способа
            через 30 дней (срок сессии) они остались бы снаружи */}
        <QuickLogin phoneEnabled={smsConfigured()}>
          <LoginForm callbackUrl={sanitizeCallbackUrl(callbackUrl)} />
        </QuickLogin>
      </CardContent>
      <CardFooter>
        {/* Ссылка на восстановление обязана быть на самой форме: человек,
            забывший пароль, ищет её здесь, а не в справке */}
        <Button asChild variant="ghost" size="sm" className="w-full">
          <Link href="/forgot">Забыли пароль</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
