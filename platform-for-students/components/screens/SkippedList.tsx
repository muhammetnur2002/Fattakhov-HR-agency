'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, MapPin, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { VacancyDetail } from '@/components/swipe/VacancyDetail';
import { springSoft, durations, easeOutExpo } from '@/lib/motion';
import { formatSalary, plural, timeAgo } from '@/lib/utils';
import type { SkippedDTO, VacancyDTO } from '@/lib/types';

/**
 * Пропущенные.
 *
 * Раздел существует ради одной кнопки — «вернуть в ленту». Свайп влево
 * должен быть дешёвым решением: если его нельзя отменить, студент
 * начинает раздумывать над каждой карточкой, и лента перестаёт работать.
 */
export function SkippedList({ items }: { items: SkippedDTO[] }) {
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState(items);
  const [detail, setDetail] = useState<VacancyDTO | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function restore(item: SkippedDTO) {
    setPending(item.id);
    // Убираем сразу: карточка уезжает, пока летит запрос
    setList((current) => current.filter((i) => i.id !== item.id));

    try {
      const response = await fetch('/api/swipes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vacancyId: item.vacancy.id }),
      });
      if (!response.ok) throw new Error();
      toast.success('Вакансия вернулась в ленту', item.vacancy.title);
      router.refresh();
    } catch {
      setList((current) => [item, ...current]);
      toast.error('Не удалось вернуть вакансию', 'Попробуйте ещё раз');
    } finally {
      setPending(null);
    }
  }

  if (list.length === 0) {
    return (
      <EmptyState
        title="Ничего не пропущено"
        description="Вакансии, которые вы смахнёте влево, окажутся здесь. Любую можно вернуть в ленту одной кнопкой."
        action={
          <Link href="/feed">
            <Button size="lg" iconRight={<ArrowRight />}>
              В ленту вакансий
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-display-md text-paper">Пропущенные</h1>
        <p className="mt-2.5 text-[14.5px] text-paper-dim">
          {list.length} {plural(list.length, 'вакансия', 'вакансии', 'вакансий')} · любую можно
          вернуть в ленту
        </p>
      </header>

      <motion.div layout className="grid gap-3">
        <AnimatePresence initial={false} mode="popLayout">
          {list.map((item) => (
            <motion.article
              key={item.id}
              layout
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 80, scale: 0.96 }}
              transition={{ ...springSoft, opacity: { duration: durations.fast, ease: easeOutExpo } }}
              // min-w-0 обязателен: у элемента грида ширина по умолчанию не
              // может стать меньше содержимого, и строка распирает страницу
              // по горизонтали на узком экране
              className="surface flex min-w-0 items-center gap-4 rounded-3xl p-4 pr-3 sm:p-5 sm:pr-4"
            >
              <button
                type="button"
                onClick={() => setDetail(item.vacancy)}
                className="flex min-w-0 flex-1 items-center gap-4 text-left"
              >
                <Avatar
                  name={item.vacancy.company}
                  src={item.vacancy.companyLogoUrl}
                  size={44}
                  rounded="square"
                  className="opacity-65"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] text-paper-faint">{item.vacancy.company}</p>
                  <h2 className="truncate text-[15.5px] font-medium text-paper/85">
                    {item.vacancy.title}
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[12.5px] text-paper-faint">
                    <span>{formatSalary(item.vacancy.salaryFrom, item.vacancy.salaryTo)}</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3" aria-hidden />
                      {item.vacancy.city}
                    </span>
                    <span className="hidden sm:inline">пропущена {timeAgo(item.createdAt)}</span>
                  </p>
                </div>
              </button>

              <Button
                variant="outline"
                size="sm"
                icon={<Undo2 />}
                loading={pending === item.id}
                onClick={() => void restore(item)}
                className="shrink-0"
              >
                <span className="hidden sm:inline">Вернуть</span>
              </Button>
            </motion.article>
          ))}
        </AnimatePresence>
      </motion.div>

      <VacancyDetail vacancy={detail} onClose={() => setDetail(null)} />
    </>
  );
}
