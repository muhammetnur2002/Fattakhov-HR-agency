import 'server-only';
import { isIP } from 'node:net';
import { getRedis } from './redis';
import { prisma } from '@/lib/db/prisma-client';

/**
 * Скользящее окно по журналу попыток.
 *
 * Фиксированное окно (INCR + EXPIRE) пропускает двойную квоту на стыке
 * двух окон — для формы входа это ровно та дыра, ради которой лимит и
 * ставился. ZSET с отметками времени такого стыка не имеет.
 */

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Через сколько секунд освободится место */
  retryAfter: number;
}

export interface RateLimitRule {
  /** Сколько попыток разрешено в окне */
  limit: number;
  /** Длина окна в секундах */
  windowSeconds: number;
}

/*
 * Пороги подобраны так, чтобы живой человек их не замечал.
 *
 * Ключ по IP здесь не равен «одному человеку». Аудитория платформы —
 * студенты, а кампус, общежитие и корпоративная сеть выходят наружу
 * через один NAT: за адресом стоит не посетитель, а здание. Поэтому
 * пороги по IP рассчитаны на группу людей, а точечная защита от
 * перебора висит отдельно — на самой учётной записи.
 *
 * Второе: в окно попадают и отклонённые попытки. Человек, трижды
 * ошибшийся в форме регистрации, тратит ту же квоту, что и робот, —
 * значит запас должен быть заметно больше числа опечаток.
 */
