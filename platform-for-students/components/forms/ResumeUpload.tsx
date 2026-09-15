'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText, Loader2, Upload, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { durations, easeOutExpo, springSoft } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Загрузка резюме.
 *
 * Файл необязателен: у большинства студентов резюме нет, и требовать
 * его — значит потерять их на предпоследнем шаге. Профиль без резюме
 * работодатель всё равно увидит.
 */
export function ResumeUpload({
  value,
  fileName,
  onChange,
}: {
  value: string | null;
  fileName: string | null;
  onChange: (file: { url: string; name: string } | null) => void;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('kind', 'resume');
      body.append('file', file);
      const response = await fetch('/api/upload', { method: 'POST', body });
      const data = (await response.json()) as { url?: string; name?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? 'Не удалось загрузить');
      onChange({ url: data.url, name: data.name ?? file.name });
    } catch (error) {
      toast.error('Резюме не загрузилось', error instanceof Error ? error.message : undefined);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <AnimatePresence mode="wait" initial={false}>
        {value ? (
          <motion.div
            key="file"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: durations.fast, ease: easeOutExpo }}
            className="flex items-center gap-3 rounded-2xl border border-accent-500/30 bg-accent-500/[0.08] p-4"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-500/20 text-accent-200">
              <FileText className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-paper">{fileName ?? 'Резюме'}</p>
              <p className="text-[12px] text-paper-faint">Загружено</p>
            </div>
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label="Удалить резюме"
              className="rounded-lg p-2 text-paper-faint transition-colors hover:bg-paper/[0.06] hover:text-paper"
            >
              <X className="size-4" />
            </button>
          </motion.div>
        ) : (
          <motion.button
            key="empty"
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) void upload(file);
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, scale: dragOver ? 1.015 : 1 }}
            exit={{ opacity: 0 }}
            transition={springSoft}
            className={cn(
              'flex w-full items-center gap-3 rounded-2xl border-2 border-dashed p-4 text-left transition-colors duration-300',
              dragOver
                ? 'border-accent-400 bg-accent-500/10'
                : 'border-paper/15 bg-graphite-900/40 hover:border-paper/28',
            )}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper/[0.06] text-paper/50">
              {uploading ? <Loader2 className="size-4.5 animate-spin" /> : <Upload className="size-4.5" />}
            </span>
            <div>
              <p className="text-[14px] font-medium text-paper/85">
                {uploading ? 'Загружаем…' : 'Прикрепить резюме'}
              </p>
              <p className="text-[12px] text-paper-faint">PDF или DOC/DOCX до 8 МБ · необязательно</p>
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
