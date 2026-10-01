import { escapeHtml } from "./html";
import {
  OPERATOR_ADDRESS,
  OPERATOR_INN,
  OPERATOR_NAME,
  OPERATOR_OGRNIP,
} from "@/lib/legal/consent-texts";
import { EMAIL_DISPLAY, PHONE_DISPLAY, PHONE_HREF } from "@/lib/contacts";
import { appUrl } from "@/lib/urls";

/**
 * Фирменная оболочка для HTML-писем.
 *
 * Цвета — не копия переменных из globals.css: те заданы в oklch,
 * а почтовые клиенты (в первую очередь настольный Outlook) его не
 * понимают вовсе. Ниже — то же самое в sRGB-hex, посчитанное не на
 * глаз и не вручную (ручной перевод oklch → rgb легко ошибается на
 * соседний оттенок), а рендером в настоящем браузере: значение
 * ставилось цветом заливки на canvas, а обратно бралось уже готовым
 * пикселем (`getImageData`). Так это ровно тот цвет, который человек
 * видит на сайте, а не приближение.
 *
 * Шрифт — системный стек, а не Inter с сайта. Сайт подключает Inter
 * через next/font, письмо так не может: Gmail вырезает `<link>` и часть
 * `@font-face` в `<style>`, Outlook игнорирует веб-шрифты всегда. Стек
 * ниже — тот же приём, что у большинства продуктовых писем (Stripe,
 * Linear и т. п.), пропорции близки к Inter, а не гарантированно другой
 * шрифт при сбое загрузки.
 */
const COLOR = {
  pageBg: "#f2f5f7", // --muted
  cardBg: "#ffffff", // --card
  cardBorder: "#e1e4e7", // --border
  foreground: "#161b20", // --foreground
  muted: "#6a7177", // --muted-foreground
  primary: "#323537", // --primary / --brand-graphite
  primaryText: "#f9fafb", // --primary-foreground
} as const;

/*
  Одинарные кавычки вокруг названий с пробелом, а не двойные: строка
  подставляется в HTML-атрибут `style="..."`, который сам в двойных
  кавычках. Ровно на этом и ловилось: браузер читал двойную кавычку
  из "Segoe UI" как конец style — всё, что после неё (включая цвет
  текста кнопки и text-decoration), переставало быть инлайн-стилем
  вовсе и превращалось в мусорные атрибуты тега. Кнопка от этого была
  синей подчёркнутой ссылкой вместо белой надписи на графитовой плашке —
  поймано глазами на рендере, не по чтению кода.
*/
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Скрытый текст превью — то, что почтовый клиент показывает в списке
 * писем рядом с темой, до открытия. Без него туда попадает первая
 * строка видимого тела письма, а лучшее место для нужной фразы этой
 * строке не гарантировано. Хвост из neverending `&zwnj;&nbsp;` не
 * даёт Gmail дотянуть в превью ещё и настоящий текст письма следом.
 */
function preheader(text: string): string {
  const padding = "&zwnj;&nbsp;".repeat(40);
  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(text)}${padding}</div>`;
}

/**
 * Кнопка-ссылка «пуленепробиваемым» способом: таблица с закрашенной
 * ячейкой, а не padding на самой `<a>`. Настольный Outlook (движок
 * Word) считает padding и border-radius на ссылке не всегда одинаково,
 * а на ячейке таблицы — надёжно. Скруглённый угол в нём всё равно
 * не отрисуется (это ограничение Word, не устраняется без VML-фолбэка,
 * который ради одной кнопки того не стоит) — письмо в Outlook получит
 * прямые углы, не сломанную кнопку.
 */
function button(href: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
      <tr>
        <td style="border-radius:8px;background-color:${COLOR.primary};">
          <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${FONT_STACK};font-size:15px;font-weight:600;color:${COLOR.primaryText};text-decoration:none;border-radius:8px;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

/**
 * Обёртка письма: логотип сверху, белая карточка с содержимым, подвал
 * с реквизитами. Одна оболочка на все письма — приглашения, сброс пароля,
 * код регистрации, уведомления; собирает их brandedEmail() ниже.
 *
 * `<meta name="color-scheme">` / `supported-color-schemes` — явный отказ
 * от автоматической тёмной темы. Без них Apple Mail и Outlook.com иногда
 * инвертируют цвета письма сами, а карточка на белом фоне с тёмным
 * текстом от такой инверсии не выигрывает — получается наоборот хуже.
 */
export function emailShell(params: {
  title: string;
  previewText: string;
  bodyHtml: string;
}): string {
  const logoUrl = appUrl("/brand/logo-dark.png");

  return `<!DOCTYPE html>
