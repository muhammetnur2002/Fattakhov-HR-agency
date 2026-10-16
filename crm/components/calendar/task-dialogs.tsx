"use client";

import Link from "next/link";
import { Pencil, Repeat, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  deleteTaskAction,
  saveTaskAction,
  searchTaskCandidatesAction,
  toggleTaskDoneAction,
} from "@/app/(agency)/a/calendar/task-actions";
import {
  taskKey,
  type CalendarTaskDTO,
} from "@/components/calendar/calendar-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmBlock } from "@/components/ui/confirm-block";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { panelClass } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { remainingText } from "@/lib/calendar/countdown";
import {
  dateLabel,
  dateTimeLabel,
  dayKeyOf,
  fromMoscowInput,
  timeLabel,
  toMoscowInput,
  WEEKDAYS_SHORT,
  weekdayOf,
} from "@/lib/calendar/moscow";
import { describeRule, parseRule } from "@/lib/calendar/recurrence";
import { noScriptForm } from "@/lib/forms/no-script";

export type AssigneeDTO = { id: string; fullName: string };
export type VacancyDTO = { id: string; label: string };

type Scope = "this" | "following" | "all";

/** Что открыто в форме: новая задача (с подставленным временем) или правка существующей. */
export type TaskDraft =
  | { kind: "new"; startsLocal: string }
  | { kind: "edit"; task: CalendarTaskDTO };

const DURATIONS = [5, 15, 30, 45, 60, 90, 120, 180, 240, 480];
const REMINDERS: { value: string; label: string }[] = [
  { value: "none", label: "Не напоминать" },
  { value: "5", label: "За 5 минут" },
  { value: "15", label: "За 15 минут" },
  { value: "30", label: "За 30 минут" },
  { value: "60", label: "За час" },
  { value: "120", label: "За 2 часа" },
  { value: "1440", label: "За сутки" },
];

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

const SCOPE_LABELS: Record<Scope, string> = {
  this: "Только это",
  following: "Это и следующие",
  all: "Все",
};

