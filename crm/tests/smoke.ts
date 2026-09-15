/**
 * Дымовая проверка Этапа 0: БД доступна, данные на месте,
 * мягкое удаление (BR-26) действительно работает.
 *
 * Запуск: npm run smoke
 * Полноценные тесты (vitest + playwright) появятся на Этапе 1.
 */
import { prisma, prismaRaw } from "../lib/db/prisma";

let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}

async function main() {
  // --- Данные на месте ---
  const candidates = await prisma.candidate.count();
  check("кандидатов 25", candidates === 25, String(candidates));

  const vacancies = await prisma.vacancy.count();
  check("вакансий 6", vacancies === 6, String(vacancies));

  const hidden = await prisma.application.count({
    where: { stage: { visibleToClient: false }, presentedAt: null },
  });
  check("скрытых от клиента заявок 12 (BR-3)", hidden === 12, String(hidden));

  const overdue = await prisma.application.findMany({
    where: {
      outcome: "IN_PROGRESS",
      stage: { code: "PRESENTED" },
      stageEnteredAt: { lt: new Date(Date.now() - 72 * 3600 * 1000) },
    },
  });
  check("просрочек решения клиента 3 (BR-9)", overdue.length === 3, String(overdue.length));

  const hired = await prisma.application.findFirst({ where: { outcome: "HIRED" } });
  check(
    "нанятый с активной гарантией (BR-10)",
    !!hired?.guaranteeUntil && hired.guaranteeUntil > new Date(),
  );

  const internal = await prisma.comment.count({ where: { visibility: "INTERNAL" } });
  check("внутренних комментариев 1", internal === 1, String(internal));

  // --- Мягкое удаление (BR-26) ---
  const victim = await prisma.candidate.findFirst({ where: { fullName: "Тимур Валеев" } });
  if (!victim) {
    check("подопытный кандидат найден", false);
  } else {
    await prisma.candidate.delete({ where: { id: victim.id } });

    const stillRaw = await prismaRaw.candidate.findUnique({ where: { id: victim.id } });
    check("delete не удалил строку физически", stillRaw !== null);
    check("delete проставил deletedAt", stillRaw?.deletedAt != null);

    const viaFindMany = await prisma.candidate.findMany({ where: { id: victim.id } });
    check("findMany не отдаёт удалённого", viaFindMany.length === 0);

    const viaFindUnique = await prisma.candidate.findUnique({ where: { id: victim.id } });
    check("findUnique не отдаёт удалённого", viaFindUnique === null);

    const countAfter = await prisma.candidate.count();
    check("count не считает удалённого (24)", countAfter === 24, String(countAfter));

    // возвращаем как было, чтобы smoke можно было гонять повторно
    await prismaRaw.candidate.update({
      where: { id: victim.id },
      data: { deletedAt: null },
    });
    const restored = await prisma.candidate.count();
    check("восстановление через prismaRaw (25)", restored === 25, String(restored));
  }

  // Модель без deletedAt не должна ломаться на фильтре
  const orgs = await prisma.organization.count();
  check("модель без deletedAt работает", orgs === 1, String(orgs));

  console.log(failed === 0 ? "\nВсе проверки прошли." : `\nПровалено проверок: ${failed}`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prismaRaw.$disconnect();
  });
