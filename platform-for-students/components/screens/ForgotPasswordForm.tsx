'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, MailCheck } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { durations, easeOutExpo } from '@/lib/motion';

/**
 * «Забыли пароль».
 *
 * Если такой почты нет в базе, форма так и говорит: человек проверит адрес
 * или зарегистрируется, а не будет ждать письмо, которое не придёт. Но
 * только первые несколько раз с одного адреса — потом сервер отвечает на
 * любую почту одинаково, и на экране то же «если аккаунт есть, письмо
 * ушло». Поэтому текст об успехе не утверждает, что письмо точно отправлено:
 * иначе по нему отличали бы настоящий ответ от нейтрального.
 */
export function ForgotPasswordForm() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setErrorCode(null);
    try {
      const response = await fetch('/api/auth/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        fields?: Record<string, string>;
      };
      if (!response.ok) {
        setError(data.fields?.email ?? data.error ?? 'Не удалось отправить письмо');
        setErrorCode(data.code ?? null);
        return;
      }
      setSent(true);
    } catch {
      toast.error('Сеть недоступна', 'Проверьте соединение и попробуйте ещё раз');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-16">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: durations.slow, ease: easeOutExpo }}
        className="w-full max-w-[26rem]"
      >
        <div className="mb-9 flex justify-center">
          <Logo />
        </div>

        <div className="glass rounded-3xl p-6 sm:p-8">
          <h1 className="text-[20px] font-semibold text-paper">Восстановление пароля</h1>

          {sent ? (
            <div className="mt-4 space-y-3 text-[14px] leading-relaxed text-paper-dim">
              <p className="flex items-start gap-2.5 text-paper">
                <MailCheck className="mt-0.5 size-4 shrink-0 text-yes-glow" aria-hidden />
                Если аккаунт с адресом {email.trim()} есть, мы отправили на него письмо.
              </p>
              <p>
                Ссылка в нём работает час. Письма нет — проверьте папку «Спам» и адрес на опечатки, затем запросите
                ещё раз через минуту.
              </p>
              <p>
                Если письма нет и через несколько минут, проверьте папку «Спам» или{' '}
                <Link href="/help" className="text-paper underline underline-offset-4">
                  напишите в поддержку
                </Link>
                .
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-3">
              <p className="text-[13.5px] leading-relaxed text-paper-dim">
                Укажите почту, с которой регистрировались, — пришлём ссылку, чтобы задать новый пароль.
              </p>
              <TextField
                label="Почта"
                type="email"
                autoComplete="email"
                required
                value={email}
                error={error ?? undefined}
                onChange={(e) => setEmail(e.target.value)}
              />
              {errorCode === 'NO_ACCOUNT' && (
                <p className="text-[13px] leading-relaxed text-paper-dim">
                  Возможно, вы регистрировались с другой почтой. Или{' '}
                  <Link href="/register" className="text-paper underline underline-offset-4">
                    создайте аккаунт
                  </Link>
                  .
                </p>
              )}
              <Button type="submit" size="lg" loading={pending} className="mt-2 w-full" iconRight={<ArrowRight />}>
                Отправить ссылку
              </Button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-[13px] text-paper-faint">
          Вспомнили пароль?{' '}
          <Link href="/login" className="text-paper underline-offset-4 transition-colors hover:underline">
            Войти
          </Link>
        </p>
        <p className="mt-1.5 text-center text-[12.5px] leading-relaxed text-paper-faint">
          Работодатель, который входит по коду из CRM, получает новый код у своего менеджера.
        </p>
      </motion.div>
    </div>
  );
}
