'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import { springSnappy } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Навыки.
 *
 * Подсказки — не украшение: сам студент напишет «умею общаться», а
 * работодатель ищет «Excel». Готовый список выравнивает формулировки,
 * и совпадение по навыкам вообще начинает работать. Своё значение
 * ввести всё равно можно.
 */
const SUGGESTIONS = [
  'Excel',
  'Английский B2',
  'SMM',
  'Копирайтинг',
  'Figma',
  'Python',
  'SQL',
  '1С',
  'Медкнижка',
  'Водительские права',
  'Работа с кассой',
  'Продажи',
  'Монтаж видео',
  'Преподавание',
];

export function SkillsInput({
  value,
  onChange,
  max = 20,
}: {
  value: string[];
  onChange: (skills: string[]) => void;
  max?: number;
}) {
  const [draft, setDraft] = useState('');

  function add(skill: string) {
    const clean = skill.trim().slice(0, 40);
    if (!clean || value.length >= max) return;
    // Регистронезависимо: «excel» и «Excel» — один навык
    if (value.some((s) => s.toLowerCase() === clean.toLowerCase())) return;
    onChange([...value, clean]);
    setDraft('');
  }

  const available = SUGGESTIONS.filter(
    (s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()),
  ).slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--hairline)] bg-graphite-900/55 p-3 transition-colors focus-within:border-accent-400/70">
        <div className="flex flex-wrap gap-1.5">
          <AnimatePresence initial={false}>
            {value.map((skill) => (
              <motion.span
                key={skill}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={springSnappy}
                className="inline-flex items-center gap-1 rounded-full border border-accent-400/45 bg-accent-500/18 py-1 pl-3 pr-1.5 text-[13px] text-paper"
              >
                {skill}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((s) => s !== skill))}
                  aria-label={`Убрать навык ${skill}`}
                  className="rounded-full p-0.5 text-paper/55 transition-colors hover:bg-paper/10 hover:text-paper"
                >
                  <X className="size-3" />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>

          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                add(draft);
              } else if (e.key === 'Backspace' && !draft && value.length) {
                onChange(value.slice(0, -1));
              }
            }}
            placeholder={value.length ? 'Ещё навык…' : 'Например, Excel'}
            aria-label="Добавить навык"
            className="h-8 min-w-[8rem] flex-1 bg-transparent px-1.5 text-[14px] text-paper outline-none placeholder:text-paper/30"
          />
        </div>
      </div>

      {available.length > 0 && value.length < max && (
        <div className="flex flex-wrap gap-1.5">
          {available.map((skill) => (
            <motion.button
              key={skill}
              type="button"
              onClick={() => add(skill)}
              whileTap={{ scale: 0.94 }}
              transition={springSnappy}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border border-[var(--hairline)] bg-graphite-900/40',
                'px-2.5 py-1.5 text-[12.5px] text-paper/55 transition-colors hover:border-paper/25 hover:text-paper',
              )}
            >
              <Plus className="size-3" aria-hidden />
              {skill}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
