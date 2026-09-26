import { studyStatus } from './study';

/**
 * Что ждёт проверки — в том виде, в каком это забирает CRM агентства.
 *
 * Проверяют здесь, в панели HR; CRM показывает очередь сотрудникам
 * и сообщает о новом (lib/students/queue.ts в CRM). Поэтому наружу —
 * только то, по чему видно, что ждёт: название компании, название
 * вакансии, вуз и курс. Имён, телефонов и почты студентов в очереди
 * нет: подробности сотрудник увидит здесь, после входа.
 */

export interface CrmReviewItem {
  kind: 'company' | 'vacancy' | 'study';
  id: string;
  title: string;
  submittedAt: string;
}

interface EmployerRow {
  id: string;
  companyName: string;
  moderationStatus: string;
  createdAt: Date;
}

interface VacancyRow {
  id: string;
  title: string;
  employerId: string;
  submittedAt: Date | null;
  createdAt: Date;
}

interface StudentRow {
  id: string;
  university: string;
  studyYear: number;
  studyVerified: boolean;
  studyDocUrl: string | null;
  studyReviewNote: string | null;
  studyDocAt: Date | null;
  createdAt: Date;
}

const clip = (text: string) => text.trim().slice(0, 200);

export function buildCrmReviewItems(input: {
  employers: EmployerRow[];
  pendingVacancies: VacancyRow[];
  students: StudentRow[];
}): CrmReviewItem[] {
  const companyName = new Map(input.employers.map((e) => [e.id, e.companyName]));
  const items: CrmReviewItem[] = [];

  for (const employer of input.employers) {
    if (employer.moderationStatus !== 'PENDING') continue;
    items.push({
      kind: 'company',
      id: employer.id,
      title: clip(employer.companyName) || 'Компания без названия',
      submittedAt: employer.createdAt.toISOString(),
    });
  }

  for (const vacancy of input.pendingVacancies) {
    const company = companyName.get(vacancy.employerId);
    items.push({
      kind: 'vacancy',
      id: vacancy.id,
      title: clip(company ? `${vacancy.title} · ${company}` : vacancy.title) || 'Вакансия без названия',
      submittedAt: (vacancy.submittedAt ?? vacancy.createdAt).toISOString(),
    });
  }

  for (const student of input.students) {
    if (studyStatus(student) !== 'PENDING') continue;
    const place = student.university.trim() || 'Вуз не указан';
    items.push({
      kind: 'study',
      id: student.id,
      title: clip(student.studyYear ? `${place}, ${student.studyYear} курс` : place),
      submittedAt: (student.studyDocAt ?? student.createdAt).toISOString(),
    });
  }

  return items;
}
