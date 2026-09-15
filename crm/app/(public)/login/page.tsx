import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "./login-form";
import { Button } from "@/components/ui/button";
import { getActor } from "@/lib/auth/session";
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
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  // Уже вошедшего разворачиваем: маршрутизацию по ролям сделает middleware
  if (await getActor()) redirect("/dashboard");

  const { callbackUrl } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Вход в платформу</CardTitle>
        <CardDescription>
          Кабинет клиента и рабочее место рекрутера
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm callbackUrl={sanitizeCallbackUrl(callbackUrl)} />
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

/**
 * Разрешаем только внутренние относительные пути.
 * Без этой проверки ?callbackUrl=https://evil.example превращает форму входа
 * в открытый редирект.
 */
function sanitizeCallbackUrl(url: string | undefined): string {
  if (!url) return "/";
  if (!url.startsWith("/") || url.startsWith("//")) return "/";
  return url;
}
