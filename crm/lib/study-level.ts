/** Уровень обучения студента — значения совпадают с платформой студентов. */
export type StudyLevel = "BACHELOR" | "SPECIALIST" | "MASTER";

const LABEL: Record<StudyLevel, string> = {
  BACHELOR: "Бакалавриат",
  SPECIALIST: "Специалитет",
  MASTER: "Магистратура",
};

/** «Бакалавриат, 3 курс»; уровень не указан — просто «3 курс». */
export function studyLine(level: string | null | undefined, year: number): string {
  const label = level && level in LABEL ? LABEL[level as StudyLevel] : null;
  return label ? `${label}, ${year} курс` : `${year} курс`;
}
