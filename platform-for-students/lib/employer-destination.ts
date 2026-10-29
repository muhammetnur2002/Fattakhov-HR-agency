/** Keep the existing CRM destinations except for the platform-owned company profile. */
export function employerDestination(next: string, crmClientId: string | null, agency: string | null): string | null {
  if (next === '/employer/company') return null;
  if (!agency) return null;
  if (!crmClientId) return `${agency}/login`;
  if (next.startsWith('/employer/messages')) return `${agency}/students/messages`;
  if (next.startsWith('/employer/candidates')) return `${agency}/students/candidates`;
  if (next.startsWith('/employer/vacancies')) return `${agency}/students`;
  return `${agency}/students/applications`;
}
