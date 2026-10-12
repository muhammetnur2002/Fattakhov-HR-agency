'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { LegalDocumentView } from '@/components/legal/LegalDocumentView';
import { STUDENT_CONSENT, versionLabel } from '@/lib/legal';

/**
 * «Обновлён текст согласия» — для студентов, давших согласие под прежней редакцией.
 *
 * Не блокирует кабинет: отклики, лента и переписка работают, пока человек не нажал «Принимаю»,
 * плашка просто остаётся на каждом экране (как «подтвердите почту»). Принятие записывает версию,
 * время и IP; повторять его после этого не нужно. Живёт в каркасе (AppShell), а не на странице:
 * иначе новую страницу легко оставить без плашки.
 */
export function ConsentRenewalBanner() {
  const router = useRouter();
  const toast = useToast();
  const [reading, setReading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/students/me/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Версию присылаем ту, что показали: если текст обновился, пока страница была открыта,
        // человек не примет редакцию, которой не видел
        body: JSON.stringify({ version: STUDENT_CONSENT.version }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? 'Не удалось сохранить согласие');
        return;
      }
      setReading(false);
      toast.success('Согласие обновлено', `Редакция от ${versionLabel(STUDENT_CONSENT.version)}`);
      router.refresh();
    } catch {
      setError('Сеть недоступна. Проверьте соединение и попробуйте ещё раз');
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="consent-renewal-title"
      className="mb-6 rounded-2xl border border-accent-500/35 bg-accent-500/[0.08] p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <ScrollText className="mt-0.5 size-5 shrink-0 text-accent-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="consent-renewal-title" className="text-[14px] font-medium text-paper">
            Обновлён текст согласия на обработку персональных данных
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-paper-dim">
            Мы уточнили, какие сведения о вас видят работодатели и когда им открываются контакты. Прочитайте
            новую редакцию от {versionLabel(STUDENT_CONSENT.version)} и подтвердите её. Платформа работает как
            обычно, пока вы не ответили.
          </p>
          {/* На телефоне кнопки друг под другом и во всю ширину: в строку они переносились со сдвигом */}
          <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
            <Button type="button" size="sm" className="w-full sm:w-auto" icon={<Check />} loading={pending} onClick={() => void accept()}>
              Принимаю
            </Button>
            <Button type="button" size="sm" variant="outline" className="w-full sm:w-auto" icon={<ScrollText />} onClick={() => setReading(true)}>
              Прочитать текст
            </Button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-[12.5px] leading-snug text-danger">
              {error}
            </p>
          )}
        </div>
      </div>

      <Dialog
        open={reading}
        title={STUDENT_CONSENT.title}
        onClose={() => setReading(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReading(false)}>
              Закрыть
            </Button>
            <Button variant="accent" icon={<Check />} loading={pending} onClick={() => void accept()}>
              Принимаю
            </Button>
          </>
        }
      >
        <LegalDocumentView doc={STUDENT_CONSENT} headingLevel="h3" />
      </Dialog>
    </section>
  );
}
