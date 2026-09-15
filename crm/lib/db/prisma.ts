import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Модели с полем `deletedAt`. Только к ним применяется мягкое удаление (BR-26).
 * При добавлении в schema.prisma новой модели с `deletedAt` — дописать сюда,
 * иначе удалённые записи будут возвращаться в выборках.
 */
const SOFT_DELETE_MODELS = new Set([
  "User",
  "Client",
  "Vacancy",
  "Candidate",
  "Application",
  "Comment",
  "Attachment",
]);

/**
 * BR-26: мягкое удаление.
 *
 * В Prisma 7 middleware ($use) убран, поэтому это client extension.
 * Делает две вещи:
 *   1. подмешивает `deletedAt: null` в выборки;
 *   2. превращает delete/deleteMany в проставление `deletedAt`.
 *
 * Осознанное ограничение: `findUnique` перенаправляется в `findFirst`,
 * потому что findUnique не принимает произвольный where. Поведение то же,
 * но составные уникальные ключи нужно передавать как обычные поля.
 *
 * Обойти фильтр (например, чтобы показать удалённое в админке или
 * физически удалить ПДн по BR-35) — через `prismaRaw`.
 */
function withSoftDelete(client: PrismaClient) {
  return client.$extends({
    name: "softDelete",
    query: {
      $allModels: {
        async findFirst({ model, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findFirstOrThrow({ model, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findMany({ model, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async count({ model, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findUnique({ model, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          // findUnique не поддерживает произвольный where — уходим в findFirst
          const client = getClient();
          return (
            client[toDelegate(model)] as unknown as {
              findFirst: (a: unknown) => Promise<unknown>;
            }
          ).findFirst({
            ...args,
            where: { ...args.where, deletedAt: null },
          });
        },
        async delete({ model, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          const client = getClient();
          return (
            client[toDelegate(model)] as unknown as {
              update: (a: unknown) => Promise<unknown>;
            }
          ).update({
            where: args.where,
            data: { deletedAt: new Date() },
          });
        },
        async deleteMany({ model, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          const client = getClient();
          return (
            client[toDelegate(model)] as unknown as {
              updateMany: (a: unknown) => Promise<unknown>;
            }
          ).updateMany({
            where: { ...args.where, deletedAt: null },
            data: { deletedAt: new Date() },
          });
        },
      },
    },
  });
}

/** "Application" -> "application" */
function toDelegate(model: string) {
  return (model.charAt(0).toLowerCase() +
    model.slice(1)) as keyof PrismaClient;
}

const globalForPrisma = globalThis as unknown as {
  prismaRaw?: PrismaClient;
  prisma?: ReturnType<typeof withSoftDelete>;
};

/**
 * Какая база: рабочая или тестовая.
 *
 * Тот же переключатель, что в prisma.config.ts. Держать логику выбора
 * в одном месте обязательно: иначе seed уходит в базу разработки,
 * пока миграции накатываются на тестовую — уже наступали.
 */
function resolveDatabaseUrl(): string | undefined {
  return process.env.USE_TEST_DB === "1"
    ? process.env.DATABASE_URL_TEST
    : process.env.DATABASE_URL;
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prismaRaw) {
    const connectionString = resolveDatabaseUrl();
    if (!connectionString) {
      throw new Error("DATABASE_URL не задан — скопируйте .env.example в .env");
    }
    // Prisma 7 подключается к БД только через driver adapter.
    globalForPrisma.prismaRaw = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
      log:
        process.env.NODE_ENV === "development"
          ? ["warn", "error"]
          : ["error"],
    });
  }
  return globalForPrisma.prismaRaw;
}

/**
 * Клиенты создаются при первом обращении, а не при импорте модуля.
 *
 * Раньше создавались сразу, и сборка приложения падала: Next при
 * сборке импортирует обработчики маршрутов, чтобы прочитать их
 * настройки, а строки подключения к базе на сборочной машине нет
 * и быть не должно. Класть боевые доступы в образ ради сборки -
 * ровно та ошибка, от которой их и прячут.
 *
 * Прокси-обёртка вместо функции-геттера нужна, чтобы не переписывать
 * сотню мест: `prisma.candidate.findMany()` продолжает работать,
 * просто клиент рождается на первом свойстве.
 */
function lazyClient<T extends object>(factory: () => T): T {
  let instance: T | undefined;
  return new Proxy({} as T, {
    get(_t, prop, receiver) {
      instance ??= factory();
      return Reflect.get(instance as object, prop, receiver);
    },
    has(_t, prop) {
      instance ??= factory();
      return Reflect.has(instance as object, prop);
    },
  });
}

/**
 * Клиент без фильтра мягкого удаления.
 * Использовать только осознанно: физическое удаление ПДн (BR-35),
 * восстановление записей, миграции, seed.
 */
export const prismaRaw: PrismaClient = lazyClient(getClient);

/**
 * Клиент с фильтром мягкого удаления. Тип берётся из самой обёртки,
 * а не объявляется PrismaClient: расширение Prisma меняет форму
 * клиента, и приведение к базовому типу спрятало бы это от компилятора.
 */
type SoftDeleteClient = ReturnType<typeof withSoftDelete>;

/** Обычный клиент приложения. По умолчанию использовать этот. */
export const prisma: SoftDeleteClient = lazyClient<SoftDeleteClient>(() => {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const client = withSoftDelete(getClient());
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
});
