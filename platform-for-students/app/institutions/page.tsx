import type { Metadata } from 'next';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { institutionLabel } from '@/lib/institutions';
import { pageMetadata } from '@/lib/seo';
import { listInstitutionsPublic } from '@/lib/services';
import type { InstitutionPublicDTO } from '@/lib/types';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return pageMetadata({
    title: 'Учебные заведения',
    description: 'Вузы, студенты которых ищут на платформе работу, стажировки и проекты.',
    path: '/institutions',
  });
}

/**
 * Справочник учебных заведений.
 *
 * По городам: студент ищет свой вуз там, где учится, а работодатель
 * смотрит, из каких вузов рядом приходят кандидаты. Цифры по вузам — на
 * странице рейтинга и только от пяти студентов с подтверждённой учёбой.
 */
export default async function InstitutionsPage() {
  const institutions = await listInstitutionsPublic();
  const byCity = new Map<string, InstitutionPublicDTO[]>();
  for (const item of institutions) byCity.set(item.city, [...(byCity.get(item.city) ?? []), item]);

  return (
    <div className="min-h-dvh">
      <header className="page-x mx-auto flex h-[var(--header-h)] max-w-3xl items-center justify-between gap-4">
        <Logo />
        <div className="flex items-center gap-4">
          <Link href="/institutions/rating" className="text-small text-paper-faint transition-colors hover:text-paper">
            Рейтинг
          </Link>
          <ButtonLink href="/register" variant="accent" size="sm">
            Регистрация
          </ButtonLink>
        </div>
      </header>

      <main className="page-x mx-auto max-w-3xl pb-24 pt-4">
        <h1 className="text-headline text-paper">Учебные заведения</h1>
        <p className="mt-2.5 max-w-[56ch] text-body leading-relaxed text-paper-dim">
          Выберите свой вуз при регистрации — работодатель увидит, где вы учитесь, а агентство сможет
          подтвердить учёбу.
        </p>

        {institutions.length === 0 ? (
          <p className="mt-10 text-small text-paper-faint">Справочник пока пуст.</p>
        ) : (
          // Города с большим числом вузов — выше: иначе по алфавиту Москва
          // уезжала под Долгопрудный и Казань
          Array.from(byCity.entries())
            .sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b, 'ru'))
            .map(([city, list]) => (
            <section key={city} className="mt-8">
              <SectionTitle className="flex items-center gap-2">
                <MapPin className="size-4 text-paper-faint" aria-hidden />
                {city}
              </SectionTitle>
              <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {list.map((item) => (
                  <li key={item.id} className="min-w-0">
                    <Link
                      href={`/institutions/${item.slug}`}
                      className="glass flex min-w-0 items-center gap-3 rounded-2xl p-4 transition-colors hover:border-paper/25"
                    >
                      <Avatar name={institutionLabel(item)} src={null} size={40} rounded="square" />
                      <span className="min-w-0">
                        <span className="block truncate text-body font-medium text-paper">
                          {institutionLabel(item)}
                        </span>
                        {item.shortName && (
                          <span className="block truncate text-caption text-paper-faint">{item.name}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