/** Выбор области правки/удаления для повторяющейся задачи. */
function ScopePicker({
  name,
  value,
  onChange,
  legend,
}: {
  name: string;
  value: Scope;
  onChange: (scope: Scope) => void;
  legend: string;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {(Object.keys(SCOPE_LABELS) as Scope[]).map((scope) => (
          <label key={scope} className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={name}
              checked={value === scope}
              onChange={() => onChange(scope)}
            />
            {SCOPE_LABELS[scope]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Карточка задачи по клику: что, когда, у кого и кнопки «Выполнено», «Изменить», «Удалить».
 * Для повторяющейся задачи отметка и удаление относятся к открытому повторению, а
 * удаление спрашивает область: только это, это и следующие, все.
 */
export function TaskDetailDialog({
  task,
  now,
  currentUserId,
  onClose,
  onEdit,
  onCloseAutoFocus,
}: {
  task: CalendarTaskDTO;
  now: Date;
  currentUserId: string;
  onClose: () => void;
  onEdit: (task: CalendarTaskDTO) => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // «Удалить» заменяется вопросом на месте (ConfirmBlock): кнопка — наша, блок вернёт на неё фокус
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const [scope, setScope] = useState<Scope>("this");
  const [pending, start] = useTransition();
  const done = Boolean(task.completedAt);
  const recurring = Boolean(task.recurrenceRule);
  const startsAt = new Date(task.startsAt);
  const endsAt = new Date(startsAt.getTime() + task.durationMinutes * 60_000);
  const repeatText = describeRule(task.recurrenceRule);

  function toggle() {
    setError(null);
    start(async () => {
      const result = await toggleTaskDoneAction(task.id, !done, recurring ? task.occurrence : undefined);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  // Ошибку покажет сам блок; успех закрывает карточку
  async function remove() {
    const result = await deleteTaskAction(task.id, recurring ? scope : undefined, recurring ? task.occurrence : undefined);
    if (result.error) return { error: result.error };
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle className={done ? "line-through text-muted-foreground" : undefined}>{task.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p>
            {dateTimeLabel(startsAt)} – {timeLabel(endsAt)}
            <span className="text-muted-foreground"> (по Москве, {durationLabel(task.durationMinutes)})</span>
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {task.personal && <Badge variant="secondary">Личная</Badge>}
            {done && <Badge variant="secondary">выполнено</Badge>}
            {task.hasDeadline && !done && (
              <StatusBadge tone={task.overdue ? "danger" : "neutral"}>
                Дедлайн: {remainingText(startsAt, now)}
              </StatusBadge>
            )}
            {repeatText && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Repeat className="size-3.5" aria-hidden />
                {repeatText}
                {task.recurrenceUntil ? `, до ${dateLabel(new Date(task.recurrenceUntil))}` : ""}
              </span>
            )}
          </div>

          {task.description && <p className="whitespace-pre-wrap">{task.description}</p>}

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {!task.personal && (
              <>
                <dt>Исполнитель</dt>
                <dd>{task.assignee.id === currentUserId ? "вы" : task.assignee.fullName}</dd>
                <dt>Поставил(а)</dt>
                <dd>{task.createdBy.id === currentUserId ? "вы" : task.createdBy.fullName}</dd>
              </>
            )}
            {task.hasDeadline && task.remindBeforeMinutes !== null && (
              <>
                <dt>Напомнить</dt>
                <dd>за {durationLabel(task.remindBeforeMinutes)}</dd>
              </>
            )}
            {task.vacancy && (
              <>
                <dt>Вакансия</dt>
                <dd>
                  <Link href={`/a/vacancies/${task.vacancy.id}`} className="underline underline-offset-2">
                    {task.vacancy.label}
                  </Link>
                </dd>
              </>
            )}
            {task.candidate && (
              <>
                <dt>Кандидат</dt>
                <dd>
                  <Link href={`/a/candidates/${task.candidate.id}`} className="underline underline-offset-2">
                    {task.candidate.fullName}
                  </Link>
                </dd>
              </>
            )}
          </dl>
        </div>

        {confirming && task.canEdit && recurring && (
          <ScopePicker name={`del-scope-${taskKey(task)}`} legend="Что удалить" value={scope} onChange={setScope} />
        )}

        <FormMessage error={error} />

        <div className="flex flex-wrap items-center gap-2">
          {task.canComplete && !confirming && (
            <Button type="button" loading={pending} onClick={toggle}>
              {done ? "Вернуть в работу" : "Выполнено"}
            </Button>
          )}
          {task.canEdit && !confirming && (
            <>
              <Button type="button" variant="outline" onClick={() => onEdit(task)}>
                <Pencil className="size-4" aria-hidden />
                Изменить
              </Button>
              <Button ref={deleteTrigger} type="button" variant="ghost" aria-label="Удалить задачу" onClick={() => setConfirming(true)}>
                <Trash2 className="size-4" aria-hidden />
                Удалить
              </Button>
            </>
          )}
          {task.canEdit && (
            <ConfirmBlock
              open={confirming}
              onOpenChange={setConfirming}
              triggerRef={deleteTrigger}
              layout="inline"
              size="default"
              // Видно «Удалить?», читалке — какая именно задача
              question={
                <>
                  Удалить<span className="sr-only"> задачу «{task.title}»</span>?
                </>
              }
              confirmLabel="Удалить"
              cancelLabel="Не удалять"
              cancelVariant="outline"
              onConfirm={remove}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Форма создания и правки задачи.
 *
 * Время вводится и показывается московским: поле datetime-local без пояса, сервер читает
 * его как Москву независимо от пояса браузера.
 */
export function TaskFormDialog({
  draft,
  assignees,
  vacancies,
  currentUserId,
  onClose,
  onCloseAutoFocus,
}: {
  draft: TaskDraft;
  assignees: AssigneeDTO[];
  vacancies: VacancyDTO[];
  currentUserId: string;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const editing = draft.kind === "edit" ? draft.task : null;
  const rule = parseRule(editing?.recurrenceRule);
  const initialStart = editing ? toMoscowInput(new Date(editing.startsAt)) : (draft as { startsLocal: string }).startsLocal;

  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [startsLocal, setStartsLocal] = useState(initialStart);
  const [duration, setDuration] = useState(editing?.durationMinutes ?? 60);
  const [hasDeadline, setHasDeadline] = useState(editing?.hasDeadline ?? false);
  const [remind, setRemind] = useState(
    editing ? (editing.remindBeforeMinutes === null ? "none" : String(editing.remindBeforeMinutes)) : "60",
  );
  const [assigneeId, setAssigneeId] = useState(editing?.assignee.id ?? currentUserId);
  const [repeat, setRepeat] = useState<"none" | "DAILY" | "WEEKLY" | "MONTHLY">(rule?.freq ?? "none");
  const [weekdays, setWeekdays] = useState<number[]>(
    rule?.freq === "WEEKLY" ? rule.days : [weekdayOf(dayKeyOf(fromMoscowInput(initialStart)))],
  );
  const [untilDate, setUntilDate] = useState(editing?.recurrenceUntil ? dayKeyOf(new Date(editing.recurrenceUntil)) : "");
  const [vacancyId, setVacancyId] = useState(editing?.vacancy?.id ?? "");
  const [candidate, setCandidate] = useState(editing?.candidate ?? null);
  const [scope, setScope] = useState<Scope>("this");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ id: string; fullName: string; hint: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const requestRef = useRef(0);

  const recurringEdit = Boolean(editing?.recurrenceRule);
  // «Только это»: вхождение становится отдельной задачей, повторы настраиваются у серии
  const showRepeat = !recurringEdit || scope !== "this";
  const durations = DURATIONS.includes(duration) ? DURATIONS : [...DURATIONS, duration].sort((a, b) => a - b);

  useEffect(() => {
    const request = ++requestRef.current;
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        if (request === requestRef.current) setFound([]);
        return;
      }
      const items = await searchTaskCandidatesAction(query);
      if (request === requestRef.current) setFound(items);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function toggleWeekday(day: number) {
    setWeekdays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day]));
  }

  function save() {
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startsLocal)) {
      setError("Укажите дату и время");
      return;
    }
    if (showRepeat && repeat === "WEEKLY" && weekdays.length === 0) {
      setError("Выберите дни недели для повторения");
      return;
    }
    start(async () => {
      const result = await saveTaskAction({
        id: editing?.id,
        title,
        description,
        startsLocal,
        durationMinutes: duration,
        hasDeadline,
        assigneeId,
        remindBeforeMinutes: hasDeadline && remind !== "none" ? Number(remind) : null,
        repeat: showRepeat ? repeat : "none",
        weekdays,
        untilDate: showRepeat && repeat !== "none" ? untilDate : "",
        vacancyId: vacancyId || undefined,
        candidateId: candidate?.id,
        scope: recurringEdit ? scope : undefined,
        occurrence: recurringEdit ? editing?.occurrence : undefined,
      });
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{editing ? "Изменить задачу" : "Новая задача"}</DialogTitle>
        </DialogHeader>

        <form
          {...noScriptForm}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {recurringEdit && (
            <ScopePicker name="edit-scope" legend="Что изменить" value={scope} onChange={setScope} />
          )}

          <div className="space-y-2">
            <Label htmlFor="task-title">Что сделать</Label>
            <Textarea
              id="task-title"
              rows={2}
              maxLength={200}
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Позвонить в Технопарк по оффер-письму"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-description">Описание (по желанию)</Label>
            <Textarea
              id="task-description"
              rows={2}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="task-start">Начало (время по Москве)</Label>
              <Input
                id="task-start"
                type="datetime-local"
                required
                value={startsLocal}
                onChange={(e) => setStartsLocal(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-duration">Длительность</Label>
              <NativeSelect
                id="task-duration"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full"
              >
                {durations.map((d) => (
                  <option key={d} value={d}>
                    {durationLabel(d)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={hasDeadline} onChange={(e) => setHasDeadline(e.target.checked)} />
              Это дедлайн: показывать, сколько осталось, и напомнить
            </label>
            {hasDeadline && (
              <div className="space-y-2">
                <Label htmlFor="task-remind">Напоминание</Label>
                <NativeSelect
                  id="task-remind"
                  value={remind}
                  onChange={(e) => setRemind(e.target.value)}
                  className="w-full"
                >
                  {REMINDERS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </div>

          {assignees.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="task-assignee">Кому</Label>
              <NativeSelect
                id="task-assignee"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full"
              >
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.id === currentUserId ? `${a.fullName} (себе)` : a.fullName}
                  </option>
                ))}
              </NativeSelect>
              {assigneeId === currentUserId && (
                <p className="text-xs text-muted-foreground">Задача себе видна только вам.</p>
              )}
            </div>
          )}

          {showRepeat && (
            <div className="space-y-2">
              <Label htmlFor="task-repeat">Повторять</Label>
              <NativeSelect
                id="task-repeat"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value as typeof repeat)}
                className="w-full"
              >
                <option value="none">Не повторять</option>
                <option value="DAILY">Каждый день</option>
                <option value="WEEKLY">Каждую неделю</option>
                <option value="MONTHLY">Каждый месяц</option>
              </NativeSelect>

              {repeat === "WEEKLY" && (
                <fieldset className="space-y-1">
                  <legend className="text-sm">По дням</legend>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS_SHORT.map((name, day) => (
                      <label
                        key={name}
                        className={`inline-flex min-w-10 cursor-pointer items-center justify-center rounded-lg border px-2 py-1 text-sm has-[:checked]:border-primary has-[:checked]:bg-secondary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={weekdays.includes(day)}
                          onChange={() => toggleWeekday(day)}
                        />
                        {name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              {repeat !== "none" && (
                <div className="space-y-2">
                  <Label htmlFor="task-until">До даты (по желанию)</Label>
                  <Input
                    id="task-until"
                    type="date"
                    value={untilDate}
                    onChange={(e) => setUntilDate(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="task-vacancy">Вакансия (по желанию)</Label>
            <NativeSelect
              id="task-vacancy"
              value={vacancyId}
              onChange={(e) => setVacancyId(e.target.value)}
              className="w-full"
            >
              <option value="">Без вакансии</option>
              {vacancies.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-candidate">Кандидат (по желанию)</Label>
            {candidate ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <span>{candidate.fullName}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setCandidate(null)}>
                  Убрать
                </Button>
              </div>
            ) : (
              <>
                <Input
                  id="task-candidate"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Начните вводить имя"
                  autoComplete="off"
                />
                {found.length > 0 && (
                  <ul className={panelClass("plain", "max-h-40 space-y-1 overflow-y-auto p-1")}>
                    {found.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                          onClick={() => {
                            setCandidate({ id: c.id, fullName: c.fullName });
                            setQuery("");
                            setFound([]);
                          }}
                        >
                          {c.fullName}
                          {c.hint && <span className="block text-xs text-muted-foreground">{c.hint}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <FormMessage error={error} />

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton loading={saving} pendingLabel="Сохраняем…">
              Сохранить
            </SubmitButton>
            <Button type="button" variant="outline" onClick={onClose}>
              Отмена
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
