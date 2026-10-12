import { logout } from "@/app/actions/auth";
import { Logo } from "@/components/brand/logo";
import { SkipLink } from "@/components/shell/skip-link";
import { MAIN_LANDMARK_PROPS } from "@/lib/a11y";
import { CABINET_METADATA } from "@/lib/cabinet-metadata";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Онбординг живёт вне кабинета клиента намеренно: навигация по разделам
 * тут только отвлекает — до выбора условий работать всё равно не с чем.
 */
// Установка на экран «Домой» и цифры без автоссылок — см. lib/cabinet-metadata.ts
export const metadata = CABINET_METADATA;

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-muted/30">
      <SkipLink below="var(--cabinet-header-h)" />
      <header className="flex h-14 items-center justify-between border-b bg-background px-4 md:px-6">
        {/* Первый экран, который видит новый клиент, — до этого шапка
            была обычным текстом «Платформа» вместо знака, который есть
            везде вокруг: на входе, в кабинете, на сайте */}
        <Logo variant="lockup" className="h-6" />
        <form action={logout}>
          <SubmitButton variant="ghost" size="sm">
            Выйти
          </SubmitButton>
        </form>
      </header>
      <main {...MAIN_LANDMARK_PROPS} className="mx-auto max-w-4xl p-4 md:p-8">
        {children}
      </main>
    </div>
  );
}
