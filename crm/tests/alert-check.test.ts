/**
 * Проверка канала оповещений.
 *
 * Главное здесь не «отправилось», а что проверка не врёт: боевые
 * транспорты глотают отказы, и инструмент, построенный на них, отвечал бы
 * «доставлено» всегда. Поэтому проверяется разбор отказов — и то, что
 * в объяснение не утекает пароль от почты.
 */
import { describe, expect, it } from "vitest";

import {
  describeSmtpError,
  hideCredentials,
  smtpReason,
} from "@/lib/monitoring/alert-check";

describe("пароль от почты не попадает на экран", () => {
  it("прячет логин и пароль из строки подключения", () => {
    const text = hideCredentials(
      "connect ECONNREFUSED smtps://noreply%40example.ru:НЕНАСТОЯЩИЙ_ПАРОЛЬ@mail.hosting.reg.ru:465",
    );
    expect(text).not.toContain("НЕНАСТОЯЩИЙ_ПАРОЛЬ");
    expect(text).toContain("<логин:пароль>");
    // Адрес сервера остаётся — без него причину не понять
    expect(text).toContain("mail.hosting.reg.ru");
  });

  it("работает и внутри разбора ошибки", () => {
    const error = Object.assign(new Error("Invalid login: smtp://u:secret@h"), {
      code: "EAUTH",
    });
    expect(describeSmtpError(error)).not.toContain("secret");
  });
});

describe("почта: отказ объясняется человеку", () => {
  it("неверный пароль называется неверным паролем", () => {
    const error = Object.assign(new Error("Invalid login"), {
      code: "EAUTH",
      response: "535 5.7.8 Error: authentication failed",
    });
    const text = describeSmtpError(error);
    expect(text).toContain("логин или пароль");
    expect(text).toContain("535");
  });

  it("несовпадение порта и шифрования — самая частая причина зависания", () => {
    expect(describeSmtpError({ code: "ESOCKET" })).toContain("порта");
  });

  it("незнакомый код не теряется: показываем как есть", () => {
    expect(describeSmtpError(new Error("что-то своё"))).toContain("что-то своё");
  });
});

/*
  Экран и журнал говорят разное намеренно: человеку нужна причина
  и следующий шаг, а коды ответов и идентификаторы писем выглядят
  поломкой сами по себе — их место в журнале контейнера.
*/
describe("на экране нет технических строк", () => {
  it("причина отказа человеческая, подробности отдельно", () => {
    const error = Object.assign(new Error("Invalid login"), {
      code: "EAUTH",
      response: "535 5.7.8 Error: authentication failed",
    });
    const reason = smtpReason(error);

    expect(reason.human).toBe("Почтовый сервер не принял логин или пароль.");
    expect(reason.human).not.toContain("535");
    expect(reason.human).not.toContain("EAUTH");
    // А в журнал уходит всё, включая ответ сервера
    expect(reason.technical).toContain("535");
  });

  it("незнакомая ошибка не вываливает свой текст на экран", () => {
    const reason = smtpReason(new Error("socket hang up at Object.<anonymous>"));
    expect(reason.human).toBe("Письмо отправить не удалось.");
    expect(reason.technical).toContain("socket hang up");
  });
});
