import 'server-only';
import { sendMail } from '@/lib/mail/transport';
import { supportMessageMail } from '@/lib/mail/templates';

/**
 * Куда падают обращения из формы «Написать в поддержку» (/help).
 *
 * Общий ящик на домене, а не личная почта: кто читает обращения, решается
 * в панели хостинга (почта support@ → «Слать копии писем на e-mail»), без
 * правок кода и выкладки. Сейчас копии идут владельцу; появится сотрудник —
 * его адрес добавляется в тот же список. Письмо уходит с replyTo автора
 * обращения, так что ответить можно прямо из почты.
 */
export const SUPPORT_EMAIL = 'support@fattakhovhr.ru';

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
