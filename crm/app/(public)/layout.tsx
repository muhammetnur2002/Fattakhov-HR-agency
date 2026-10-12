import { Logo } from "@/components/brand/logo";
import { SkipLink } from "@/components/shell/skip-link";
import { MAIN_LANDMARK_PROPS } from "@/lib/a11y";
import { CABINET_METADATA } from "@/lib/cabinet-metadata";

/**
 * Публичные страницы: вход, приглашение, выбор слота кандидатом, согласие на ПДн.
 * Без навигации и без сессии: сюда попадают в том числе люди, которых
 * в системе нет (кандидаты по одноразовым ссылкам).
 *
 * Тёмное поле вокруг держит бренд, светлая плоскость держит работу.
 * Полотно чёрное с лёгким свечением акцентом (#546E88) сверху — тот же
 * приём, что и на студенческой платформе (Aurora), а не фирменная
 * сланцевая фактура: то же полотно, что теперь и в остальном кабинете.
 *
 * Сама карточка светлая: это форма, её заполняют, и читаемость важнее
 * настроения.
 *
 * Ориентиры для читалок и клавиатуры: знак — шапка (header), страница —
 * единственный main (на него ведёт «Перейти к содержимому»), строка про
 * данные — подвал (footer). Раньше всё это было безымянными div, и на
 * странице входа не было ни одного ориентира.
 */
// Установка на экран «Домой» и цифры без автоссылок — см. lib/cabinet-metadata.ts
export const metadata = CABINET_METADATA;

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // public-shell — метка для правил сенсорного экрана в globals.css
    // (цели касания, поле не мельче 16px, своя галочка вместо системной
    // на iOS): формы входа и согласия заполняют с телефона чаще всего
    <div className="public-shell relative flex min-h-svh flex-col overflow-hidden bg-black">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_60%_at_50%_0%,rgba(84,110,136,0.20),transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(75%_60%_at_50%_38%,transparent_0%,rgba(0,0,0,0.6)_100%)]"
      />

      <SkipLink />

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-7 px-4 py-10">
        <header className="flex justify-center">
          {/* На тёмном поле знак всегда светлый, независимо от темы */}
          <Logo variant="lockup" tone="light" className="h-11" priority />
        </header>

        <main {...MAIN_LANDMARK_PROPS} className="public-surface">
          {children}
        </main>

        <footer className="text-center text-xs leading-relaxed text-white/70">
          Кадровое агентство Fattakhov HR. Данные передаются по защищённому
          соединению и используются только для подбора.
        </footer>
      </div>
    </div>
  );
}
