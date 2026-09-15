import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { CubeMark } from '@/components/brand/CubeMark';
import { Button } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="page-x mx-auto flex h-[var(--header-h)] w-full max-w-6xl items-center">
        <Logo href="/" />
      </header>

      <main className="page-x mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center pb-24 text-center">
        <CubeMark className="h-20 w-20 text-paper/25" />
        <p className="mt-9 text-eyebrow uppercase text-paper-faint">Ошибка 404</p>
        <h1 className="mt-4 text-display-md text-paper">Такой страницы нет</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-paper-dim">
          Возможно, вакансию сняли с публикации или ссылка устарела. Актуальная подборка всегда в
          ленте.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/feed">
            <Button size="lg">В ленту вакансий</Button>
          </Link>
          <Link href="/">
            <Button variant="ghost" size="lg">
              На главную
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
