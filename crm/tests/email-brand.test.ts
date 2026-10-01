/**
 * Фирменные письма (lib/notifications/email-brand.ts): приглашения, сброс
 * пароля, код регистрации, уведомления и письмо первому владельцу.
 *
 * Проверяется то, что ломается незаметно: экранирование (имена и тексты
 * приходят из форм — без него компания с именем `<img onerror=…>`
 * исполнила бы код в почте получателя), ссылка текстом под кнопкой (её
 * копируют, когда почта режет кнопки) и реквизиты оператора в подвале.
 */
import { describe, expect, it } from "vitest";

import { brandedEmail } from "@/lib/notifications/email-brand";
import { OPERATOR_INN, OPERATOR_NAME } from "@/lib/legal/consent-texts";

describe("фирменное письмо", () => {
  it("всё, что пришло из форм, выводится текстом, а не разметкой", () => {
    const html = brandedEmail({
      title: "t",
      preview: "<b>превью</b>",
      heading: "Компания <img src=x onerror=alert(1)>",
      paragraphs: ['Текст с <script>alert(1)</script> и "кавычками"'],
      action: { href: 'https://my.example.test/x?a=1&b="2"', label: "Кнопка <i>" },
    });

    expect(html).not.toMatch(/<script>|<img src=x|<b>превью|<i>/);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a=1&amp;b=&quot;2&quot;");
  });

  it("под кнопкой та же ссылка текстом", () => {
    const href = "https://my.example.test/invite/abc";
    const html = brandedEmail({
      title: "t",
      preview: "p",
      heading: "h",
      action: { href, label: "Принять приглашение" },
    });

    expect(html.match(new RegExp(`href="${href}"`, "g"))).toHaveLength(2);
    expect(html).toContain("Принять приглашение");
    expect(html).toContain("скопируйте ссылку в браузер");
  });

  it("без действия нет ни кнопки, ни подсказки про неё", () => {
    const html = brandedEmail({ title: "t", preview: "p", heading: "h", code: "482917" });

    expect(html).toContain("482917");
    expect(html).not.toContain("скопируйте ссылку");
  });

  it("в подвале реквизиты оператора персональных данных", () => {
    const html = brandedEmail({ title: "t", preview: "p", heading: "h" });

    expect(html).toContain(OPERATOR_NAME);
    expect(html).toContain(OPERATOR_INN);
  });
});
