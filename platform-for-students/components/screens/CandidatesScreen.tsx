'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock, Layers, List, X, Filter, GraduationCap, MapPin, Search } from 'lucide-react';
import { ListPanel } from '@/components/layout/ListPanel';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Chip, Tag } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField } from '@/components/ui/Field';
import { Dialog } from '@/components/ui/Dialog';
import { PortfolioView } from '@/components/student/PortfolioView';
import { useToast } from '@/components/ui/Toast';
import { CubeMark } from '@/components/brand/CubeMark';
import { springSoft, SWIPE } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { matchesCandidate } from '@/lib/candidate-search';
import { apiErrorMessage } from '@/lib/api-client';
import {
  GENDERS,
  WEEKDAY_LABEL,
  WEEKDAYS,
  type EmployerVacancyDTO,
  type Gender,
  type StudentProfileDTO,
  type Weekday,
  studyLine,
} from '@/lib/types';

const GENDER_LABEL: Record<Gender, string> = {
  FEMALE: 'Женский',
  MALE: 'Мужской',
  UNSPECIFIED: 'Не указан',
};

export function CandidatesScreen({ vacancies }: { vacancies: EmployerVacancyDTO[] }) {
  const toast = useToast();
  const [view, setView] = useState<'list' | 'swipe'>('list');
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [city, setCity] = useState('');
  const [university, setUniversity] = useState('');
  const inviteLock = useRef(false);
  const [vacancyId, setVacancyId] = useState('');
  const [inviteVacancyId, setInviteVacancyId] = useState('');
  const [inviteStudent, setInviteStudent] = useState<StudentProfileDTO | null>(null);
  const [detail, setDetail] = useState<StudentProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [pool, setPool] = useState<StudentProfileDTO[]>([]);
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [days, setDays] = useState<Weekday[]>([]);
  const [genders, setGenders] = useState<Gender[]>([]);
  const [invited, setInvited] = useState(0);
  // Список не загрузился: это не «кандидаты закончились», и повторить можно кнопкой
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setDecided(new Set());
    setSkipped(new Set());
    setInvited(0);
    fetch(vacancyId ? `/api/employer/candidates/${vacancyId}` : '/api/employer/candidates')
      .then(async (r) => {
        // Статус смотрим до разбора: 401/403/500 раньше превращались в «Кандидаты закончились»
        if (!r.ok) throw new Error(await apiErrorMessage(r, 'Не удалось загрузить кандидатов'));
        return r.json() as Promise<{ candidates?: StudentProfileDTO[] }>;
      })
      .then((data) => {
        if (!cancelled) setPool(data.candidates ?? []);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPool([]);
        setLoadError(error instanceof Error && error.message ? error.message : 'Проверьте соединение и попробуйте ещё раз');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vacancyId, reloadKey]);

  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      pool.filter((s) => (!vacancyId || !decided.has(s.id)) && matchesCandidate(s, { query, days, genders, city, university })),
    [pool, decided, days, genders, query, city, university, vacancyId],
  );

  async function invite(student: StudentProfileDTO, selectedVacancy?: string) {
    if (inviteLock.current) return;
    const targetVacancyId = selectedVacancy;
    if (!targetVacancyId) { setInviteVacancyId(vacancyId); setInviteStudent(student); return; }

    inviteLock.current = true;
    setInviting((prev) => new Set(prev).add(student.id));
    try {
      const response = await fetch(`/api/employer/candidates/${targetVacancyId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student.id }),
      });
      // Сначала статус: при отказе сервера (лимит приглашений, 404, 400) студент остаётся
      // в списке, счётчик не растёт, а человек видит причину, а не «Приглашение отправлено»
      if (!response.ok) {
        toast.error('Не удалось пригласить', await apiErrorMessage(response, 'Попробуйте ещё раз'));
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { invited?: boolean; reason?: string };
      setInviteStudent(null);
      setDecided((prev) => new Set(prev).add(student.id));
      if (!data.invited && data.reason === 'ALREADY_DECIDED') {
        toast.success('Уже есть отклик', 'Студент уже откликнулся или приглашён на эту вакансию');
      } else {
        setInvited((n) => n + 1);
        toast.success('Приглашение отправлено', student.fullName);
      }
    } catch {
      toast.error('Не удалось пригласить', 'Проверьте соединение и попробуйте ещё раз');
    } finally {
      inviteLock.current = false;
      setInviting((prev) => {
        const next = new Set(prev);
        next.delete(student.id);
        return next;
      });
    }
  }

  const activeFilters = days.length + genders.length + Number(Boolean(city)) + Number(Boolean(university)) + Number(Boolean(vacancyId));
  const swipeCandidates = filtered.filter((s) => !skipped.has(s.id));


  return (
    <ListPanel key={view} fixed={view === 'swipe'} className="mx-auto w-full max-w-2xl" toolbar={<>
      <header className="w-full">
        <h1 className="text-headline text-paper">Кандидаты</h1>
        <p className="mt-1.5 text-small text-paper-dim">
          Резюме и анкеты по всей базе подтверждённых студентов.
        </p>
      </header>

      <div className="mt-4 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-paper-faint" aria-hidden />
          <input type="search" aria-label="Поиск кандидатов и резюме" placeholder="Имя, навык, опыт…" value={search} onChange={e => setSearch(e.target.value)} className="h-11 w-full rounded-xl border border-[var(--hairline)] bg-graphite-900/40 pl-9 pr-3 text-small text-paper focus:border-accent-400" />
        </div>
        <button type="button" onClick={() => setFiltersOpen(v => !v)} aria-expanded={filtersOpen} aria-label="Фильтр" className={cn('relative grid size-11 shrink-0 place-items-center rounded-xl border border-[var(--hairline)]', filtersOpen || activeFilters ? 'bg-accent-500/15 text-accent-200' : 'text-paper-dim')}>
          <Filter className="size-4" />
          {activeFilters > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-accent-300 px-1.5 text-caption text-ink">{activeFilters}</span>}
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-caption text-paper-faint">{vacancyId ? vacancies.find(v => v.id === vacancyId)?.title : 'Вся база'}{!loading && !loadError ? ` · ${filtered.length}` : ''}</p>
        <div className="flex shrink-0 gap-1 rounded-xl bg-paper/[0.04] p-1" role="group" aria-label="Вид кандидатов">
          {(['list', 'swipe'] as const).map(mode => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)} className={cn('flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-caption', view === mode ? 'bg-paper text-ink' : 'text-paper-dim')}>
            {mode === 'list' ? <List className="size-3.5" /> : <Layers className="size-3.5" />}{mode === 'list' ? 'Список' : 'Свайпы'}
          </button>)}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {filtersOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={springSoft}
            className="w-full overflow-hidden"
          >
            <div className="mt-3 space-y-3 rounded-2xl border border-[var(--hairline)] p-3">
              <CompactSelect label="Показывать кандидатов" value={vacancyId} disabled={inviting.size > 0} onChange={setVacancyId} options={[{value: '', label: 'Вся база — все кандидаты'}, ...vacancies.map(v => ({value:v.id,label:v.title}))]} />
              <CompactSelect label="Город" value={city} onChange={setCity} options={[{ value: '', label: 'Все города' }, ...Array.from(new Set(pool.map((s) => s.city).filter((value): value is string => Boolean(value)))).sort().map((value) => ({ value, label: value }))]} />
              <CompactSelect label="Вуз" value={university} onChange={setUniversity} options={[{ value: '', label: 'Все вузы' }, ...Array.from(new Set(pool.map((s) => s.university).filter((value): value is string => Boolean(value)))).sort().map((value) => ({ value, label: value }))]} />
              <div>
                <p className="mb-2 text-caption uppercase tracking-[0.1em] text-paper-faint">День работы</p>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((day) => (
                    <Chip
                      key={day}
                      size="sm"
                      selected={days.includes(day)}
                      onToggle={() =>
                        setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
                      }
                    >
                      {WEEKDAY_LABEL[day]}
                    </Chip>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-caption uppercase tracking-[0.1em] text-paper-faint">Пол</p>
                <div className="flex flex-wrap gap-1.5">
                  {GENDERS.map((gender) => (
                    <Chip
                      key={gender}
                      size="sm"
                      selected={genders.includes(gender)}
                      onToggle={() =>
                        setGenders((prev) =>
                          prev.includes(gender) ? prev.filter((g) => g !== gender) : [...prev, gender],
                        )
                      }
                    >
                      {GENDER_LABEL[gender]}
                    </Chip>
                  ))}
                </div>
              </div>
              {activeFilters > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setVacancyId('');
                    setCity('');
                    setUniversity('');
                    setDays([]);
                    setGenders([]);
                  }}
                  className="text-caption text-paper-faint underline-offset-4 hover:text-paper hover:underline"
                >
                  Сбросить фильтр
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      </>}>
      {invited > 0 && (
        <p className="mt-5 text-caption tabular-nums text-paper-faint">Приглашено сейчас: {invited}</p>
      )}


      {!loading && !loadError && view === 'swipe' && filtered.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="mb-2 text-small text-paper-dim">Вправо — пригласить. Влево — посмотреть позже.</p>
          {swipeCandidates[0] ? (
            <motion.div className="flex min-h-0 flex-1 flex-col" key={`${vacancyId}:${swipeCandidates[0].id}`} drag={inviting.size ? false : 'x'} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.7} style={{ touchAction: 'pan-y' }} onDragEnd={(_, info) => {
              if (inviteLock.current) return;
              if (info.offset.x > SWIPE.distanceThreshold) void invite(swipeCandidates[0]);
              else if (info.offset.x < -SWIPE.distanceThreshold) setSkipped((prev) => new Set(prev).add(swipeCandidates[0].id));
            }}>
              <CandidateRow student={swipeCandidates[0]} inviting={inviting.size > 0} onInvite={() => invite(swipeCandidates[0])} onOpen={() => setDetail(swipeCandidates[0])} card />
              <div className="mt-2 flex shrink-0 justify-center"><Button size="sm" variant="outline" disabled={inviting.size > 0} icon={<X />} onClick={() => setSkipped((prev) => new Set(prev).add(swipeCandidates[0].id))}>Позже</Button></div>
            </motion.div>
          ) : <EmptyState title="Все карточки просмотрены" description="Отложенные кандидаты остаются в списке." action={<Button onClick={() => setSkipped(new Set())}>Посмотреть снова</Button>} />}
        </div>
      )}
      <div className={view === 'swipe' ? 'contents' : 'w-full space-y-2.5'}>
        {loading && (
          <div className="glass-card flex h-40 items-center justify-center rounded-3xl text-paper-faint">
            Загружаем кандидатов…
          </div>
        )}

        {!loading && loadError && (
          <EmptyState
            title="Не удалось загрузить кандидатов"
            description={loadError}
            action={<Button onClick={() => setReloadKey((n) => n + 1)}>Повторить</Button>}
          />
        )}

        {!loading && !loadError && filtered.length === 0 && (
          <EmptyList hasFilters={activeFilters > 0 || query.length > 0} invited={invited} />
        )}

        {!loading && !loadError && view === 'list' && (
          <AnimatePresence initial={false}>
            {filtered.map((student) => (
              <CandidateRow
                key={student.id}
                student={student}
                inviting={inviting.has(student.id)}
                onInvite={() => invite(student)}
                onOpen={() => setDetail(student)}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
      <Dialog open={detail !== null} title="Резюме кандидата" onClose={() => setDetail(null)}>
        {detail && <div className="space-y-4">
          <h2 className="text-title">{detail.fullName}</h2>
          <p className="text-small text-paper-dim">{[detail.city, detail.university, detail.speciality].filter(Boolean).join(' · ')}</p>
          <p className="text-small text-paper-dim">{detail.workDays.map(d => WEEKDAY_LABEL[d]).join(', ')}{detail.hoursPerWeek ? ` · до ${detail.hoursPerWeek} ч/нед` : ''}</p>
          {detail.about && <p className="whitespace-pre-line text-small">{detail.about}</p>}
          <div className="flex flex-wrap gap-1.5">{detail.skills.map(skill => <Tag key={skill}>{skill}</Tag>)}</div>
          <PortfolioView portfolio={detail} />
          <p className="text-caption text-paper-faint">Контакты и прикреплённое резюме доступны в отклике после приглашения или отклика студента.</p>
          <Button size="sm" onClick={() => { setDetail(null); void invite(detail); }}>Пригласить</Button>
        </div>}
      </Dialog>
      <Dialog open={inviteStudent !== null} title="Пригласить кандидата" onClose={() => { if (!inviteLock.current) setInviteStudent(null); }}>
        <div className="space-y-4">
          <p className="text-small">{inviteStudent?.fullName}</p>
          <SelectField label="Вакансия для приглашения" value={inviteVacancyId} disabled={inviting.size > 0} onChange={e => setInviteVacancyId(e.target.value)} options={[{value:'',label:'Выберите вакансию'}, ...vacancies.map(v => ({value:v.id,label:v.title}))]} />
          {vacancies.length === 0 && <p className="text-small text-paper-dim">Для приглашения сначала создайте вакансию. Просмотр резюме доступен без неё.</p>}
          <Button disabled={!inviteVacancyId || inviting.size > 0} loading={inviting.size > 0} onClick={() => { if (inviteStudent) void invite(inviteStudent, inviteVacancyId); }}>Отправить приглашение</Button>
        </div>
      </Dialog>
    </ListPanel>
  );
}

function CandidateRow({
  student,
  inviting,
  onInvite,
  onOpen,
  card = false,
}: {
  student: StudentProfileDTO;
  inviting: boolean;
  onInvite: () => void;
  onOpen: () => void;
  card?: boolean;
}) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
      transition={springSoft}
      className={cn('glass-card flex flex-col gap-3 rounded-2xl p-4', card ? 'mx-auto min-h-0 w-full max-w-md flex-1 justify-between overflow-y-auto' : 'sm:flex-row sm:items-center')}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <Avatar name={student.fullName} src={student.photoUrl} size={52} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold text-paper">{student.fullName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-paper-dim">
            {student.university && (
              <span className="flex items-center gap-1.5">
                <GraduationCap className="size-3.5 shrink-0" aria-hidden />
                {student.university}
                {studyLine(student.studyLevel, student.studyYear) ? `, ${studyLine(student.studyLevel, student.studyYear)}` : ''}
              </span>
            )}
            {student.city && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                {student.city}
              </span>
            )}
            {student.workDays.length > 0 && (
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5 shrink-0" aria-hidden />
                {student.workDays.map((d) => WEEKDAY_LABEL[d]).join(', ')}
                {student.hoursPerWeek ? ` · до ${student.hoursPerWeek} ч/нед` : ''}
              </span>
            )}
          </div>

          {student.about && (
            <p className="mt-2 line-clamp-2 text-small leading-relaxed text-paper-dim">{student.about}</p>
          )}

          {student.skills.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {student.skills.slice(0, 8).map((skill) => (
                <Tag key={skill}>{skill}</Tag>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 sm:flex-col"><Button size="sm" variant="outline" onClick={onOpen} className="flex-1">Резюме</Button><Button
        size="sm"
        loading={inviting}
        onClick={onInvite}
        icon={<Check />}
        className="shrink-0 sm:w-auto"
      >
        Пригласить
      </Button></div>
    </motion.article>
  );
}

function EmptyList({ invited, hasFilters }: { invited: number; hasFilters: boolean }) {
  return (
    <div className="glass flex flex-col items-center gap-5 rounded-4xl p-10 text-center">
      <CubeMark className="h-16 w-16 text-paper/25" />
      <div className="space-y-2">
        <h3 className="text-title text-paper">
          {hasFilters ? 'По фильтру никого нет' : 'Кандидаты закончились'}
        </h3>
        <p className="mx-auto max-w-[22rem] text-small leading-relaxed text-paper-dim">
          {hasFilters
            ? 'Смягчите фильтр или поиск — подходящие студенты появятся снова.'
            : invited > 0
              ? `Вы пригласили ${invited} ${invited === 1 ? 'кандидата' : 'кандидатов'}. Ответ появится в разделе «Отклики».`
              : 'Новые подтверждённые студенты появляются по мере регистрации — загляните позже.'}
        </p>
      </div>
    </div>
  );
}

function CompactSelect({label,value,onChange,options,disabled=false}: {label:string;value:string;onChange:(value:string)=>void;options:{value:string;label:string}[];disabled?:boolean}) {
  return <label className="block text-caption text-paper-dim">{label}<select value={value} disabled={disabled} onChange={e=>onChange(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[var(--hairline)] bg-ink px-2 text-small text-paper">{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
}
