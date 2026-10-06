"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, useTransition, type ReactNode } from "react";

import {
  phoneSignInAction,
  requestPhoneCodeAction,
} from "@/app/actions/quick-auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeRuPhone, PhoneFormatError } from "@/lib/auth/phone";
import { cn } from "@/lib/utils";

/**
 * Вход и регистрация по номеру телефона: номер → код из SMS →
 * (если включён второй фактор) код из приложения.
 *
 * Шаги сменяют друг друга без перезагрузки, тем же мягким сдвигом, что
 * и анкета после регистрации (components/onboarding/brief-wizard.tsx).
 */

/** Повторный код — не раньше чем через минуту: SMS идёт не мгновенно. */
const RESEND_SECONDS = 60;

type Step = "phone" | "sms" | "totp";

export function PhoneLogin({
  consent,
  requireConsent,
  submitLabel,
  onNeedsConsent,
  onNeedsRegistration,
  onActiveChange,
  beforeSubmit,
  prominent = false,
}: {
  consent: boolean;
  requireConsent: boolean;
  /** «Зарегистрироваться» или «Войти». */
  submitLabel: string;
  onNeedsConsent?: () => void;
  onNeedsRegistration?: () => void;
  /**
   * Код отправлен и ждёт ввода — страница уберёт другие способы: рядом
   * с полем для кода пустое поле почты и вторая такая же кнопка выглядят
   * как ещё одно обязательное поле (замечено заказчиком 24.09.2026).
   */
  onActiveChange?: (active: boolean) => void;
  /** Галочка согласия — между полем номера и кнопкой, как в обычной форме. */
  beforeSubmit?: ReactNode;
  /**
   * Главная кнопка экрана (регистрация, где способ один на вкладке) —
   * или запасной способ рядом с формой пароля (вход): там контурная.
   */
  prominent?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>("phone");
  const [rawPhone, setRawPhone] = useState("");
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  function requestCode() {
    // Номер — раньше согласия: с неверным номером согласие не поможет,
    // а прокрутка к галочке уводила от поля, где ошибка. Проверка та же
    // функция, что на сервере, — не копия правил
    try {
      normalizeRuPhone(rawPhone);
    } catch (e) {
      if (!(e instanceof PhoneFormatError)) throw e;
      setError(e.message);
      return;
    }
    if (requireConsent && !consent) {
      onNeedsConsent?.();
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await requestPhoneCodeAction(rawPhone);
      if (result.error || !result.phone) {
        setError(result.error ?? "Не получилось отправить код");
        return;
      }
      setPhone(result.phone);
      setSentTo(result.sentTo ?? "");
      setSmsCode("");
      setResendIn(RESEND_SECONDS);
      setStep("sms");
      onActiveChange?.(true);
    });
  }

  function signInWith(secondFactor?: string) {
    setError(null);
    startTransition(async () => {
      const result = await phoneSignInAction({
        phone,
        smsCode: smsCode.trim(),
        consent,
        code: secondFactor,
      });
      // При успехе действие уводит на /dashboard и сюда не возвращается
      if (result.needsRegistration) {
        onNeedsRegistration?.();
        return;
      }
      if (result.needsCode) setStep("totp");
      setError(result.error ?? null);
    });
  }

  const shift = reduceMotion ? 0 : 24;
  const motionProps = {
    initial: { opacity: 0, x: shift },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -shift },
    transition: { duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] as const },
  };

  return (
    <div className="space-y-3">
      <AnimatePresence mode="wait" initial={false}>
        {step === "phone" && (
          <motion.form
            key="phone"
            {...motionProps}
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              requestCode();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="quick-phone">Номер телефона</Label>
              <Input
                id="quick-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+7 900 123-45-67"
                value={rawPhone}
                onChange={(e) => {
                  setRawPhone(e.target.value);
                  setError(null);
                }}
                aria-invalid={Boolean(error) || undefined}
                required
              />
            </div>
            {beforeSubmit}
            <Button
              type="submit"
              variant={prominent ? "default" : "outline"}
              // Блеклая до согласия — как «Зарегистрироваться» по почте
              className={cn("w-full", requireConsent && !consent && "opacity-50")}
              disabled={pending || !rawPhone.trim()}
            >
              {pending ? "Отправляем код…" : "Получить код по SMS"}
            </Button>
          </motion.form>
        )}

        {step === "sms" && (
          <motion.form
            key="sms"
            {...motionProps}
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              signInWith();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="quick-sms">Код из SMS</Label>
              <Input
                id="quick-sms"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={smsCode}
                onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ""))}
                autoFocus
                className="text-center text-lg tracking-[0.3em] tabular-nums"
              />
              <p className="text-xs text-muted-foreground">
                Отправили на {sentTo}.{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => {
                    setStep("phone");
                    setError(null);
                    onActiveChange?.(false);
                  }}
                >
                  Другой номер
                </button>
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={pending || smsCode.length !== 6}>
              {pending ? "Проверяем…" : submitLabel}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              disabled={pending || resendIn > 0}
              onClick={requestCode}
            >
              {resendIn > 0 ? `Прислать ещё раз через ${resendIn} с` : "Прислать код ещё раз"}
            </Button>
          </motion.form>
        )}

        {step === "totp" && (
          <motion.form
            key="totp"
            {...motionProps}
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              signInWith(totp.trim());
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="quick-2fa">Код из приложения</Label>
              <Input
                id="quick-2fa"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                У вас включена двухфакторная защита. Подойдёт и код восстановления.
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={pending || !totp.trim()}>
              {pending ? "Проверяем…" : "Войти"}
            </Button>
          </motion.form>
        )}
      </AnimatePresence>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
