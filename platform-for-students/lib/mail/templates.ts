/**
 * Тексты писем.
 *
 * Все в одном месте, иначе в письмах заведётся разнобой. Модуль чистый:
 * получает готовые строки и ссылки, в базу не ходит — так тексты
 * проверяются модульными тестами.
 *
 * В письмах нет ни переписки, ни чужих персональных данных: письмо лежит
 * в почтовом ящике вне платформы, и ФИО студента или текст сообщения
 * там не нужны. Письмо говорит, что случилось, и ведёт на сайт.
 */

import { appOrigin, appUrl } from '@/lib/app-url';
import type { ApplicationStatus } from '@/lib/types';

export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

const BRAND = 'Fattakhov HR Agency';
/** Название платформы — как applicationName в app/layout.tsx. */
const PRODUCT = 'Fattakhov Students';

interface Layout {
  subject: string;
  title: string;
  paragraphs: string[];
  /** Крупно, для кода подтверждения */
  code?: string;
  action?: { label: string; url: string };
  footnote?: string;
  /** Строка превью в списке писем, до открытия. Без неё туда попадёт начало тела. */
  preview?: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const AUTO_NOTE = 'Письмо отправлено автоматически, отвечать на него не нужно.';

/*
 * Оформление писем — тёмная тема платформы «Графит» (app/globals.css,
 * блок .dark; её же платформа показывает по умолчанию): чёрное полотно,
 * холодное свечение сверху, тёмная матовая карточка с волосяной рамкой,
 * светлая главная кнопка, единственный цвет — серо-голубой акцент.
 *
 * Цвета — готовые hex, а не rgba поверх фона: настольный Outlook и часть
 * клиентов полупрозрачность не смешивают. Каждый посчитан как роль из
 * globals.css, наложенная на то, на чём она в письме лежит (paper-dim —
 * 62% бумаги поверх карточки и т. д.). Мелкий текст — не paper-faint
 * (3.4:1 к карточке, мало для 12px), а graphite-300 тёмной темы (6:1).
 */
const C = {
  canvas: '#000000', // --color-ink
  auroraTop: '#232e39', // --aurora-top: акцент 42% поверх чёрного
  auroraMid: '#0a0d10', // он же, 12%
  card: '#121416', // --surface-glass-card, середина градиента
  cardTop: '#171a1d',
  cardBottom: '#0b0c0d',
  hairline: '#27292a', // --hairline поверх карточки
  hairlineStrong: '#37393a', // --hairline-strong — верхний блик и рамка поля кода
  codeBg: '#0e0f11', // bg-graphite-950/60, как поле кода на экране подтверждения
  paper: '#f8f8f8', // --color-paper
  paperDim: '#a1a1a2', // --color-paper-dim поверх карточки
  note: '#8d949a', // --color-graphite-300
  accent: '#8da3b9', // --color-accent-300 — надпись над заголовком
  buttonText: '#000000', // кнопка primary: bg-paper text-ink
} as const;

/*
 * Inter с сайта сюда не подключить: Gmail вырезает внешние шрифты, Outlook
 * игнорирует всегда. Системный стек близок по пропорциям. Кавычки вокруг
 * названий — одинарные: строка стоит внутри style="…", и двойная кавычка
 * закрыла бы атрибут (в письмах CRM на этом уже ловились).
 */
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

/** Скрытая строка превью; хвост из &zwnj;&nbsp; не даёт клиенту дописать к ней тело письма. */
function preheader(text: string): string {
  return (
    '<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">' +
    escapeHtml(text) +
    '&zwnj;&nbsp;'.repeat(40) +
    '</div>'
  );
}

/**
 * Кнопка таблицей с закрашенной ячейкой, а не padding на ссылке: так её
 * одинаково рисуют и браузерные клиенты, и Outlook (у него углы будут
 * прямыми — скругление на движке Word не отрисовать).
 */
function button(label: string, url: string): string {
  return (
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
    `<td bgcolor="${C.paper}" style="border-radius:12px;background-color:${C.paper}">` +
    `<a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:14px 28px;border-radius:12px;font-family:${FONT};font-size:15px;line-height:1.2;font-weight:600;color:${C.buttonText};text-decoration:none">${escapeHtml(label)}</a>` +
    '</td></tr></table>'
  );
}

/**
 * Код — как поле ввода на экране подтверждения (ConfirmCodeStep):
 * моноширинный, вразрядку, в скруглённой рамке. Слева отступ больше на
 * величину разрядки: после последней цифры она тоже есть, и без этого
 * код визуально съезжает влево.
 */
function codeBlock(code: string): string {
  return (
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0"><tr>' +
    `<td bgcolor="${C.codeBg}" style="border:1px solid ${C.hairlineStrong};border-radius:16px;background-color:${C.codeBg};padding:16px 22px 16px 34px;font-family:${MONO};font-size:30px;line-height:1;font-weight:600;letter-spacing:12px;color:${C.paper}">${escapeHtml(code)}</td>` +
    '</tr></table>'
  );
}

/**
 * Письмо целиком: текстовая версия и HTML.
 *
 * Разметка таблицами и стили в атрибутах — почтовые клиенты вырезают
 * <style> и не знают ни flex, ни grid. Текстовая версия обязательна:
 * без неё письмо чаще уходит в спам.
 *
 * color-scheme «dark light»: письмо тёмное в любой теме, и Apple Mail
 * с Outlook.com не перекрашивают его сами. Gmail в приложении на iOS
 * всё равно может инвертировать — тогда он меняет и фон, и текст разом,
 * письмо остаётся читаемым. Свечение сверху — фоновым градиентом, его
 * клиенты не инвертируют: шапка с белым знаком остаётся тёмной всегда.
 */
export function renderMail(layout: Layout): MailContent {
  const lines = [layout.title, '', ...layout.paragraphs];
  if (layout.code) lines.push('', `Код: ${layout.code}`);
  if (layout.action) lines.push('', `${layout.action.label}: ${layout.action.url}`);
  if (layout.footnote) lines.push('', layout.footnote);
  lines.push('', '—', BRAND, AUTO_NOTE);

  const p = (text: string, color: string = C.paperDim, size = 15, margin = '0 0 14px') =>
    `<p style="margin:${margin};font-family:${FONT};font-size:${size}px;line-height:1.6;color:${color}">${escapeHtml(text)}</p>`;

  const body =
    `<p style="margin:0 0 14px;font-family:${FONT};font-size:12px;line-height:1.4;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;color:${C.accent}">${PRODUCT}</p>` +
    `<h1 style="margin:0 0 14px;font-family:${FONT};font-size:26px;line-height:1.15;font-weight:600;letter-spacing:-0.5px;color:${C.paper}">${escapeHtml(layout.title)}</h1>` +
    layout.paragraphs.map((text) => p(text)).join('') +
    (layout.code ? codeBlock(layout.code) : '') +
    (layout.action
      ? `<div style="margin:22px 0 0">${button(layout.action.label, layout.action.url)}</div>` +
        // Перенос «где угодно» — только у самой ссылки: на всём абзаце он рвал бы и русские слова
        `<p style="margin:16px 0 0;font-family:${FONT};font-size:12.5px;line-height:1.6;color:${C.note}">Если кнопка не открывается, скопируйте ссылку:<br><a href="${escapeHtml(layout.action.url)}" style="color:${C.note};text-decoration:underline;word-break:break-all">${escapeHtml(layout.action.url)}</a></p>`
      : '') +
    (layout.footnote ? p(layout.footnote, C.note, 12.5, '18px 0 0') : '');

  const origin = appOrigin();
  const host = origin.replace(/^https?:\/\//, '');

  const html =
    '<!doctype html><html lang="ru"><head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="color-scheme" content="dark light">' +
    '<meta name="supported-color-schemes" content="dark light">' +
    `<title>${escapeHtml(layout.subject)}</title>` +
    '<!--[if mso]><style>table{border-collapse:collapse}</style><![endif]-->' +
    '</head>' +
    `<body bgcolor="${C.canvas}" style="margin:0;padding:0;background-color:${C.canvas}">` +
    preheader(layout.preview ?? layout.paragraphs[0] ?? layout.title) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.canvas}" style="background-color:${C.canvas}"><tr>` +
    `<td align="center" style="padding:0 12px 32px;background-color:${C.canvas};background-image:linear-gradient(180deg,${C.auroraTop} 0%,${C.auroraMid} 260px,${C.canvas} 420px)">` +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">' +
    // Знак — белый вариант (logo-light.png) для тёмного полотна. Подпись alt
    // видна, если картинки в почте выключены, — поэтому у неё цвет и кегль
    `<tr><td align="center" style="padding:40px 0 28px"><img src="${escapeHtml(appUrl('/brand/logo-light.png'))}" width="140" height="55" alt="${BRAND}" style="display:block;border:0;outline:none;height:auto;font-family:${FONT};font-size:15px;font-weight:600;color:${C.paper}"></td></tr>` +
    `<tr><td bgcolor="${C.card}" style="background-color:${C.card};background-image:linear-gradient(180deg,${C.cardTop},${C.cardBottom});border:1px solid ${C.hairline};border-top-color:${C.hairlineStrong};border-radius:24px;padding:34px 30px 30px">` +
    body +
    '</td></tr>' +
    `<tr><td align="center" style="padding:24px 16px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.note}">` +
    `${BRAND} · ${PRODUCT}<br>${AUTO_NOTE}<br>` +
    `<a href="${escapeHtml(origin)}" style="color:${C.note};text-decoration:underline">${escapeHtml(host)}</a>` +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';

  return { subject: layout.subject, text: lines.join('\n'), html };
}

const REMINDERS_NOTE = 'Напоминания и сводки можно отключить в профиле, в разделе «Вход и согласие».';

/**
 * Обращение из формы «Написать в поддержку» (страница /help).
 *
 * Не через renderMail(): его футер «отвечать не нужно» здесь ровно
 * наоборот — письмо уходит на personal-почту, которую читает человек, и
 * sendMail() ставит replyTo на адрес автора обращения, так что обычный
 * «Ответить» в почтовом клиенте уходит прямо ему.
 */
export function supportMessageMail(input: { fromEmail: string; fromName?: string; body: string }): MailContent {
  const who = input.fromName ? `${input.fromName} (${input.fromEmail})` : input.fromEmail;
  const subject = `Обращение с платформы — ${who}`;
  const text = [`От: ${who}`, '', input.body].join('\n');
  const html =
    '<!doctype html><html lang="ru"><body style="margin:0;padding:0;background:#eef1f4">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4;padding:24px 12px">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;padding:28px 26px;font-family:Arial,Helvetica,sans-serif">' +
    `<tr><td><p style="margin:0 0 18px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#6b7278">${BRAND} · обращение с платформы</p>` +
    `<p style="margin:0 0 14px;font-size:13px;color:#6b7278">От: ${escapeHtml(who)}</p>` +
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#2b2f33;white-space:pre-wrap">${escapeHtml(input.body)}</p>` +
    `<p style="margin:22px 0 0;padding-top:14px;border-top:1px solid #e3e7eb;font-size:12px;line-height:1.5;color:#8a939c">Ответьте на это письмо обычным «Ответить» — уйдёт на почту автора.</p>` +
    '</td></tr></table></td></tr></table></body></html>';
  return { subject, text, html };
}

export function emailCodeMail(input: { code: string; minutes: number }): MailContent {
  return renderMail({
    subject: `Код подтверждения почты: ${input.code}`,
    title: 'Подтвердите почту',
    paragraphs: ['Введите этот код на платформе, чтобы подтвердить адрес.'],
    code: input.code,
    // Срок и «это были не вы» — под кодом, а не над ним: сначала то, ради чего письмо открыли
    footnote: `Код действует ${input.minutes} минут. Если вы не регистрировались, просто удалите письмо.`,
    preview: `Код ${input.code} — действует ${input.minutes} минут`,
  });
}

export function passwordResetMail(input: { url: string; minutes: number }): MailContent {
  return renderMail({
    subject: 'Восстановление пароля',
    title: 'Задайте новый пароль',
    paragraphs: [
      'Кто-то запросил восстановление пароля для этой почты. Если это были вы, откройте ссылку и задайте новый пароль.',
      `Ссылка работает ${input.minutes} минут и только один раз. Если вы ничего не запрашивали, удалите письмо — пароль останется прежним.`,
    ],
    action: { label: 'Задать новый пароль', url: input.url },
  });
}

export function studyApprovedMail(input: { released: number; url: string }): MailContent {
  return renderMail({
    subject: 'Учёба подтверждена',
    title: 'HR-менеджер подтвердил вашу учёбу',
    paragraphs: [
      input.released > 0
        ? `Отклики, которые ждали подтверждения, отправлены работодателям: ${input.released}.`
        : 'Теперь отклики уходят работодателям сразу.',
      'Работодатели видят в вашем профиле отметку «учёба подтверждена».',
    ],
    action: { label: 'Открыть ленту', url: input.url },
  });
}

export function studyRejectedMail(input: { note: string; url: string }): MailContent {
  return renderMail({
    subject: 'Справку об обучении нужно загрузить заново',
    title: 'HR-менеджер не принял справку',
    paragraphs: [`Причина: ${input.note}`, 'Загрузите новую справку в профиле — отклики пока ждут.'],
    action: { label: 'Загрузить справку', url: input.url },
  });
}

export function companyDecisionMail(input: {
  company: string;
  approved: boolean;
  note: string | null;
  url: string;
}): MailContent {
  return input.approved
    ? renderMail({
        subject: 'Компания прошла проверку',
        title: `«${input.company}» проверена агентством`,
        paragraphs: [
          'Страница компании опубликована. Вакансии, которые пройдут проверку, увидят студенты.',
        ],
        action: { label: 'Открыть кабинет', url: input.url },
      })
    : renderMail({
        subject: 'Компанию вернули на доработку',
        title: `«${input.company}»: нужны правки`,
        paragraphs: [
          input.note ? `Причина: ${input.note}` : 'Агентство вернуло страницу компании на доработку.',
          'Поправьте страницу и сохраните — она снова уйдёт на проверку.',
        ],
        action: { label: 'Открыть страницу компании', url: input.url },
      });
}

export function vacancyDecisionMail(input: {
  title: string;
  approved: boolean;
  note: string | null;
  url: string;
}): MailContent {
  return input.approved
    ? renderMail({
        subject: `Вакансия опубликована: ${input.title}`,
        title: 'Вакансия прошла проверку',
        paragraphs: [`«${input.title}» опубликована — студенты видят её в ленте.`],
        action: { label: 'Открыть вакансии', url: input.url },
      })
    : renderMail({
        subject: `Вакансию вернули на доработку: ${input.title}`,
        title: 'Вакансию нужно поправить',
        paragraphs: [
          input.note ? `«${input.title}». Причина: ${input.note}` : `«${input.title}» вернули на доработку.`,
          'Исправьте вакансию и отправьте на проверку снова.',
        ],
        action: { label: 'Открыть вакансии', url: input.url },
      });
}

/** Что сделал работодатель — словами для студента. NEW писем не вызывает. */
const STATUS_LINES: Partial<Record<ApplicationStatus, { subject: string; line: string }>> = {
  VIEWED: { subject: 'Ваш отклик посмотрели', line: 'посмотрела ваш профиль' },
  INVITED: { subject: 'Вас приглашают', line: 'приглашает вас на следующий шаг' },
  INTERVIEW: { subject: 'Собеседование', line: 'назначила собеседование' },
  HIRED: { subject: 'Вас готовы взять на работу', line: 'готова взять вас на работу' },
  REJECTED: { subject: 'Ответ по отклику', line: 'пока не готова продолжить — лента подберёт другие вакансии' },
};

export function hasStatusMail(status: ApplicationStatus): boolean {
  return Boolean(STATUS_LINES[status]);
}

export function applicationStatusMail(input: {
  status: ApplicationStatus;
  company: string;
  title: string;
  url: string;
}): MailContent | null {
  const copy = STATUS_LINES[input.status];
  if (!copy) return null;
  return renderMail({
    subject: `${copy.subject}: ${input.title}`,
    title: copy.subject,
    paragraphs: [`Компания «${input.company}» ${copy.line}. Вакансия: «${input.title}».`],
    action: { label: 'Открыть отклики', url: input.url },
  });
}

export function newApplicationMail(input: { title: string; url: string }): MailContent {
  return renderMail({
    subject: `Новый отклик: ${input.title}`,
    title: 'Новый отклик на вакансию',
    paragraphs: [`На «${input.title}» откликнулся студент с подтверждённой учёбой.`, 'Профиль и контакты — в кабинете.'],
    action: { label: 'Открыть отклики', url: input.url },
  });
}

export function studyDeadlineMail(input: { daysText: string; url: string }): MailContent {
  return renderMail({
    subject: 'Загрузите справку об обучении',
    title: 'Срок загрузки справки подходит к концу',
    paragraphs: [
      `${input.daysText}, чтобы загрузить справку об обучении. Без подтверждённой учёбы отклики не уходят работодателям.`,
      'Справку выдают в деканате или в личном кабинете вуза.',
    ],
    action: { label: 'Загрузить справку', url: input.url },
    footnote: REMINDERS_NOTE,
  });
}

export function pendingExpiryMail(input: { count: number; url: string }): MailContent {
  return renderMail({
    subject: 'Отклики скоро удалятся',
    title: 'Отклики ждут подтверждения учёбы',
    paragraphs: [
      `Откликов, которые удалятся в ближайшие два дня: ${input.count}.`,
      'Подтвердите учёбу — загрузите справку, и отклики уйдут работодателям.',
    ],
    action: { label: 'Открыть отклики', url: input.url },
    footnote: REMINDERS_NOTE,
  });
}

export function messagesDigestMail(input: { count: number; title: string; url: string }): MailContent {
  return renderMail({
    subject: `Новое сообщение: ${input.title}`,
    title: 'Вам написали',
    paragraphs: [`Непрочитанных сообщений в переписке по вакансии «${input.title}»: ${input.count}.`],
    action: { label: 'Открыть сообщения', url: input.url },
    footnote: REMINDERS_NOTE,
  });
}

/** Раз в неделю — про снятую вакансию, которую компания решила сохранить. */
export function closedVacancyReminderMail(input: { title: string; url: string }): MailContent {
  return renderMail({
    subject: `Напоминание: «${input.title}» всё ещё снята`,
    title: 'Снятая вакансия лежит в кабинете',
    paragraphs: [
      `Вакансия «${input.title}» снята с публикации и сохранена в истории — студенты её не видят.`,
      'Если она больше не нужна, удалите её из кабинета — это освободит место в базе.',
    ],
    action: { label: 'Открыть вакансии', url: input.url },
    footnote: REMINDERS_NOTE,
  });
}
