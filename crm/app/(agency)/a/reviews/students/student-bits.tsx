import { StatusBadge } from "@/components/ui/status-badge";
import type { PlatformStudentItem } from "@/lib/students-service";

/** «19 лет», «21 год», «22 года» — возраст в подписи. */
export function ageLabel(age: number): string {
  const last = age % 10;
  const tens = age % 100;
  if (tens >= 11 && tens <= 14) return `${age} лет`;
  if (last === 1) return `${age} год`;
  if (last >= 2 && last <= 4) return `${age} года`;
  return `${age} лет`;
}

export const GENDER_LABEL: Record<PlatformStudentItem["gender"], string> = {
  MALE: "муж.",
  FEMALE: "жен.",
  UNSPECIFIED: "",
};

/** Статусы студента: учёба, пауза, трудоустройство. */
export function StudentStatusBadges({ student }: { student: PlatformStudentItem }) {
  return (
    <>
      {student.studyVerified ? (
        <StatusBadge tone="success">Учёба подтверждена</StatusBadge>
      ) : student.studyPending ? (
        <StatusBadge tone="warning">Справка на проверке</StatusBadge>
      ) : (
        <StatusBadge tone="neutral">Учёба не подтверждена</StatusBadge>
      )}
      {student.paused && <StatusBadge tone="neutral">На паузе</StatusBadge>}
      {student.placed && <StatusBadge tone="success">Трудоустроен(а)</StatusBadge>}
    </>
  );
}
