import Link from "next/link";

import { CookieSettingsLink } from "@/components/analytics/cookie-banner";
import { withEmailOff } from "@/components/shared/email-off";
import {
  OPERATOR_ADDRESS,
  OPERATOR_INN,
  OPERATOR_NAME,
  OPERATOR_OGRNIP,
  PRIVACY_POLICY_PATH,
} from "@/lib/legal/consent-texts";
import { Logo } from "@/components/brand/logo";
import {
  EMAIL_DISPLAY,
  EMAIL_HREF,
  PHONE_DISPLAY,
  PHONE_HREF,
  TELEGRAM_DISPLAY,
  TELEGRAM_HREF,
} from "@/lib/contacts";
import { studentsUrl } from "@/lib/urls";

const CONTACTS = [
  { label: "Telegram", value: TELEGRAM_DISPLAY, href: TELEGRAM_HREF },
  { label: "Телефон", value: PHONE_DISPLAY, href: PHONE_HREF },
  { label: "Почта", value: EMAIL_DISPLAY, href: EMAIL_HREF },
];

/**
 * Разделы сайта в подвале.
 *
 * Дублируют шапку намеренно: там они спрятаны до 1024px, то есть
 * на телефоне и планшете дойти до тарифов и кейсов можно было только
 * прокруткой главной. Подвал — привычное место, где такие ссылки ищут.
 */
const SECTIONS = [
  { href: "/#how", label: "Как работаем" },
  { href: "/cases", label: "Кейсы" },
  { href: "/tariffs", label: "Тарифы" },
  { href: "/audit", label: "Аудит найма" },
];

export function MarketingFooter() {
  // Студенческая платформа — отдельное приложение; на проде без её адреса пункта нет
  const students = studentsUrl("/");

  return (
    <footer className="relative overflow-hidden bg-brand-graphite text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[url('/brand/slate-ribbed.jpg')] bg-cover bg-center opacity-20 mix-blend-overlay"
      />

      <div className="relative mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Logo variant="lockup" tone="light" className="h-8" />
            <p className="mt-4 max-w-xs text-base leading-relaxed text-white/65">
              Внешняя функция найма для растущих компаний.
            </p>
          </div>

          <div>
            <div className="text-sm font-medium tracking-wide text-white/65 uppercase">
              Разделы
            </div>
            <ul className="mt-4 space-y-2.5 text-base">
              {SECTIONS.map((s) => (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    className="text-white/90 underline-offset-4 transition-colors hover:text-white hover:underline"
                  >
                    {s.label}
                  </Link>
                </li>
              ))}
              {/* Отдельное приложение агентства, поэтому <a>, а не Link */}
              {students && (
                <li>
                  <a
                    href={students}
                    className="text-white/90 underline-offset-4 transition-colors hover:text-white hover:underline"
                  >
                    Студентам
                  </a>
                </li>
              )}
            </ul>
          </div>

          <div>
            <div className="text-sm font-medium tracking-wide text-white/65 uppercase">
              Связаться напрямую
            </div>
            <dl className="mt-4 space-y-2.5">
              {CONTACTS.map((c) => (
                <div key={c.label} className="flex gap-3 text-base">
                  <dt className="w-20 shrink-0 text-white/65">{c.label}</dt>
                  <dd>
                    <a
                      href={c.href}
                      className="text-white/90 underline-offset-4 transition-colors hover:text-white hover:underline"
                    >
                      {c.label === "Почта" ? withEmailOff(c.value, c.value) : c.value}
                    </a>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Реквизиты на видном месте, а не только в политике: для
            человека, который решает, отдавать ли агентству сотни тысяч
            в месяц, ИНН и адрес в подвале — обычная проверка того,
            что за сайтом стоит настоящее лицо */}
        <div className="mt-10 border-t border-white/12 pt-6 text-sm leading-relaxed text-white/65">
          {OPERATOR_NAME} · ИНН {OPERATOR_INN}
          {OPERATOR_OGRNIP && <> · ОГРНИП {OPERATOR_OGRNIP}</>}
          <br />
          {OPERATOR_ADDRESS}
        </div>

        {/* Ссылка на политику обязана быть в подвале и доступна
            с любой страницы: требование раздела 24 юридического
            пакета. Настройки cookie рядом - там же, где их ищут */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-sm text-white/65">
          <span>© 2026 Fattakhov HR Agency</span>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link
              href={PRIVACY_POLICY_PATH}
              className="underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              Политика обработки персональных данных
            </Link>
            <CookieSettingsLink className="underline-offset-4 transition-colors hover:text-white hover:underline" />
            <span>Казань, Москва, удалённо</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
