"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { EmailRegistration } from "./email-registration";
import { PhoneLogin } from "@/components/auth/phone-login";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Регистрация: сначала способ входа, анкета — потом.
 *
 * Здесь только способ: телефон или почта. Компания и вакансия —
 * вопросами по одному после входа (/onboarding), одинаково для обоих
 * способов.
 *
 * На экране один способ за раз, переключатель сверху. Оба подряд
 * путали (CRM агентства, 24.09.2026): рядом с полем для кода пустая почта
 * выглядела обязательной, а после подсказки «отметьте согласие» под
 * галочкой оказывалась кнопка почты — её нажимали, и браузер требовал
 * адрес. Теперь у каждого способа свои поля, под ними согласие и его
 * собственная кнопка — «обработка данных снизу», и чужой кнопки рядом нет.
 *
 * Согласие одно на оба способа — и SMS, и почта — это уже
 * персональные данные: отмеченное на одной вкладке остаётся отмеченным
 * на другой. Кнопки до согласия не выключены: выключенная молчит о том,
 * почему не нажимается, а нажатая подсвечивает галочку и ставит на неё
 * фокус.
 */
export type RegisterMethod = "phone" | "email";

const METHOD_LABELS: Record<RegisterMethod, string> = {
  phone: "Телефон",
  email: "Почта",
};

/*
  Текст согласия — дословный, из юридического пакета
  (lib/legal/registration-consent.ts), менять формулировки нельзя. Целиком
  открытым абзацем он читается как «слишком длинная строка»: на большинстве
  форм у галочки короткая подпись, а не абзац закона. Сокращаем не текст,
  а его ПОКАЗ: по умолчанию — короткая подпись, полный текст — по клику,
  слово в слово тот же, что сохраняется версией вместе с согласием.
*/
function ConsentCheckbox({
  consentText,
  privacyHref,
  checked,
  onChange,
  nudge,
  inputRef,
}: {
  consentText: string;
  privacyHref: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  /** Нажали кнопку до согласия — подсветить, где отметить. */
  nudge: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <label
      className={cn(
        // -mx-2, а не -m-2: отрицательный отступ по вертикали перебивал
        // зазор формы (space-y в Tailwind 4 — margin с нулевой
        // специфичностью), и подпись вставала вплотную к кнопке
        "-mx-2 flex items-start gap-2 rounded-md p-2 text-xs text-muted-foreground transition-colors",
        nudge && !checked && "bg-destructive/10 text-foreground",
      )}
    >
      <input
        ref={inputRef}
        type="checkbox"
        name="consent"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-brand-graphite"
      />
      <span>
        Согласен(на) на обработку персональных данных.{" "}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="underline underline-offset-2 hover:text-foreground"
        >
          {expanded ? "Скрыть текст" : "Текст согласия"}
        </button>
        {" · "}
        <a href={privacyHref} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          Политика обработки данных
        </a>
        {expanded && <span className="mt-1.5 block">{consentText}</span>}
        {nudge && !checked && (
          <span role="alert" className="mt-1.5 block font-medium text-destructive">
            Сначала отметьте согласие — без него зарегистрировать нельзя
          </span>
        )}
      </span>
    </label>
  );
}

export function RegisterForm({
  consentText,
  privacyHref,
  phoneEnabled,
  initialMethod,
}: {
  consentText: string;
  privacyHref: string;
  /** SMS настроены (или разработка, где код виден в журнале). */
  phoneEnabled: boolean;
  /** Открыть сразу эту вкладку — например, почту для прежнего адреса /register/company. */
  initialMethod?: RegisterMethod;
}) {
  const methods: RegisterMethod[] = [
    ...(phoneEnabled ? (["phone"] as const) : []),
    "email",
  ];
  const [method, setMethod] = useState<RegisterMethod>(
    initialMethod && methods.includes(initialMethod) ? initialMethod : methods[0],
  );
  const [consent, setConsent] = useState(false);
  const [nudge, setNudge] = useState(false);
  const consentRef = useRef<HTMLInputElement>(null);

  const askConsent = () => {
    setNudge(true);
    const box = consentRef.current;
    if (!box) return;
    // На телефоне галочку может закрывать клавиатура — довести до неё
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    box.focus({ preventScroll: true });
  };

  // На вкладке виден ровно один экземпляр галочки: неактивные вкладки
  // не отрисовываются, и ref всегда указывает на видимую
  const consentBox = (
    <ConsentCheckbox
      consentText={consentText}
      privacyHref={privacyHref}
      checked={consent}
      onChange={(v) => {
        setConsent(v);
        if (v) setNudge(false);
      }}
      nudge={nudge}
      inputRef={consentRef}
    />
  );

  const panels: Record<RegisterMethod, React.ReactNode> = {
    phone: (
      <PhoneLogin
        consent={consent}
        requireConsent
        prominent
        submitLabel="Зарегистрироваться"
        onNeedsConsent={askConsent}
        beforeSubmit={consentBox}
      />
    ),
    email: (
      <EmailRegistration
        consent={consent}
        consentBox={consentBox}
        onNeedsConsent={askConsent}
      />
    ),
  };

  return (
    <div className="space-y-5">
      {methods.length > 1 ? (
        <Tabs
          value={method}
          onValueChange={(value) => {
            setMethod(value as RegisterMethod);
            setNudge(false);
          }}
          className="gap-5"
        >
          <TabsList className="w-full" aria-label="Способ регистрации">
            {methods.map((m) => (
              <TabsTrigger key={m} value={m}>
                {METHOD_LABELS[m]}
              </TabsTrigger>
            ))}
          </TabsList>
          {methods.map((m) => (
            <TabsContent key={m} value={m}>
              {panels[m]}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        panels.email
      )}

      <p className="text-center text-xs text-muted-foreground">
        Уже есть доступ? <Link href="/login" className="underline underline-offset-2">Войти</Link>
      </p>
    </div>
  );
}
