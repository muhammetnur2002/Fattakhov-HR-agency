'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

const COPY = {
  student:
    'Работодатель, которому вы откликнулись, видит «в сети» или когда вы заходили в последний раз. Выключите — он не увидит ничего.',
  company:
    'Студент, с которым идёт переписка, видит «в сети» или когда вы заходили в последний раз. Выключите — он не увидит ничего.',
};

/**
 * «Показывать, что я в сети» — переключатель.
 *
 * Состояние грузится само, как и у напоминаний рядом: ради одного флажка
 * незачем тянуть лишнее поле через серверную отрисовку страницы.
 *
 * Выключение скрывает статус полностью, а не заменяет его на «был(а)
 * недавно»: расплывчатая формулировка всё равно сообщала бы, что человек
 * заходил, и прятаться было бы не от чего.
 */
export function PresenceToggle({
  audience,
  bordered = true,
}: {
  audience: 'student' | 'company';
  bordered?: boolean;
}) {
  const toast = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/account/presence', { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<{ show?: boolean }>) : null))
      .then((data) => {
        if (!cancelled && typeof data?.show === 'boolean') setEnabled(data.show);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    if (enabled === null) return;
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    try {
      const response = await fetch('/api/account/presence', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show: next }),
      });
      if (!response.ok) throw new Error();
      toast.success(
        next ? 'Статус виден собеседникам' : 'Статус скрыт',
        next ? 'Показывается «в сети» и время последнего визита' : 'Собеседники не увидят, когда вы заходили',
      );
    } catch {
      setEnabled(!next);
      toast.error('Не удалось сохранить', 'Попробуйте ещё раз');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn('flex items-start justify-between gap-4', bordered && 'border-t border-[var(--hairline)] pt-4')}>
      <div className="min-w-0">
        <p id={`presence-${audience}`} className="text-[13.5px] text-paper">
          Показывать, что я в сети
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-paper-faint">{COPY[audience]}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled === true}
        aria-labelledby={`presence-${audience}`}
        disabled={enabled === null || saving}
        onClick={() => void toggle()}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50',
          enabled ? 'border-accent-300/60 bg-accent-500' : 'border-[var(--hairline-strong)] bg-paper/10',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'inline-block size-4 rounded-full bg-paper shadow transition-transform',
            enabled ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  );
}
