import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { normalizeRuPhone } from "@/lib/auth/phone";
import { prismaRaw } from "@/lib/db/prisma";
import { getSmsTransport } from "@/lib/notifications/sms";

/**
 * Коды из SMS для входа по номеру телефона.
 *
 * Три рубежа против злоупотреблений, и каждый закрывает своё:
 *
 * - частота по адресу (guardRate в действии) — от перебора с одного места;
 * - частота по номеру (здесь, в базе) — от рассылки кодов на чужой номер:
 *   адрес меняется легко, а номер жертвы один, и каждый код — это
 *   платное SMS и звонок телефона в три часа ночи;
 * - попытки у самого кода — от подбора шести цифр: ограничитель по адресу
 *   обходится сменой адреса, счётчик у кода — нет.
 */

export class PhoneCodeError extends Error {}

/** Сколько живёт код. Достаточно, чтобы дождаться SMS и набрать. */
const CODE_TTL_MS = 10 * 60 * 1000;
/**
 * Сколько проверок выдерживает один код — после этого он не принимается вовсе.
 *
 * Считаются все проверки, а не только неверные: одна попытка занимается
 * до сверки (см. checkPhoneCode). Нормальный вход тратит две — форма
 * проверяет код, чтобы назвать точную причину, и тот же код проверяет
 * провайдер Auth.js, — а с включённой 2FA ещё одну. Восемь = пять опечаток
 * и сам вход, как и было; шанс угадать шесть цифр за восемь попыток
 * 8 из миллиона.
 */
const MAX_ATTEMPTS = 8;
/** Кодов на номер: подряд и за сутки. */
const MAX_CODES_PER_10_MIN = 3;
const MAX_CODES_PER_DAY = 10;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET не задан — коды из SMS подписать нечем");
  return value;
}

function hashCode(phone: string, code: string): string {
  return createHmac("sha256", secret()).update(`phone-code:${phone}:${code}`).digest("hex");
}

/**
 * Текст SMS. Одно SMS кириллицей — 70 символов; длиннее — два, и оба
 * платные. Номер телефона и имя человека в текст не кладём: SMS могут
 * показать на заблокированном экране кому угодно.
 */
export function smsText(code: string): string {
  return `Fattakhov HR: код ${code}. Никому его не сообщайте.`;
}

/**
 * Выдать код и отправить SMS.
 *
 * Бросает PhoneCodeError с человеческой причиной: неверный номер,
 * слишком часто, SMS не ушло.
 */
export async function requestPhoneCode(
  rawPhone: string,
  meta: { ip?: string | null; now?: Date } = {},
): Promise<{ phone: string; expiresAt: Date }> {
  const phone = normalizeRuPhone(rawPhone);
  const now = meta.now ?? new Date();

  const [recent, today] = await Promise.all([
    prismaRaw.phoneCode.count({
      where: { phone, createdAt: { gt: new Date(now.getTime() - 10 * 60 * 1000) } },
    }),
    prismaRaw.phoneCode.count({
      where: { phone, createdAt: { gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    }),
  ]);
  if (recent >= MAX_CODES_PER_10_MIN) {
    throw new PhoneCodeError("Кодов на этот номер уже несколько — подождите 10 минут");
  }
  if (today >= MAX_CODES_PER_DAY) {
    throw new PhoneCodeError("На этот номер сегодня больше кодов не отправим — войдите по почте или завтра");
  }

  // Шесть цифр, включая ведущие нули: randomInt, а не Math.random
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);

  await prismaRaw.phoneCode.create({
    data: {
      phone,
      codeHash: hashCode(phone, code),
      expiresAt,
      requestedIp: meta.ip ?? null,
      createdAt: now,
    },
  });

  // Сначала запись, потом SMS: наоборот при сбое базы человек получил бы
  // код, который никогда не подойдёт
  await getSmsTransport().send({ to: phone, text: smsText(code) });

  return { phone, expiresAt };
}

/**
 * Проверить код, НЕ расходуя его.
 *
 * Отдельно от погашения намеренно: после кода может понадобиться второй
 * фактор (у кого он включён), и если бы код гасился сразу, второй ввод
 * — уже с кодом из приложения — упал бы на «код использован».
 *
 * Попытка занимается ДО сверки одним условным UPDATE (`attempts < MAX`)
 * и считается по числу затронутых строк. Прежний порядок — прочитать
 * счётчик, сверить, потом прибавить — под одновременными запросами
 * не держал: все двадцать видели «попыток 0» и все сверяли код.
 * Теперь сверка возможна только у запроса, которому попытка досталась,
 * так что сверок не больше MAX, как бы ни били параллельно. Попытка
 * считается и когда код верный: проверка — это и есть попытка, а после
 * неё человека ждёт погашение, а не новый ввод.
 */
export async function checkPhoneCode(
  rawPhone: string,
  code: string,
  now: Date = new Date(),
): Promise<{ phone: string; codeId: string }> {
  const phone = normalizeRuPhone(rawPhone);

  const current = await prismaRaw.phoneCode.findFirst({
    where: { phone, usedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    select: { id: true, codeHash: true },
  });
  if (!current) {
    throw new PhoneCodeError("Код устарел — запросите новый");
  }

  const reserved = await prismaRaw.phoneCode.updateMany({
    where: { id: current.id, usedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (reserved.count !== 1) {
    // Кода уже нет (погасили) либо попытки кончились — отличаем вторым чтением
    const state = await prismaRaw.phoneCode.findUnique({
      where: { id: current.id },
      select: { usedAt: true },
    });
    if (state?.usedAt) throw new PhoneCodeError("Код устарел — запросите новый");
    throw new PhoneCodeError("Слишком много неверных попыток — запросите новый код");
  }

  const expected = Buffer.from(current.codeHash, "hex");
  const given = Buffer.from(hashCode(phone, code.replace(/\D/g, "")), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new PhoneCodeError("Неверный код");
  }

  return { phone, codeId: current.id };
}

/**
 * Погасить код. Возвращает false, если его уже погасили: два нажатия
 * «Войти» подряд проходят проверку оба, а войти должно ровно одно.
 */
export async function consumePhoneCode(codeId: string): Promise<boolean> {
  const { count } = await prismaRaw.phoneCode.updateMany({
    where: { id: codeId, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1;
}
