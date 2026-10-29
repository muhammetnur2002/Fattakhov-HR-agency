import type { Gender, StudentProfileDTO, Weekday } from './types';

type Candidate = Pick<StudentProfileDTO, 'fullName' | 'city' | 'university' | 'speciality' | 'skills' | 'workDays' | 'gender'>;
export function matchesCandidate(student: Candidate, filters: {
  query: string; days: Weekday[]; genders: Gender[]; city: string; university: string;
}) {
  if (filters.days.length && !student.workDays.some((day) => filters.days.includes(day))) return false;
  if (filters.genders.length && !filters.genders.includes(student.gender)) return false;
  if (filters.city && student.city !== filters.city) return false;
  if (filters.university && student.university !== filters.university) return false;
  const text = [student.fullName, student.city, student.university, student.speciality, ...student.skills].join(' ').toLocaleLowerCase('ru');
  return filters.query.trim().toLocaleLowerCase('ru').split(/\s+/).every((word) => text.includes(word));
}