<html lang="ru" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(params.title)}</title>
<!--[if mso]>
<style type="text/css">
  table { border-collapse: collapse; }
</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${COLOR.pageBg};">
${preheader(params.previewText)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLOR.pageBg};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr>
          <td align="center" style="padding-bottom:28px;">
            <img src="${escapeHtml(logoUrl)}" width="140" height="55" alt="Fattakhov HR Agency" style="display:block;border:0;outline:none;height:auto;" />
          </td>
        </tr>
        <tr>
          <td style="background-color:${COLOR.cardBg};border:1px solid ${COLOR.cardBorder};border-radius:12px;padding:40px 36px;font-family:${FONT_STACK};">
            ${params.bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:28px 12px 0;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:${COLOR.muted};text-align:center;">
            ${escapeHtml(OPERATOR_NAME)} · ИНН ${escapeHtml(OPERATOR_INN)} · ОГРНИП ${escapeHtml(OPERATOR_OGRNIP)}<br />
            ${escapeHtml(OPERATOR_ADDRESS)}<br />
            <a href="${escapeHtml(PHONE_HREF)}" style="color:${COLOR.muted};text-decoration:underline;">${escapeHtml(PHONE_DISPLAY)}</a>
            &nbsp;·&nbsp;
            <a href="mailto:${escapeHtml(EMAIL_DISPLAY)}" style="color:${COLOR.muted};text-decoration:underline;">${escapeHtml(EMAIL_DISPLAY)}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Моноширинный стек для кода — одинарные кавычки по той же причине, что у FONT_STACK. */
const MONO_STACK = "'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

/** Текст абзаца: экранирование и переносы строк как в текстовой версии. */
function textHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, "<br />");
}

export type BrandedEmail = {
  /** Заголовок вкладки при открытии письма в браузере. */
  title: string;
  /** Строка превью в списке писем, до открытия. */
  preview: string;
  heading: string;
  paragraphs?: string[];
  /** Главное действие письма — кнопка и ссылка-запас под ней. */
  action?: { href: string; label: string };
  /** Крупный код подтверждения. */
  code?: string;
  /** Мелкий текст внизу карточки: срок ссылки, «если это были не вы». */
  note?: string;
};

/**
 * Письмо целиком из смысловых частей.
 *
 * Под кнопкой всегда та же ссылка текстом: корпоративная почта и часть
 * приложений режут кнопки-таблицы или не дают по ним нажать, и тогда
 * человеку остаётся только скопировать адрес. Текстовая версия письма
 * (`text`) отправляется рядом и остаётся главной для клиентов без HTML.
 */
export function brandedEmail(email: BrandedEmail): string {
  const parts: string[] = [
    `<h1 style="margin:0 0 20px;font-family:${FONT_STACK};font-size:22px;line-height:1.3;font-weight:700;color:${COLOR.foreground};">${escapeHtml(email.heading)}</h1>`,
  ];
  for (const paragraph of email.paragraphs ?? []) {
    parts.push(
      `<p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:15px;line-height:1.65;color:${COLOR.foreground};">${textHtml(paragraph)}</p>`,
    );
  }
  if (email.code) {
    parts.push(
      `<div style="margin:8px 0 24px;padding:18px 12px;border-radius:8px;background-color:${COLOR.pageBg};font-family:${MONO_STACK};font-size:30px;line-height:1;font-weight:700;letter-spacing:8px;text-align:center;color:${COLOR.foreground};">${escapeHtml(email.code)}</div>`,
    );
  }
  if (email.action) {
    parts.push(`<div style="margin:28px 0 0;">${button(email.action.href, email.action.label)}</div>`);
    parts.push(
      `<p style="margin:20px 0 0;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:${COLOR.muted};text-align:center;word-break:break-all;">Если кнопка не открывается, скопируйте ссылку в браузер:<br /><a href="${escapeHtml(email.action.href)}" style="color:${COLOR.muted};text-decoration:underline;">${escapeHtml(email.action.href)}</a></p>`,
    );
  }
  if (email.note) {
    parts.push(
      `<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid ${COLOR.cardBorder};font-family:${FONT_STACK};font-size:13px;line-height:1.6;color:${COLOR.muted};">${textHtml(email.note)}</p>`,
    );
  }
  return emailShell({ title: email.title, previewText: email.preview, bodyHtml: parts.join("\n") });
}

export { button, COLOR, FONT_STACK };
