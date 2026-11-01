'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, MapPin, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SwipeApplication } from './SwipeApplication';
import { Dialog } from '@/components/ui/Dialog';
import { apiErrorMessage } from '@/lib/api-client';
import { Avatar } from '@/components/ui/Avatar';
import { Button, ButtonLink } from '@/components/ui/Button';
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
  const lock = useRef(false);
  const [opened, setOpened] = useState<{ id: string; action: 'cancel' | 'chat' } | null>(null);
  const [chatItem, setChatItem] = useState<SkippedDTO | null>(null);

  async function dismiss(item: SkippedDTO) {
    if (lock.current) return;
    lock.current = true; setPending(item.id);
    try {
      const response = await fetch('/api/skipped', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vacancyId: item.vacancy.id }) });
      if (!response.ok) throw new Error(await apiErrorMessage(response, 'Попробуйте ещё раз'));
      setList((current) => current.filter((i) => i.id !== item.id));
      toast.success('Вакансия удалена из пропущенных', 'В ленте она больше не появится.');
      router.refresh();
    } catch (error) { toast.error('Не удалось удалить вакансию', error instanceof Error ? error.message : 'Попробуйте ещё раз'); }
    finally { lock.current = false; setPending(null); }
  }

  async function applyAndChat() {
    if (!chatItem || lock.current) return;
    lock.current = true; setPending(chatItem.id);
    try {
      const response = await fetch('/api/swipes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vacancyId: chatItem.vacancy.id, direction: 'RIGHT' }) });
      if (!response.ok) throw new Error(await apiErrorMessage(response, 'Попробуйте ещё раз'));
      const data = await response.json();
      setChatItem(null);
      if (data.pending) {
        toast.success('Отклик сохранён', 'Чат появится после подтверждения учёбы, почты и профиля.');
        router.push('/applications');
      } else if (data.applicationId) {
        router.push(`/messages?thread=${encodeURIComponent(data.applicationId)}`);
      }
      router.refresh();
    } catch (error) { toast.error('Не удалось открыть чат', error instanceof Error ? error.message : 'Попробуйте ещё раз'); }
    finally { lock.current = false; setPending(null); }
  }

  async function restore(item: SkippedDTO) {
    if (lock.current) return;
    lock.current = true;
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
      lock.current = false;
      setPending(null);
    }
  }

  if (list.length === 0) {
    return (
      <EmptyState
        title="Ничего не пропущено"
        description="Вакансии, которые вы смахнёте влево, окажутся здесь. Любую можно вернуть в ленту одной кнопкой."
        action={
          <ButtonLink href="/feed" size="lg" iconRight={<ArrowRight />}>
            В ленту вакансий
          </ButtonLink>
        }
      />
    );
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-headline text-paper">Пропущенные</h1>
        <p className="mt-2.5 text-body text-paper-dim">
          {list.length} {plural(list.length, 'вакансия', 'вакансии', 'вакансий')} · любую можно
          вернуть в ленту
        </p>
      </header>

      <motion.div layout className="grid gap-3">
        <AnimatePresence initial={false} mode="popLayout">
          {list.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 80, scale: 0.96 }}
              transition={{ ...springSoft, opacity: { duration: durations.fast, ease: easeOutExpo } }}
              // min-w-0 обязателен: у элемента грида ширина по умолчанию не
              // может стать меньше содержимого, и строка распирает страницу
              // по горизонтали на узком экране
              className="min-w-0"
            >
              <SwipeApplication open={opened?.id === item.id ? opened.action : null} onToggle={(action) => setOpened(action ? { id: item.id, action } : null)} busy={pending === item.id} disabled={pending !== null} onCancel={() => dismiss(item)} onChat={() => setChatItem(item)} deleteLabel="Удалить" deleteDescription="Вакансия исчезнет из пропущенных и больше не появится в ленте. Отклик не отправляется.">
              <div className="surface flex min-w-0 items-center gap-4 rounded-3xl p-4 pr-3 sm:p-5 sm:pr-4">
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
                  <p className="truncate text-caption text-paper-faint">{item.vacancy.company}</p>
                  <h2 className="truncate text-body font-medium text-paper/85">
                    {item.vacancy.title}
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 text-caption text-paper-faint">
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
                disabled={pending !== null}
                aria-label="Вернуть вакансию в ленту"
                onClick={() => void restore(item)}
                className="shrink-0"
              >
                <span className="hidden sm:inline">Вернуть</span>
              </Button>
            </div>
              </SwipeApplication>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      <Dialog open={chatItem !== null} title="Откликнуться и открыть чат?" onClose={() => { if (!pending) setChatItem(null); }}
        footer={<><Button variant="ghost" disabled={pending !== null} onClick={() => setChatItem(null)}>Остаться</Button><Button loading={pending !== null} disabled={pending !== null} onClick={applyAndChat}>Откликнуться и в чат</Button></>}>
        <p className="text-small text-paper-dim">Работодатель получит ваш отклик на «{chatItem?.vacancy.title}» и доступ к профилю. Вакансия переместится из пропущенных в «Мои отклики».</p>
      </Dialog>
      <VacancyDetail vacancy={detail} onClose={() => setDetail(null)} />
    </>
  );
}
