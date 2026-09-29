'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock, Filter, GraduationCap, MapPin, Search, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Chip, Tag } from '@/components/ui/Chip';
import { SelectField, TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { CubeMark } from '@/components/brand/CubeMark';
import { springSoft } from '@/lib/motion';
import { cn } from '@/lib/utils';
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

/**
 * Раздел «Кандидаты» — обратная сторона ленты студента.
 *
 * Там студент листает вакансии свайпом и решает сам; здесь работодатель
 * выбирает, кого позвать, — но списком, а не колодой. Свайп остаётся
 * только у студентов: у входа в кабинет компании нет телефона в руке
 * и настроения листать карточки одну за другой, а список с фильтром
 * читается и сравнивается быстрее, чем решение по одной карточке зараз.
 *
 * Решение привязано к вакансии: «пригласить» без вакансии в этом продукте
 * не бывает — отклик всегда на что-то конкретное.
 */
export function CandidatesScreen({ vacancies }: { vacancies: EmployerVacancyDTO[] }) {
  const toast = useToast();
  const [vacancyId, setVacancyId] = useState(vacancies[0]?.id ?? '');
  const [loading, setLoading] = useState(true);
  const [pool, setPool] = useState<StudentProfileDTO[]>([]);
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [days, setDays] = useState<Weekday[]>([]);
  const [genders, setGenders] = useState<Gender[]>([]);
  const [invited, setInvited] = useState(0);

  useEffect(() => {
    if (!vacancyId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setDecided(new Set());
    setInvited(0);
    fetch(`/api/employer/candidates/${vacancyId}`)
      .then((r) => r.json())
      .then((data: { candidates?: StudentProfileDTO[] }) => {
        if (!cancelled) setPool(data.candidates ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error('Не удалось загрузить кандидатов');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vacancyId]);

  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      pool.filter((s) => {
        if (decided.has(s.id)) return false;
        if (days.length > 0 && !s.workDays.some((d) => days.includes(d))) return false;
        if (genders.length > 0 && !genders.includes(s.gender)) return false;
        if (!query) return true;
        const haystack = `${s.fullName} ${s.university} ${s.speciality} ${s.skills.join(' ')}`.toLowerCase();
        return haystack.includes(query);
      }),
    [pool, decided, days, genders, query],
  );

  function invite(student: StudentProfileDTO) {
    setInviting((prev) => new Set(prev).add(student.id));
    void fetch(`/api/employer/candidates/${vacancyId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: student.id }),
    })
      .then((r) => r.json())
      .then((data: { invited?: boolean; reason?: string }) => {
        setDecided((prev) => new Set(prev).add(student.id));
        if (!data.invited && data.reason === 'ALREADY_DECIDED') {
          toast.success('Уже не в списке', 'Студент уже откликнулся или приглашён на эту вакансию');
        } else {
          setInvited((n) => n + 1);
          toast.success('Приглашение отправлено', student.fullName);
        }
      })
      .catch(() => {
        toast.error('Не удалось пригласить', 'Проверьте соединение и попробуйте ещё раз');
      })
      .finally(() => {
        setInviting((prev) => {
          const next = new Set(prev);
          next.delete(student.id);
          return next;
        });
      });
  }

  const activeFilters = days.length + genders.length;

  if (vacancies.length === 0) {
    return (
      <div className="glass mx-auto flex max-w-[26rem] flex-col items-center gap-4 rounded-4xl p-10 text-center">
        <Users className="size-10 text-paper-faint" aria-hidden />
        <div>
          <h1 className="text-display-sm text-paper">Пока нет вакансий</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-paper-dim">
            Кандидатов подбираем под конкретную вакансию — создайте её в разделе «Вакансии», и здесь
            появится список студентов.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col pb-16">
      <header className="w-full">
        <h1 className="text-display-md text-paper">Кандидаты</h1>
        <p className="mt-1.5 text-[14px] text-paper-dim">
          Студенты, подтверждённые агентством и подходящие на выбранную вакансию.
        </p>
      </header>

      <div className="mt-6 w-full">
        <SelectField
          label="Вакансия"
          value={vacancyId}
          onChange={(e) => setVacancyId(e.target.value)}
          options={vacancies.map((v) => ({ value: v.id, label: v.title }))}
        />
      </div>

      <div className="mt-3 flex w-full items-center gap-2">
        <div className="relative flex-1">
          <TextField label="Поиск: имя, вуз, навык" value={search} onChange={(e) => setSearch(e.target.value)} />
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
            <span className="absolute -right-1 -top-1 grid size-[18px] place-items-center rounded-full bg-accent-500 text-[10.5px] font-semibold text-ink">
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
              <div>
                <p className="mb-2 text-[12px] uppercase tracking-[0.1em] text-paper-faint">День работы</p>
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
                <p className="mb-2 text-[12px] uppercase tracking-[0.1em] text-paper-faint">Пол</p>
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
                    setDays([]);
                    setGenders([]);
                  }}
                  className="text-[12.5px] text-paper-faint underline-offset-4 hover:text-paper hover:underline"
                >
                  Сбросить фильтр
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {invited > 0 && (
        <p className="mt-5 text-[12.5px] tabular-nums text-paper-faint">Приглашено сейчас: {invited}</p>
      )}

      <div className="mt-5 w-full space-y-2.5">
        {loading && (
          <div className="glass-card flex h-40 items-center justify-center rounded-3xl text-paper-faint">
            Загружаем кандидатов…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <EmptyList hasFilters={activeFilters > 0 || query.length > 0} invited={invited} />
        )}

        {!loading && (
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
}: {
  student: StudentProfileDTO;
  inviting: boolean;
  onInvite: () => void;
}) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
      transition={springSoft}
      className="glass-card flex flex-col gap-4 rounded-3xl p-5 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <Avatar name={student.fullName} src={student.photoUrl} size={52} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold text-paper">{student.fullName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-paper-dim">
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
            <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-paper-dim">{student.about}</p>
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
        <h3 className="text-display-sm text-paper">
          {hasFilters ? 'По фильтру никого нет' : 'Кандидаты закончились'}
        </h3>
        <p className="mx-auto max-w-[22rem] text-[14px] leading-relaxed text-paper-dim">
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
