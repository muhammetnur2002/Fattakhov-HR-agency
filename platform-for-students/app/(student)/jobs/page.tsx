import type { Metadata } from 'next';
import { requireStudentPage } from '@/lib/security/guards';
import { getStore } from '@/lib/db';
import { buildJobCatalogue } from '@/lib/services';
import { JobSearch } from '@/components/screens/JobSearch';
export const metadata: Metadata = { title: 'Поиск работы' };
export const dynamic = 'force-dynamic';
export default async function JobsPage() {
  const { student } = await requireStudentPage('/jobs');
  const store = await getStore();
  const [vacancies, applications, swipes] = await Promise.all([buildJobCatalogue(student.id), store.applications.listByStudent(student.id), store.swipes.listByStudent(student.id, 'RIGHT')]);
  return <JobSearch vacancies={vacancies} appliedIds={Array.from(new Set([...applications.map((a) => a.vacancyId), ...swipes.map((s) => s.vacancyId)]))} />;
}