export const RATE_LIMITS = {
  /** Перебор одной учётной записи — тот порог, который защищает пароль */
  login: { limit: 8, windowSeconds: 300 },
  /**
   * Тот же вход, но на адрес: рассчитан на общий NAT, а не на человека.
   * Вуз или общежитие выходят в сеть через один адрес, и при массовом входе
   * (пара групп в начале пары) 40 за 5 минут упирались в потолок для честных
   * студентов. 150 всё равно режет перебор паролей с одного адреса: главная
   * защита учётки — лимит `login` выше (8 за 5 минут на аккаунт).
   */
  loginIp: { limit: 150, windowSeconds: 300 },
  register: { limit: 20, windowSeconds: 3600 },
  swipe: { limit: 240, windowSeconds: 60 },
  // Живая переписка: человек печатает быстро, но не 60 реплик в минуту
  message: { limit: 60, windowSeconds: 60 },
  upload: { limit: 20, windowSeconds: 600 },
  employerCode: { limit: 10, windowSeconds: 900 },
  sync: { limit: 6, windowSeconds: 3600 },
  // Письмо с кодом: минутную паузу держит сама логика, лимит — от рассылки по кругу
  emailCode: { limit: 6, windowSeconds: 900 },
  // Ввод кода: пять ошибок гасят код, лимит — от перебора со свежими кодами
  emailVerify: { limit: 30, windowSeconds: 900 },
  // Код для ещё не созданной учётной записи — тот же характер, что у emailVerify
  registerConfirm: { limit: 30, windowSeconds: 900 },
  registerResend: { limit: 6, windowSeconds: 900 },
  // Сброс пароля: на адрес — с запасом на общий NAT, на почту — как у входа
  passwordResetIp: { limit: 20, windowSeconds: 3600 },
  passwordReset: { limit: 5, windowSeconds: 3600 },
  // Вход из CRM: билеты разовые и живут минуту, лимит — от перебора подписи
  crmTicket: { limit: 30, windowSeconds: 900 },
  // Форма поддержки уходит на личную почту одного человека — щедрый лимит
  // защищает не от обычного посетителя, а от рассылки спама через форму
  support: { limit: 5, windowSeconds: 3600 },
  // Письмо с кодом на конкретный адрес: без этого чужую почту можно заваливать письмами,
  // просто раз за разом начиная регистрацию
  registerEmail: { limit: 3, windowSeconds: 3600 },
  // Ввод кода регистрации по адресу: перебор шести цифр не должен зависеть от того, сколько
  // раз атакующий запросил новый токен (счётчик попыток внутри токена он просто обнуляет)
  registerConfirmEmail: { limit: 10, windowSeconds: 900 },
  // «Отправить код ещё раз» при регистрации: письмо уходит на адрес из билета, а билет подписан,
  // но не привязан к человеку — старый билет можно предъявлять снова и снова. Поэтому предел и
  // пауза держатся на сервере и считаются по адресу, а не по метке времени внутри билета
  registerResendEmail: { limit: 3, windowSeconds: 3600 },
  registerResendPause: { limit: 1, windowSeconds: 60 },
  // Честные ответы «такого аккаунта нет» / «вход по коду» при сбросе пароля — только первые три
  // промаха с одного адреса за час, дальше ответ нейтральный (lib/security/reset-hints.ts)
  passwordResetMiss: { limit: 3, windowSeconds: 3600 },
  // Приглашения кандидатов: живой работодатель зовёт десятки, а не сотни в час
  invite: { limit: 60, windowSeconds: 3600 },
  // Подписка на пуш каждый раз шлёт проверочное уведомление на чужую службу: без лимита
  // это способ заставить сервер стучаться куда угодно
  pushSubscribe: { limit: 20, windowSeconds: 3600 },
  // Пульс «я тут» раз в минуту с каждой открытой вкладки. Лимит на учётную
  // запись, а не на адрес: за одним адресом сидит общежитие целиком.
  // Считается только на настоящие записи (не чаще одной в минуту, то есть 60 в час),
  // а тысяча — страховка от сломанного клиента, не рабочий предел
  presence: { limit: 1000, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Лимиты, которым нужен счёт общий для всех экземпляров сервера: защита пароля, кодов, почты и
 * загрузок. Без Redis они считаются в базе. Частые и безобидные (свайпы, реплики чата) остаются
 * в памяти — платить запросом в базу за каждый свайп незачем.
 */
const SHARED_COUNT: ReadonlySet<RateLimitName> = new Set<RateLimitName>([
  'login',
  'loginIp',
  'register',
  'upload',
  'employerCode',
  'emailCode',
  'emailVerify',
  'registerConfirm',
  'registerResend',
  'passwordResetIp',
  'passwordReset',
  'crmTicket',
  'support',
  'registerEmail',
  'registerConfirmEmail',
  'registerResendEmail',
  'registerResendPause',
  'passwordResetMiss',
  'invite',
]);

export type RateLimitName = keyof typeof RATE_LIMITS;

export async function rateLimit(
  name: RateLimitName,
  identifier: string,
): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[name];
  const key = `rl:${name}:${identifier}`;
  const now = Date.now();
  const windowStart = now - rule.windowSeconds * 1000;

  const redis = getRedis();
  if (!redis) {
    if (SHARED_COUNT.has(name) && process.env.DATABASE_URL) {
      const shared = await databaseLimit(key, rule, now, windowStart);
      if (shared) return shared;
    }
    return memoryLimit(key, rule, now, windowStart);
  }

  try {
    const pipeline = redis.multi();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zadd(key, now, `${now}-${Math.random().toString(36).slice(2, 8)}`);
    pipeline.zcard(key);
    pipeline.pexpire(key, rule.windowSeconds * 1000);
    const results = await pipeline.exec();

    const count = Number(results?.[2]?.[1] ?? 0);
    if (count > rule.limit) {
      const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
      const oldestAt = Number(oldest?.[1] ?? now);
      return {
        ok: false,
        remaining: 0,
        retryAfter: Math.max(1, Math.ceil((oldestAt + rule.windowSeconds * 1000 - now) / 1000)),
      };
    }
    return { ok: true, remaining: rule.limit - count, retryAfter: 0 };
  } catch {
    // Недоступный Redis не должен закрывать вход всем пользователям
    return memoryLimit(key, rule, now, windowStart);
  }
}

/**
 * Параметры транзакции счётчика. По умолчанию Prisma ждёт соединения из пула 2 секунды, а
 * при всплеске запросов по одному ключу часть транзакций стоит в очереди за замком и держит
 * соединения: очередь не успевала, транзакции падали с «Unable to start a transaction»,
 * и эти запросы уходили на счёт в памяти — то есть мимо общего предела. Ждать можно дольше:
 * сама транзакция — несколько миллисекунд.
 */
const TX_OPTIONS = { maxWait: 10_000, timeout: 10_000 };

/** Общий счёт в базе. null — база недоступна: тогда работает счёт в памяти, вход не закрываем всем. */
async function databaseLimit(
  key: string,
  rule: RateLimitRule,
  now: number,
  windowStart: number,
): Promise<RateLimitResult | null> {
  try {
    const since = new Date(windowStart);
    // Замок на ключ до подсчёта: без него сорок одновременных запросов каждый видел бы в счёте
    // только уже сохранённые чужие попытки и проходил бы под лимит. С замком запросы по одному
    // ключу идут по очереди, и счёт точный. Замок снимается сам при конце транзакции
    const count = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      await tx.rateLimitHit.deleteMany({ where: { key, at: { lt: since } } });
      await tx.rateLimitHit.create({ data: { key } });
      return tx.rateLimitHit.count({ where: { key, at: { gte: since } } });
    }, TX_OPTIONS);

    // Ключи, к которым больше не возвращаются, чистим изредка и разом: не на каждый запрос
    if (Math.random() < 0.02) {
      void prisma.rateLimitHit.deleteMany({ where: { at: { lt: new Date(now - 86_400_000) } } }).catch(() => undefined);
    }

    if (count > rule.limit) {
      const oldest = await prisma.rateLimitHit.findFirst({
        where: { key, at: { gte: since } },
        orderBy: { at: 'asc' },
        select: { at: true },
      });
      const oldestAt = oldest?.at.getTime() ?? now;
      return {
        ok: false,
        remaining: 0,
        retryAfter: Math.max(1, Math.ceil((oldestAt + rule.windowSeconds * 1000 - now) / 1000)),
      };
    }
    return { ok: true, remaining: rule.limit - count, retryAfter: 0 };
  } catch {
    return null;
  }
}

