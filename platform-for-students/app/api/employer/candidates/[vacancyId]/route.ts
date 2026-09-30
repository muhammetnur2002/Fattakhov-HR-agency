import { z } from 'zod';
import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { inviteCandidate, listCandidatesForVacancy } from '@/lib/services';
import { assertSameOrigin, requireEmployer } from '@/lib/security/guards';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ vacancyId: string }> };

/** Кандидаты на вакансию — колода для раздела «Кандидаты». */
export async function GET(_request: Request, props: Params) {
  const params = await props.params;
  return handle(async () => {
    const { employer } = await requireEmployer();
    const result = await listCandidatesForVacancy(employer.id, params.vacancyId);
    if (!result) return fail(404, 'Вакансия не найдена', 'NOT_FOUND');
    return ok(result);
  });
}

const inviteSchema = z.object({ studentId: z.string().min(1) });

/** Свайп вправо — пригласить кандидата на эту вакансию. */
export async function POST(request: Request, props: Params) {
  const params = await props.params;
  return handle(async () => {
    assertSameOrigin(request);
    const { employer } = await requireEmployer();
    const { studentId } = inviteSchema.parse(await request.json());

    // Каждое приглашение открывает работодателю контакты студента — массовая рассылка приглашений
    // равна выгрузке базы, поэтому число приглашений в час ограничено
    const limit = await rateLimit('invite', employer.id);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const result = await inviteCandidate(employer.id, params.vacancyId, studentId);
    if (result === 'NOT_FOUND') return fail(404, 'Кандидат или вакансия не найдены', 'NOT_FOUND');
    if (result === 'ALREADY_DECIDED') {
      return ok({ invited: false, reason: 'ALREADY_DECIDED' as const });
    }
    return ok({ invited: true });
  });
}
