import Link from "next/link";
import { redirect } from "next/navigation";

import { CompanyRegisterForm } from "./register-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getActor } from "@/lib/auth/session";

export const metadata = { title: "Регистрация компании" };

export default async function CompanyRegisterPage() {
  // Уже вошедшего разворачиваем: маршрутизацию по ролям сделает middleware
  if (await getActor()) redirect("/dashboard");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Регистрация компании</CardTitle>
        <CardDescription>
          Заведите аккаунт сами и разместите вакансию на студенческой
          платформе. Название компании и остальные детали профиля
          заполняются уже внутри кабинета.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CompanyRegisterForm />
      </CardContent>
      <CardFooter>
        <Button asChild variant="ghost" size="sm" className="w-full">
          <Link href="/login">Уже есть аккаунт — войти</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
