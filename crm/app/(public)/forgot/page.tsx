import Link from "next/link";

import { ForgotForm } from "./forgot-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Восстановление доступа" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Забыли пароль</CardTitle>
        <CardDescription>
          Пришлём ссылку для смены пароля на рабочую почту. Она действует
          час и открывается один раз.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ForgotForm />
      </CardContent>

      <CardFooter>
        <Button asChild variant="ghost" size="sm" className="w-full">
          <Link href="/login">Вернуться ко входу</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
