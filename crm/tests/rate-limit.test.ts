/**
 * Ограничение частоты (BR-29).
 *
 * Защита от перебора пароля на форме входа и токенов в публичных
 * ссылках. Проверяется на чистых функциях: тайминги и счётчики —
 * ровно то место, где легко ошибиться на единицу.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkRateLimit,
  clientIp,
  LIMITS,
  resetRateLimits,
} from "@/lib/security/rate-limit";

afterEach(() => {
  resetRateLimits();
  vi.useRealTimers();
});

describe("счётчик попыток", () => {
  it("пропускает запросы в пределах лимита", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("ключ", 5, 60).allowed, `попытка ${i + 1}`).toBe(
        true,
      );
    }
  });

  it("блокирует за пределом", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("ключ", 5, 60);

    const result = checkRateLimit("ключ", 5, 60);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("разные ключи считаются отдельно", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("первый", 5, 60);

    // Один заблокированный адрес не должен мешать остальным
    expect(checkRateLimit("второй", 5, 60).allowed).toBe(true);
  });

  it("окно сбрасывается по времени", () => {
    vi.useFakeTimers();

    for (let i = 0; i < 5; i++) checkRateLimit("ключ", 5, 60);
    expect(checkRateLimit("ключ", 5, 60).allowed).toBe(false);

    vi.advanceTimersByTime(61_000);

    expect(checkRateLimit("ключ", 5, 60).allowed).toBe(true);
  });

  it("сообщает, сколько ждать", () => {
    vi.useFakeTimers();

    for (let i = 0; i < 3; i++) checkRateLimit("ключ", 3, 60);
    vi.advanceTimersByTime(20_000);

    const result = checkRateLimit("ключ", 3, 60);
    expect(result.allowed).toBe(false);
    // Осталось около сорока секунд из шестидесяти
    expect(result.retryAfter).toBeGreaterThan(35);
    expect(result.retryAfter).toBeLessThanOrEqual(40);
  });

  it("лимит в единицу пропускает ровно один запрос", () => {
    expect(checkRateLimit("ключ", 1, 60).allowed).toBe(true);
    expect(checkRateLimit("ключ", 1, 60).allowed).toBe(false);
  });
});

describe("адрес клиента", () => {
  it("берёт первый адрес из цепочки прокси", () => {
    // Остальные подставляются промежуточными узлами и подделываются
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2",
    });
    expect(clientIp(headers)).toBe("203.0.113.7");
  });

  it("понимает x-real-ip", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.5" }))).toBe(
      "198.51.100.5",
    );
  });

  it("без заголовков возвращает заглушку, а не падает", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("пробелы в цепочке не ломают разбор", () => {
    const headers = new Headers({ "x-forwarded-for": "  203.0.113.7 ,10.0.0.1" });
    expect(clientIp(headers)).toBe("203.0.113.7");
  });
});

describe("пресеты", () => {
  it("вход ограничен строже, чем просмотр по токену", () => {
    // На форме входа подбирают пароль — там цена ошибки выше
    expect(LIMITS.login.limit).toBeLessThan(LIMITS.publicToken.limit);
  });

  it("все окна заданы в разумных пределах", () => {
    for (const [name, preset] of Object.entries(LIMITS)) {
      expect(preset.limit, name).toBeGreaterThan(0);
      expect(preset.windowSeconds, name).toBeGreaterThan(0);
      expect(preset.windowSeconds, name).toBeLessThanOrEqual(3600);
    }
  });
});
