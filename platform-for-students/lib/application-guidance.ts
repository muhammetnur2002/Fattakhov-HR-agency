import type { ApplicationStatus } from './types';

/** Student-facing next step. A workflow stage is not an unread notification. */
export const APPLICATION_GUIDANCE: Record<ApplicationStatus, string> = {
  NEW: 'Отклик доставлен. Дождитесь просмотра работодателем.',
  VIEWED: 'Работодатель просмотрел отклик. Дождитесь решения или уточните детали в чате.',
  INVITED: 'Вас пригласили. Откройте чат, чтобы согласовать следующий шаг.',
  INTERVIEW: 'Согласуйте в чате время, место или ссылку на собеседование.',
  HIRED: 'Уточните в чате дату выхода и условия первой смены.',
  REJECTED: 'По этому отклику получен отказ. Можно продолжить поиск других вакансий.',
};
