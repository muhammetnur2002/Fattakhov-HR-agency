'use client';

import { useState } from 'react';
import { Camera, FileText, ImageIcon, Plus, ShieldCheck } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';

const OPTIONS = [
  { icon: FileText, label: 'Файл' },
  { icon: ImageIcon, label: 'Изображение' },
  { icon: Camera, label: 'Камера' },
];

/** Uploads stay unavailable until the server scanning and delivery pipeline is commissioned. */
export function AttachmentMenu() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" aria-label="Добавить вложение" onClick={() => setOpen(true)}
      className="grid size-10 shrink-0 place-items-center rounded-xl text-paper-dim hover:bg-paper/10">
      <Plus className="size-5" />
    </button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Добавить вложение">
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map(({ icon: ItemIcon, label }) => {
          return <button key={label} type="button" disabled aria-describedby="attachment-unavailable"
            className="flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-[var(--hairline)] px-2 py-4 text-caption text-paper-faint disabled:cursor-not-allowed">
            <ItemIcon className="size-6" />{label}
          </button>;
        })}
      </div>
      <p id="attachment-unavailable" className="mt-4 flex gap-2 text-small text-paper-dim">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        Отправка вложений пока недоступна: настраиваем проверку безопасности файлов и изображений.
      </p>
    </Dialog>
  </>;
}
