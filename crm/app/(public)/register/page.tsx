import { redirect } from "next/navigation";

import { RegisterForm, type RegisterMethod } from "./register-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getActor } from "@/lib/auth/session";
import { PRIVACY_POLICY_PATH } from "@/lib/legal/consent-texts";
import { REGISTRATION_CONSENT_TEXT } from "@/lib/legal/registration-consent";
import { smsConfigured } from "@/lib/notifications/sms";
import { siteOrigin } from "@/lib/urls";

export const metadata = { title: "Регистрация компании" };

const METHODS: readonly RegisterMethod[] = ["phone", "email"];

/**
 * Самостоятельная регистрация компании-клиента: телефон или почта.
 * Сюда же ведёт прежний адрес /register/company — кнопка «Я работодатель»
 * студенческой платформы.
 *
 * Вошедшему здесь делать нечего: вторую компанию на ту же учётку не
 * заведёшь, а пустая форма у человека с кабинетом только путает.
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ method?: string }>;
}) {
  if (await getActor()) redirect("/dashboard");

  const { method } = await searchParams;
  const initialMethod = METHODS.find((m) => m === method);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Регистрация компании</CardTitle>
        <CardDescription>
          Заведите кабинет — в нём виден весь подбор: кандидаты, встречи,
          документы, — и вакансии на студенческой платформе. Дальше несколько
          вопросов о компании и вакансии.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm
          consentText={REGISTRATION_CONSENT_TEXT}
          privacyHref={`${siteOrigin()}${PRIVACY_POLICY_PATH}`}
          phoneEnabled={smsConfigured()}
          initialMethod={initialMethod}
        />
      </CardContent>
    </Card>
  );
}
