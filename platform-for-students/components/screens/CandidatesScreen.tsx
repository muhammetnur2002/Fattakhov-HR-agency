'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock, Layers, List, X, Filter, GraduationCap, MapPin, Search } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Chip, Tag } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/Field';
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
      pool.filter((s) => !decided.has(s.id) && matchesCandidate(s, { query, days, genders, city, university })),
    [pool, decided, days, genders, query, city, university],
  );

  async function invite(student: StudentProfileDTO) {
    if (inviteLock.current) return;
    const targetVacancyId = vacancyId || inviteVacancyId;
    if (!targetVacancyId) { toast.error('Выберите вакансию', 'Укажите, на какую вакансию пригласить кандидата.'); return; }
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
      setDecided((prev) => new Set(prev).add(student.id));
      if (!data.invited && data.reason === 'ALREADY_DECIDED') {
        toast.success('Уже не в списке', 'Студент уже откликнулся или приглашён на эту вакансию');
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

  const activeFilters = days.length + genders.length + Number(Boolean(city)) + Number(Boolean(university));
  const swipeCandidates = filtered.filter((s) => !skipped.has(s.id));


  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col pb-16">
      <header className="w-full">
        <h1 className="text-headline text-paper">Кандидаты</h1>
        <p className="mt-1.5 text-small text-paper-dim">
          Подтверждённые студенты: смотрите весь каталог или выберите вакансию для приглашения.
        </p>
      </header>

      <div className="mt-5 flex gap-2" role="group" aria-label="Вид кандидатов">
        <Button variant={view === 'list' ? 'primary' : 'outline'} aria-pressed={view === 'list'} icon={<List />} onClick={() => setView('list')}>Список</Button>
        <Button variant={view === 'swipe' ? 'primary' : 'outline'} aria-pressed={view === 'swipe'} icon={<Layers />} onClick={() => setView('swipe')}>Свайпы</Button>
      </div>
      <div className="mt-6 w-full">
        <SelectField
          label="Показывать кандидатов"
          disabled={inviting.size > 0}
          value={vacancyId}
          onChange={(e) => setVacancyId(e.target.value)}
          options={[{ value: '', label: 'Все кандидаты' }, ...vacancies.map((v) => ({ value: v.id, label: v.title }))]}
        />
      </div>

      {!vacancyId && <div className="mt-3">
        <SelectField label="Приглашать на вакансию" value={inviteVacancyId} disabled={inviting.size > 0} onChange={(e) => setInviteVacancyId(e.target.value)} options={[{ value: '', label: 'Выберите вакансию для приглашения' }, ...vacancies.map((v) => ({ value: v.id, label: v.title }))]} />
        {vacancies.length === 0 && <p className="mt-2 text-small text-paper-dim">Каталог доступен для просмотра. Чтобы приглашать, создайте вакансию.</p>}
      </div>}
      <div className="mt-3 flex w-full items-center gap-2">
        <div className="relative flex-1">
          <TextField label="Поиск: имя, город, вуз, навык" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Search className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-paper-faint" aria-hidden />
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          aria-label="Фильтр"
          className={cn(
            'relative grid size-[62px] shrink-0 place-items-center rounded-xl border transition-colors',
            filtersOpen || activeFilters > 0
              ? 'border-accent-400/70 bg-accent-500/15 text-accent-200'
              : 'border-[var(--hairline)] bg-graphite-900/55 text-paper/70 hover:border-paper/25 hover:text-paper',
          )}
        >
          <Filter className="size-[18px]" aria-hidden />
          {activeFilters > 0 && (
            <span className="absolute -right-1 -top-1 grid size-[18px] place-items-center rounded-full bg-accent-300 text-caption font-semibold text-ink">
              {activeFilters}
            </span>
          )}
        </button>
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
            <div className="glass mt-3 space-y-4 rounded-3xl p-4">
              <SelectField label="Город" value={city} onChange={(e) => setCity(e.target.value)} options={[{ value: '', label: 'Все города' }, ...Array.from(new Set(pool.map((s) => s.city).filter((value): value is string => Boolean(value)))).sort().map((value) => ({ value, label: value }))]} />
              <SelectField label="Вуз" value={university} onChange={(e) => setUniversity(e.target.value)} options={[{ value: '', label: 'Все вузы' }, ...Array.from(new Set(pool.map((s) => s.university).filter((value): value is string => Boolean(value)))).sort().map((value) => ({ value, label: value }))]} />
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

      {invited > 0 && (
        <p className="mt-5 text-caption tabular-nums text-paper-faint">Приглашено сейчас: {invited}</p>
      )}

      {!loading && !loadError && <p className="mt-4 text-small text-paper-dim" aria-live="polite">Найдено: {filtered.length}</p>}
      {!loading && !loadError && view === 'swipe' && filtered.length > 0 && (
        <div className="mt-5">
          <p className="mb-4 text-small text-paper-dim">Вправо — пригласить. Влево — посмотреть позже.</p>
          {swipeCandidates[0] ? (
            <motion.div key={`${vacancyId}:${swipeCandidates[0].id}`} drag={inviting.size ? false : 'x'} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.7} style={{ touchAction: 'pan-y' }} onDragEnd={(_, info) => {
              if (inviteLock.current) return;
              if (info.offset.x > SWIPE.distanceThreshold) void invite(swipeCandidates[0]);
              else if (info.offset.x < -SWIPE.distanceThreshold) setSkipped((prev) => new Set(prev).add(swipeCandidates[0].id));
            }}>
              <CandidateRow student={swipeCandidates[0]} inviting={inviting.size > 0} onInvite={() => invite(swipeCandidates[0])} card />
              <div className="mt-4 flex justify-center"><Button variant="outline" disabled={inviting.size > 0} icon={<X />} onClick={() => setSkipped((prev) => new Set(prev).add(swipeCandidates[0].id))}>Позже</Button></div>
            </motion.div>
          ) : <EmptyState title="Все карточки просмотрены" description="Отложенные кандидаты остаются в списке." action={<Button onClick={() => setSkipped(new Set())}>Посмотреть снова</Button>} />}
        </div>
      )}
      <div className="mt-5 w-full space-y-2.5">
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
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function CandidateRow({
  student,
  inviting,
  onInvite,
  card = false,
}: {
  student: StudentProfileDTO;
  inviting: boolean;
  onInvite: () => void;
  card?: boolean;
}) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
      transition={springSoft}
      className={cn('glass-card flex flex-col gap-4 rounded-3xl p-5', card ? 'mx-auto min-h-80 max-w-md justify-between' : 'sm:flex-row sm:items-center')}
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

      <Button
        size="md"
        loading={inviting}
        onClick={onInvite}
        icon={<Check />}
        className="shrink-0 sm:w-auto"
      >
        Пригласить
      </Button>
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
