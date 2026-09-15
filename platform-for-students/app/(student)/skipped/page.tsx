import type { Metadata } from 'next';
import { SkippedList } from '@/components/screens/SkippedList';
import { requireStudentPage } from '@/lib/security/guards';
import { listSkipped } from '@/lib/services';

export const metadata: Metadata = { title: 'Пропущенные' };
export const dynamic = 'force-dynamic';

export default async function SkippedPage() {
  const { student } = await requireStudentPage('/skipped');
  return <SkippedList items={await listSkipped(student.id)} />;
}
