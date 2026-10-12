/**
 * Двойная отправка: один и тот же текст от одного автора в одно место за несколько
 * секунд — одно сообщение, а не два.
 *
 * Клиент блокирует повторную отправку сам (tests/components/send-guard.test.tsx), но
 * вкладок может быть две, а сеть бывает такой, что браузер повторяет запрос. Поэтому
 * правило есть и на сервере — в lib/services/duplicate-guard.ts, без изменения схемы.
 */
import { afterAll, afterEach, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import { createComment } from "@/lib/services/comments";
import { DUPLICATE_WINDOW_MS } from "@/lib/services/duplicate-guard";
import { sendDirectMessage } from "@/lib/services/messages";

const ORG = "org_fattakhov";
const MARK = "[дубль]";
const APPLICATION = "app_13";

const recruiter: Actor = { id: "usr_rec1", organizationId: ORG, role: "RECRUITER", clientId: null };
const owner: Actor = { id: "usr_owner", organizationId: ORG, role: "OWNER", clientId: null };
const clientAdmin: Actor = {
  id: "usr_cl_admin",
  organizationId: ORG,
  role: "CLIENT_ADMIN",
  clientId: "cl_starfish",
};

async function cleanup() {
  await db.directMessage.deleteMany({ where: { body: { startsWith: MARK } } });
  const ids = (await db.comment.findMany({ where: { body: { startsWith: MARK } }, select: { id: true } })).map(
    (c) => c.id,
  );
  if (ids.length) await db.comment.deleteMany({ where: { id: { in: ids } } });
  // Тело уведомления — текст отправленного, поэтому метка находит только наши
  await db.notification.deleteMany({ where: { body: { contains: MARK } } });
}

afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

const messagesWith = (body: string) => db.directMessage.count({ where: { body } });
const commentsWith = (body: string) => db.comment.count({ where: { body } });

describe("личное сообщение", () => {
  it("тот же текст тому же человеку сразу после первого — одно сообщение", async () => {
    const body = `${MARK} привет`;
    const first = await sendDirectMessage(recruiter, clientAdmin.id, body);
    const second = await sendDirectMessage(recruiter, clientAdmin.id, body);

    expect(second.id).toBe(first.id);
    expect(await messagesWith(body)).toBe(1);
  });

  it("два запроса одновременно (Enter и кнопка в один миг) — тоже одно сообщение", async () => {
    const body = `${MARK} одновременно`;
    const results = await Promise.all([
      sendDirectMessage(recruiter, clientAdmin.id, body),
      sendDirectMessage(recruiter, clientAdmin.id, body),
      sendDirectMessage(recruiter, clientAdmin.id, body),
    ]);

    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await messagesWith(body)).toBe(1);
  });

  it("повтор не плодит уведомлений: получатель уведомлён один раз", async () => {
    const body = `${MARK} уведомление`;
    const count = () =>
      db.notification.count({ where: { userId: clientAdmin.id, body: { contains: body } } });
    const before = await count();

    await sendDirectMessage(recruiter, clientAdmin.id, body);
    await sendDirectMessage(recruiter, clientAdmin.id, body);

    expect((await count()) - before).toBe(1);
  });

  it("другой текст, другой получатель, другой автор — отдельные сообщения", async () => {
    const body = `${MARK} разное`;
    await sendDirectMessage(recruiter, clientAdmin.id, body);
    await sendDirectMessage(recruiter, clientAdmin.id, `${body}!`);
    await sendDirectMessage(recruiter, "usr_cl_hiring1", body);
    await sendDirectMessage(clientAdmin, recruiter.id, body);

    expect(await messagesWith(body)).toBe(3);
    expect(await messagesWith(`${body}!`)).toBe(1);
  });

  it("то же сообщение позже окна — это уже новое сообщение", async () => {
    const body = `${MARK} позже`;
    const first = await sendDirectMessage(recruiter, clientAdmin.id, body);
    await db.directMessage.update({
      where: { id: first.id },
      data: { createdAt: new Date(Date.now() - DUPLICATE_WINDOW_MS - 1_000) },
    });

    const second = await sendDirectMessage(recruiter, clientAdmin.id, body);

    expect(second.id).not.toBe(first.id);
    expect(await messagesWith(body)).toBe(2);
  });
});

describe("комментарий", () => {
  const params = (body: string, extra: Partial<Parameters<typeof createComment>[1]> = {}) => ({
    applicationId: APPLICATION,
    body,
    visibility: "SHARED" as const,
    ...extra,
  });

  it("тот же комментарий в том же месте сразу после первого — один комментарий", async () => {
    const body = `${MARK} ждём ответа`;
    const first = await createComment(recruiter, params(body));
    const second = await createComment(recruiter, params(body));

    expect(second.id).toBe(first.id);
    expect(await commentsWith(body)).toBe(1);
  });

  it("одновременные запросы — один комментарий", async () => {
    const body = `${MARK} гонка`;
    const results = await Promise.all([
      createComment(recruiter, params(body)),
      createComment(recruiter, params(body)),
    ]);

    expect(results[0].id).toBe(results[1].id);
    expect(await commentsWith(body)).toBe(1);
  });

  it("видимость входит в «то же самое»: внутренняя заметка не проглатывает такой же комментарий клиенту", async () => {
    const body = `${MARK} видимость`;
    await createComment(recruiter, params(body, { visibility: "INTERNAL" }));
    await createComment(recruiter, params(body, { visibility: "SHARED" }));

    const rows = await db.comment.findMany({ where: { body }, select: { visibility: true } });
    expect(rows.map((r) => r.visibility).sort()).toEqual(["INTERNAL", "SHARED"]);
  });

  it("другой автор или другая заявка — отдельные комментарии", async () => {
    const body = `${MARK} разные`;
    await createComment(recruiter, params(body));
    await createComment(owner, params(body));
    await createComment(recruiter, { vacancyId: "vac_1", body, visibility: "INTERNAL" });

    expect(await commentsWith(body)).toBe(3);
  });

  it("удалённый секунду назад комментарий не мешает написать новый такой же", async () => {
    const body = `${MARK} удалён`;
    const first = await createComment(recruiter, params(body));
    await db.comment.update({ where: { id: first.id }, data: { deletedAt: new Date() } });

    const second = await createComment(recruiter, params(body));

    expect(second.id).not.toBe(first.id);
  });

  it("повтор не плодит уведомлений о комментарии", async () => {
    const body = `${MARK} уведомления`;
    const count = () => db.notification.count({ where: { body: { contains: body } } });
    const before = await count();

    await createComment(recruiter, params(body));
    const afterFirst = await count();
    await createComment(recruiter, params(body));

    expect(afterFirst).toBeGreaterThan(before); // первый комментарий кого-то уведомил
    expect(await count()).toBe(afterFirst); // повтор — никого
  });
});
