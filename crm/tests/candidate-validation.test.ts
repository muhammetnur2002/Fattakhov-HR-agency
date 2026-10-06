/**
 * Разбор формы отказа (BR-11).
 *
 * Тесты здесь не про то, что неверные данные отклоняются, — это и так
 * было верно, — а про то, что видит человек, когда ошибся. Причина
 * отказа выбирается в `select`, незаполненный `select` присылает пустую
 * строку, и zod по умолчанию отвечает на неё перечнем допустимых
 * значений: внутренними кодами латиницей. Действие показывает первое
 * сообщение разбора дословно, так что этот перечень рекрутер однажды
 * увидел на экране целиком вместо просьбы выбрать причину.
 */
import { describe, expect, it } from "vitest";

import { REJECTION_REASONS_BY_SIDE, REJECTION_SIDE_LABELS } from "@/lib/labels";
import { rejectSchema } from "@/lib/validation/candidate";

/** Первое сообщение разбора — ровно то, что попадает человеку на экран. */
function firstError(data: unknown): string | null {
  const result = rejectSchema.safeParse(data);
  return result.success ? null : (result.error.issues[0]?.message ?? null);
}

describe("что показывается человеку", () => {
  it("причина не выбрана — просьба выбрать", () => {
    expect(firstError({ rejectedBy: "CLIENT", rejectionReason: "" })).toBe(
      "Выберите причину отказа",
    );
  });

  it("сторона не указана — тоже понятной фразой", () => {
    expect(
      firstError({ rejectedBy: "", rejectionReason: "SKILLS_MISMATCH" }),
    ).toBe("Укажите, кто отказал");
  });

  /*
    Главное в этом файле. Коды причин — внутреннее устройство: они ничего
    не говорят рекрутеру, а в перечне их семнадцать штук, и он занимал
    три строки красным.
  */
  it("ни в одном отказе наружу не выходят внутренние коды", () => {
    const плохиеЗначения = ["", "ЧТО-ТО", "skills_mismatch", "NOT_A_REASON"];

    for (const rejectionReason of плохиеЗначения) {
      const message = firstError({ rejectedBy: "CLIENT", rejectionReason });
      expect(message).toBeTruthy();
      expect(message).not.toMatch(/[A-Z]{3,}_[A-Z]{3,}/);
      expect(message).not.toMatch(/Invalid option/);
    }
  });

  it("код не из списка — отдельный текст: «выберите» тут сбивало бы с толку", () => {
    expect(
      firstError({ rejectedBy: "CLIENT", rejectionReason: "NOT_A_REASON" }),
    ).toBe("Такой причины нет в списке — выберите одну из предложенных");
  });

  it("«Другое» без пояснения по-прежнему не проходит (BR-11)", () => {
    expect(
      firstError({
        rejectedBy: "CLIENT",
        rejectionReason: "OTHER",
        rejectionComment: "",
      }),
    ).toBe("Для причины «Другое» напишите, что именно не подошло");
  });
});

describe("заполненный отказ", () => {
  it("проходит, пустой комментарий становится пустотой, а не строкой", () => {
    const result = rejectSchema.safeParse({
      rejectedBy: "CLIENT",
      rejectionReason: "SKILLS_MISMATCH",
      rejectionComment: "",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.rejectionComment).toBeUndefined();
  });

  /*
    Список причин объявлен дважды: на экране (REJECTION_REASONS_BY_SIDE)
    и в схеме. Разъехаться они могут молча — и тогда выбранная причина
    даст ту же ошибку, что и невыбранная, то есть ровно тот баг, ради
    которого написан этот файл.
  */
  it("каждая причина, предложенная на экране, проходит разбор", () => {
    for (const side of Object.keys(REJECTION_SIDE_LABELS)) {
      for (const reason of REJECTION_REASONS_BY_SIDE[
        side as keyof typeof REJECTION_REASONS_BY_SIDE
      ]) {
        const result = rejectSchema.safeParse({
          rejectedBy: side,
          rejectionReason: reason,
          // «Другое» требует пояснения — проверяется отдельно выше
          rejectionComment: reason === "OTHER" ? "поясняю" : "",
        });

        expect(
          result.success,
          `${side} / ${reason}: ${result.success ? "" : result.error.issues[0]?.message}`,
        ).toBe(true);
      }
    }
  });
});
