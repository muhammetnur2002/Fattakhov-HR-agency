import { logout } from "@/app/actions/auth";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

/**
 * Онбординг живёт вне кабинета клиента намеренно: навигация по разделам
 * тут только отвлекает — до выбора условий работать всё равно не с чем.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-muted/30">
      <header className="flex h-14 items-center justify-between border-b bg-background px-4 md:px-6">
        {/* Первый экран, который видит новый клиент, — до этого шапка
            была обычным текстом «Платформа» вместо знака, который есть
            везде вокруг: на входе, в кабинете, на сайте */}
        <Logo variant="lockup" className="h-6" />
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">
            Выйти
          </Button>
        </form>
      </header>
      <main className="mx-auto max-w-4xl p-4 md:p-8">{children}</main>
    </div>
  );
}
