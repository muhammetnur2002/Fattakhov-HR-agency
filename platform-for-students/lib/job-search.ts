import type { VacancyDTO, Weekday } from './types';
export interface JobFilters { query: string; city: string; format: string; employment: string; salary: string; period: string; days: Weekday[] }
export function matchesJob(v: VacancyDTO, f: JobFilters) {
  const text = [v.title, v.company, v.city, v.summary, ...v.requirements, ...v.tags].join(' ').toLocaleLowerCase('ru');
  if (!f.query.trim().toLocaleLowerCase('ru').split(/\s+/).every((word) => text.includes(word))) return false;
  if (f.city && v.city !== f.city) return false;
  if (f.format && v.workFormat !== f.format) return false;
  if (f.employment && v.employmentType !== f.employment) return false;
  if (f.days.length && !v.shiftDays.some((day) => f.days.includes(day))) return false;
  const minimum = Number(f.salary);
  if (minimum > 0 && (v.salaryPeriod !== f.period || (v.salaryTo ?? v.salaryFrom ?? 0) < minimum)) return false;
  return true;
}
