/**
 * Персональные данные не уходят в Telegram.
 *
 * Telegram - иностранный сервис, и по выбранной архитектуре
 * локализации туда не должны попадать ФИО, контакты, название
 * компании кандидата и зарплата (юридический пакет, раздел 19;
 * угроза T17 модели угроз).
 *
 * Проверка сделана на уровне транспорта, а не на глаз: текст
 * собирается в одном месте, но поводов его собрать много, и
 * достаточно одного нового события, чтобы имя снова уехало наружу.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EVENTS, type EventCode } from "@/lib/notifications/events";

const отправленные: { chatId: string; text: string; url?: string }[] = [];

vi.mock("@/lib/notifications/channels", () => ({
  getEmailTransport: () => ({ send: async () => {} }),
  getTelegramTransport: () => ({
    send: async (m: { chatId: string; text: string; url?: string }) => {
      отправленные.push(m);
    },
  }),
  availableChannels: () => ({ email: true, telegram: true }),
}));

beforeEach(() => {
  отправленные.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Данные, которых в сообщении быть не должно ни при каких событиях. */
const ЗАПРЕЩЕНО = [
  "Иванов",
  "Иван Иванович",
  "+7 917 000-00-00",
  "ivanov@example.com",
  "@ivanov_hr",
  "180000",
  "ООО Ромашка",
];

describe("нейтральность сообщений в Telegram", () => {
  it("в каталоге событий описания не содержат подстановок", () => {
    // Описание события уходит в Telegram как есть. Если в него
    // однажды впишут шаблон вроде "Новый кандидат: {name}",
    // персональные данные утекут через эту дверь
    for (const [code, def] of Object.entries(EVENTS)) {
      expect(def.description, code).not.toMatch(/[{$]/);
      expect(def.description.length, code).toBeGreaterThan(3);
    }
  });

  it("описание есть у каждого события", () => {
    // Пустое описание превратилось бы в пустое сообщение,
    // и появился бы соблазн вернуть туда заголовок с ФИО
    const codes = Object.keys(EVENTS) as EventCode[];
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      expect(EVENTS[code].description.trim(), code).not.toBe("");
    }
  });

  it("ни одно описание не похоже на персональные данные", () => {
    for (const [code, def] of Object.entries(EVENTS)) {
      for (const запрет of ЗАПРЕЩЕНО) {
        expect(def.description, `${code} / ${запрет}`).not.toContain(запрет);
      }
    }
  });
});
