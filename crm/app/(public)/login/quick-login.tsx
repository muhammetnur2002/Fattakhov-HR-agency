"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { PhoneLogin } from "@/components/auth/phone-login";
import { Fold } from "@/components/motion/fold";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Вход по номеру телефона.
 *
 * Нужен не для удобства, а обязательно: зарегистрированные этим
 * способом пароля не имеют, и без них через 30 дней (срок сессии)
 * оказались бы заперты снаружи.
 *
 * Галочки согласия здесь нет — и потому вход никого не заводит.
 * Если номер подтвердился, а аккаунта нет, человеку
 * предлагают регистрацию: там он даст согласие.
 *
 * Форма пароля приходит сюда же (children), чтобы на время ввода кода
 * из SMS её свернуть: две одинаковые кнопки «Войти» и пустые поля
 * почты и пароля рядом с полем для кода сбивают с толку.
 */
export function QuickLogin({
  phoneEnabled,
  children,
}: {
  phoneEnabled: boolean;
  /** Форма входа по паролю. */
  children: ReactNode;
}) {
  const [noAccount, setNoAccount] = useState(false);
  const [phoneActive, setPhoneActive] = useState(false);

  if (!phoneEnabled) return children;

  return (
    <div>
      <Fold open={!phoneActive}>
        <div className="space-y-4 pb-4">
          {children}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            или
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      </Fold>

      <div className="space-y-4">
        {noAccount && (
          <Alert>
            <AlertDescription>
              Аккаунта с таким входом пока нет.{" "}
              <Link
                href="/register"
                className="font-medium underline underline-offset-2"
              >
                Зарегистрируйтесь
              </Link>{" "}
              — это минута.
            </AlertDescription>
          </Alert>
        )}

        {phoneEnabled && (
          <PhoneLogin
            consent={false}
            requireConsent={false}
            submitLabel="Войти"
            onNeedsRegistration={() => setNoAccount(true)}
            onActiveChange={setPhoneActive}
          />
        )}
      </div>
    </div>
  );
}