/**
 * Исчерпан ли лимит — без новой попытки в журнале. Для решений вроде «пора отвечать
 * нейтрально»: сам запрос квоту не тратит. Недоступное хранилище — «не исчерпан».
 */
export async function rateLimitExhausted(name: RateLimitName, identifier: string): Promise<boolean> {
  const rule = RATE_LIMITS[name];
  const key = `rl:${name}:${identifier}`;
  const now = Date.now();
  const windowStart = now - rule.windowSeconds * 1000;

  const redis = getRedis();
  if (!redis) {
    if (SHARED_COUNT.has(name) && process.env.DATABASE_URL) {
      try {
        const count = await prisma.rateLimitHit.count({ where: { key, at: { gte: new Date(windowStart) } } });
        return count >= rule.limit;
      } catch {
        /* база недоступна — смотрим счёт в памяти */
      }
    }
    return (memoryLog.get(key) ?? []).filter((t) => t > windowStart).length >= rule.limit;
  }

  try {
    await redis.zremrangebyscore(key, 0, windowStart);
    return (await redis.zcard(key)) >= rule.limit;
  } catch {
    return (memoryLog.get(key) ?? []).filter((t) => t > windowStart).length >= rule.limit;
  }
}

const memoryLog = new Map<string, number[]>();

function memoryLimit(
  key: string,
  rule: RateLimitRule,
  now: number,
  windowStart: number,
): RateLimitResult {
  const hits = (memoryLog.get(key) ?? []).filter((t) => t > windowStart);
  hits.push(now);
  memoryLog.set(key, hits);

  if (memoryLog.size > 5000) {
    for (const [k, v] of memoryLog) if (!v.some((t) => t > windowStart)) memoryLog.delete(k);
  }

  if (hits.length > rule.limit) {
    const oldest = hits[0] ?? now;
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((oldest + rule.windowSeconds * 1000 - now) / 1000)),
    };
  }
  return { ok: true, remaining: rule.limit - hits.length, retryAfter: 0 };
}

/**
 * Адрес клиента — для лимитов и журнала аудита.
 *
 * На доверии к заголовкам держится весь счёт «попыток с одного адреса», поэтому правило такое:
 *
 *  - `x-vercel-forwarded-for` — только если процесс работает на Vercel (задан `VERCEL`): там его
 *    ставит сама платформа и клиентский запрос не доходит до приложения в обход неё. На нашей ВМ
 *    перед приложением стоит Caddy, он этот заголовок не трогает — любой клиент подставил бы
 *    в него что угодно и обошёл бы все лимиты по адресу (и записал бы чужой адрес в аудит).
 *  - `x-forwarded-for` — дальше. Caddy (infra/Caddyfile.students) не дописывает в него, а
 *    ПЕРЕЗАПИСЫВАЕТ настоящим адресом соединения (`header_up X-Forwarded-For {remote_host}`),
 *    поэтому клиентские значения до приложения не доходят. Порт приложения наружу не торчит —
 *    иначе доверие к этому заголовку теряло бы смысл. Берём первый адрес списка.
 *  - `x-real-ip` — тем же способом ставит Caddy; запасной вариант.
 *  - 127.0.0.1 — запасной: без прокси (локальная разработка) счёт общий на всех.
 *
 * Значение, не похожее на IP-адрес, пропускается: в ключ лимита и журнал не должен попадать мусор.
 */
export function clientIp(headers: Headers): string {
  const candidates = [
    process.env.VERCEL ? headers.get('x-vercel-forwarded-for') : null,
    headers.get('x-forwarded-for'),
    headers.get('x-real-ip'),
  ];
  for (const raw of candidates) {
    const first = raw?.split(',')[0]?.trim();
    if (first && isIP(first) !== 0) return first;
  }
  return '127.0.0.1';
}
