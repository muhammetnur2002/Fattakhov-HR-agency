import { Logo } from "@/components/brand/logo";

/**
 * Публичные страницы: вход, приглашение, выбор слота кандидатом, согласие на ПДн.
 * Без навигации и без сессии: сюда попадают в том числе люди, которых
 * в системе нет (кандидаты по одноразовым ссылкам).
 *
 * Фон - фирменная сланцевая фактура из брендбука, не декоративный
 * градиент. Кандидат открывает ссылку с телефона, из письма, и должен
 * с первого кадра понять, от кого она. Просьба подтвердить персональные
 * данные на белом листе без опознавательных знаков выглядит ровно так же,
 * как выглядит мошенничество.
 *
 * Сама карточка светлая: это форма, её заполняют, и читаемость важнее
 * настроения. Тёмное поле вокруг держит бренд, светлая плоскость держит
 * работу.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-brand-slate">
      {/* Фактура и виньетка отдельными слоями: так же собран сам брендбук */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[url('/brand/slate-speckle.jpg')] bg-cover bg-center"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(75%_60%_at_50%_38%,transparent_0%,rgba(9,13,17,0.55)_100%)]"
      />

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-7 px-4 py-10">
        <div className="flex justify-center">
          {/* На тёмном поле знак всегда светлый, независимо от темы */}
          <Logo variant="lockup" tone="light" className="h-11" priority />
        </div>

        <div className="public-surface">{children}</div>

        <p className="text-center text-xs leading-relaxed text-white/70">
          Кадровое агентство Fattakhov HR. Данные передаются по защищённому
          соединению и используются только для подбора.
        </p>
      </div>
    </div>
  );
}
