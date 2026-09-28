'use client';

import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField, TextAreaField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { MESSAGE_MAX_LENGTH } from '@/lib/types';

/**
 * «Написать в поддержку» — прямо на /help, а не отдельная страница:
 * человек уже здесь, потому что не нашёл ответ в вопросах выше.
 *
 * Не полноценный чат — письмо на личную почту с replyTo автора
 * (см. lib/support.ts). Поддержку пока разбирает один человек, и
 * ответить на письмо проще, чем открывать отдельную панель ради
 * нескольких сообщений в неделю.
 */
export function SupportForm() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    try {
      const response = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, body }),
      });
      const data = (await response.json()) as { fields?: Record<string, string>; error?: string };
      if (!response.ok) {
        if (data.fields) setErrors(data.fields);
        toast.error(data.error ?? 'Не удалось отправить сообщение');
        return;
      }
      setSent(true);
    } catch {
      toast.error('Сеть недоступна', 'Проверьте соединение и попробуйте ещё раз');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="glass flex items-start gap-3 rounded-2xl px-5 py-4">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-paper/10">
          <Check className="size-4 text-paper" aria-hidden />
        </span>
        <div>
          <p className="text-[15px] font-medium text-paper">Сообщение отправлено</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-paper-dim">
            Ответим на {email} в течение рабочего дня.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="glass space-y-3 rounded-2xl px-5 py-5" noValidate>
      <div>
        <p className="text-[15px] font-medium text-paper">Не нашли ответ?</p>
        <p className="mt-1 text-[13.5px] leading-relaxed text-paper-dim">
          Опишите вопрос — ответим на почту.
        </p>
      </div>

      <TextField
        label="Почта для ответа"
        type="email"
        autoComplete="email"
        value={email}
        error={errors.email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <TextField
        label="Имя (необязательно)"
        autoComplete="name"
        value={name}
        error={errors.name}
        onChange={(e) => setName(e.target.value)}
      />
      <TextAreaField
        label="Сообщение"
        value={body}
        error={errors.body}
        maxCount={MESSAGE_MAX_LENGTH}
        onChange={(e) => setBody(e.target.value)}
      />

      <Button type="submit" loading={submitting} className="w-full" iconRight={<ArrowRight />}>
        Отправить
      </Button>
    </form>
  );
}
