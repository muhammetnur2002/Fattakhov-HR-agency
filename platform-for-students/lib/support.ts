import 'server-only';
import { sendMail } from '@/lib/mail/transport';
import { supportMessageMail } from '@/lib/mail/templates';

/**
 * Куда падают обращения из формы «Написать в поддержку» (/help).
 *
 * Личная почта, не общий ящик: поддержку сейчас разбирает один человек,
 * и письмо с replyTo автора обращения — вся нужная «служба поддержки».
 * Заводить отдельный чат и панель для одного читателя было бы работой
 * ради работы.
 */
export const SUPPORT_EMAIL = 'profattakhovhr@gmail.com';

export async function sendSupportMessage(input: {
  fromEmail: string;
  fromName?: string;
  body: string;
}): Promise<boolean> {
  return sendMail({
    to: SUPPORT_EMAIL,
    replyTo: input.fromEmail,
    ...supportMessageMail(input),
  });
}
