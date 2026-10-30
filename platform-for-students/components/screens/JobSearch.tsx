"use client";
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Filter, Layers, Search } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { TextField, SelectField } from '@/components/ui/Field';
import { Chip, Tag } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { VacancyDetail } from '@/components/swipe/VacancyDetail';
import { apiErrorMessage } from '@/lib/api-client';
import { formatSalary } from '@/lib/utils';
import { matchesJob, type JobFilters } from '@/lib/job-search';
import { WORK_FORMATS, WORK_FORMAT_LABEL, EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABEL, WEEKDAYS, WEEKDAY_LABEL, type VacancyDTO } from '@/lib/types';
const initialFilters: JobFilters = { query: '', city: '', format: '', employment: '', salary: '', period: 'MONTH', days: [] };
const periodLabels = { MONTH: 'в месяц', SHIFT: 'за смену', HOUR: 'в час' };
export function JobSearch({ vacancies, appliedIds }: { vacancies: VacancyDTO[]; appliedIds: string[] }) {
  const [filters, setFilters] = useState(initialFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState('new');
  const [limit, setLimit] = useState(20);
  const [detail, setDetail] = useState<VacancyDTO | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);
  const toast = useToast(); const router = useRouter();
  function update<K extends keyof JobFilters>(key: K, value: JobFilters[K]) { setFilters((prev) => ({ ...prev, [key]: value })); setLimit(20); }
  const found = useMemo(() => vacancies.filter((v) => matchesJob(v, filters)).sort((a, b) => sort === 'match' ? (b.matchScore ?? 0) - (a.matchScore ?? 0) : Date.parse(b.publishedAt) - Date.parse(a.publishedAt)), [vacancies, filters, sort]);
  const applied = new Set([...appliedIds, ...sent]);
  async function apply(v: VacancyDTO) {
    if (lock.current || applied.has(v.id)) return;
    lock.current = true; setBusy(v.id);
    try {
      const response = await fetch('/api/swipes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vacancyId: v.id, direction: 'RIGHT' }) });
      if (!response.ok) throw new Error(await apiErrorMessage(response, 'Попробуйте ещё раз'));
      const data = await response.json();
      setSent((prev) => new Set(prev).add(v.id));
      toast.success(data.pending ? 'Отклик сохранён' : 'Отклик отправлен', 'Посмотреть или отменить его можно в разделе «Отклики».');
      router.refresh();
    } catch (error) { toast.error('Не удалось откликнуться', error instanceof Error ? error.message : 'Проверьте соединение'); }
    finally { lock.current = false; setBusy(null); }
  }
  return <div className="mx-auto w-full max-w-4xl pb-16">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-headline text-paper">Поиск работы</h1><ButtonLink href="/feed" variant="outline" icon={<Layers />}>Свайпы</ButtonLink></div>
    <p className="mt-2 text-small text-paper-dim">Все активные вакансии. Ищите по названию, компании или навыкам.</p>
    <div className="mt-6 flex items-center gap-2"><div className="relative flex-1"><TextField label="Поиск вакансий" value={filters.query} onChange={(e) => update('query', e.target.value)} /><Search className="pointer-events-none absolute right-4 top-5 size-5 text-paper-faint" aria-hidden /></div><Button variant="outline" icon={<Filter />} aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>Фильтры</Button></div>
    {filtersOpen && <div className="glass mt-3 space-y-4 rounded-3xl p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Город" value={filters.city} onChange={(e) => update('city', e.target.value)} options={[{ value: '', label: 'Все города' }, ...Array.from(new Set(vacancies.map((v) => v.city))).sort().map((value) => ({ value, label: value }))]} />
        <SelectField label="Формат работы" value={filters.format} onChange={(e) => update('format', e.target.value)} options={[{ value: '', label: 'Любой формат' }, ...WORK_FORMATS.map((value) => ({ value, label: WORK_FORMAT_LABEL[value] }))]} />
        <SelectField label="Занятость" value={filters.employment} onChange={(e) => update('employment', e.target.value)} options={[{ value: '', label: 'Любая занятость' }, ...EMPLOYMENT_TYPES.map((value) => ({ value, label: EMPLOYMENT_TYPE_LABEL[value] }))]} />
        <TextField label="Доход от, ₽" type="number" min="0" value={filters.salary} onChange={(e) => update('salary', e.target.value)} />
        <SelectField label="Период оплаты для фильтра дохода" value={filters.period} onChange={(e) => update('period', e.target.value)} options={Object.entries(periodLabels).map(([value, label]) => ({ value, label }))} />
      </div>
      <div><p className="mb-2 text-small text-paper-dim">Дни работы — хотя бы один из выбранных</p><div className="flex flex-wrap gap-2">{WEEKDAYS.map((day) => <Chip key={day} selected={filters.days.includes(day)} onToggle={() => update('days', filters.days.includes(day) ? filters.days.filter((d) => d !== day) : [...filters.days, day])}>{WEEKDAY_LABEL[day]}</Chip>)}</div></div>
      <Button variant="ghost" size="sm" onClick={() => { setFilters(initialFilters); setLimit(20); }}>Сбросить поиск и фильтры</Button>
    </div>}
    <div className="my-5 flex flex-wrap items-center justify-between gap-3"><p className="text-small text-paper-dim" aria-live="polite">Найдено вакансий: {found.length}</p><div className="w-64"><SelectField label="Сортировка" value={sort} onChange={(e) => setSort(e.target.value)} options={[{ value: 'new', label: 'Сначала новые' }, { value: 'match', label: 'По совпадению с профилем' }]} /></div></div>
    {found.length === 0 && <EmptyState title="Вакансии не найдены" description="Измените запрос или сбросьте фильтры." action={<Button onClick={() => setFilters(initialFilters)}>Сбросить</Button>} />}
    <div className="space-y-4">{found.slice(0, limit).map((v) => <article key={v.id} className="glass-card rounded-3xl p-5 sm:p-6">
      <button className="text-left" onClick={() => setDetail(v)}><h2 className="text-title text-paper">{v.title}</h2><p className="mt-2 text-body text-accent-200">{formatSalary(v.salaryFrom, v.salaryTo)} <span className="text-small text-paper-dim">{periodLabels[v.salaryPeriod]}</span></p><p className="mt-1 text-small text-paper-dim">{v.company} · {v.city}</p></button>
      <p className="my-4 text-small leading-relaxed text-paper-dim">{v.summary}</p><div className="mb-4 flex flex-wrap gap-2"><Tag>{WORK_FORMAT_LABEL[v.workFormat]}</Tag><Tag>{EMPLOYMENT_TYPE_LABEL[v.employmentType]}</Tag>{v.tags.slice(0, 4).map((tag) => <Tag key={tag}>{tag}</Tag>)}</div>
      <div className="flex flex-wrap gap-3"><Button onClick={() => apply(v)} loading={busy === v.id} disabled={busy !== null || applied.has(v.id)}>{applied.has(v.id) ? 'Отклик уже есть' : 'Откликнуться'}</Button><Button variant="outline" onClick={() => setDetail(v)}>Подробнее</Button>{applied.has(v.id) && <ButtonLink variant="ghost" href="/applications">Мои отклики</ButtonLink>}</div>
    </article>)}</div>
    {found.length > limit && <div className="mt-6 text-center"><Button variant="outline" onClick={() => setLimit((n) => n + 20)}>Показать ещё</Button></div>}
    <VacancyDetail vacancy={detail} onClose={() => setDetail(null)} />
  </div>;
}
