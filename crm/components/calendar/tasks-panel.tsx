"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  deleteTaskAction,
  saveTaskAction,
  searchTaskCandidatesAction,
  toggleTaskDoneAction,
} from "@/app/(agency)/a/calendar/task-actions";
import { FormMessage } from "@/components/ui/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { panelClass } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { noScriptForm } from "@/lib/forms/no-script";
import { useTimeZone } from "@/components/shell/time-zone-provider";
import { utcToZonedInput, zonedToUtc } from "@/lib/calendar/timezone";
import { formatDayMonth, formatInZone, formatTime, zonedDayKey } from "@/lib/format-date";
import { useConfirmFocus, useReturnFocus } from "@/lib/hooks/use-return-focus";

export type TaskDTO = {
  id: string;
  title: string;
  dueAt: string;
  completedAt: string | null;
  overdue: boolean;
  assignee: { id: string; fullName: string };
  createdBy: { id: string; fullName: string };
  vacancy: { id: string; label: string } | null;
  candidate: { id: string; fullName: string } | null;
  canEdit: boolean;
  canComplete: boolean;
};

export type AssigneeDTO = { id: string; fullName: string };
export type VacancyDTO = { id: string; label: string };

type Draft = {
  id?: string;
  title: string;
  dueLocal: string;
  assigneeId: string;
  vacancyId: string;
  candidate: { id: string; fullName: string } | null;
};

/**
 * Задания в календаре: список на выбранный период и форма «+ Задание».
 *
 * Невыполненные просроченные стоят отдельной группой сверху и не пропадают,
 * сколько бы ни листали календарь. Время показывается и вводится в часовом
 * поясе из профиля (`useTimeZone`), на сервер уходит момент в UTC. Прежде это
 * была зона браузера, а первый кадр на сервере считался в зоне процесса —
 * группы по дням и сама разметка расходились при гидратации.
 */
export function TasksPanel({
  tasks,
  assignees,
  vacancies,
  currentUserId,
  defaultDue,
}: {
  tasks: TaskDTO[];
  assignees: AssigneeDTO[];
  vacancies: VacancyDTO[];
  currentUserId: string;
  /** Срок нового задания по умолчанию, ISO; в режиме «День» это выбранный день. */
  defaultDue: string;
}) {
  const timeZone = useTimeZone();
  const [draft, setDraft] = useState<Draft | null>(null);
  // Окно открыто состоянием, а не DialogTrigger: фокус возвращаем сами
  const returnFocus = useReturnFocus();

  function openNew(event: React.MouseEvent<HTMLElement>) {
    returnFocus.remember(event.currentTarget);
    setDraft({
      title: "",
      dueLocal: utcToZonedInput(new Date(defaultDue), timeZone),
      assigneeId: currentUserId,
      vacancyId: "",
      candidate: null,
    });
  }

  function openEdit(task: TaskDTO, opener: HTMLElement) {
    returnFocus.remember(opener);
    setDraft({
      id: task.id,
      title: task.title,
      dueLocal: utcToZonedInput(new Date(task.dueAt), timeZone),
      assigneeId: task.assignee.id,
      vacancyId: task.vacancy?.id ?? "",
      candidate: task.candidate,
    });
  }

  const overdue = tasks.filter((t) => t.overdue);
  const rest = tasks.filter((t) => !t.overdue);
  const groups = new Map<string, { date: Date; items: TaskDTO[] }>();
  for (const task of rest) {
    const date = new Date(task.dueAt);
    const key = zonedDayKey(date, timeZone);
    if (!groups.has(key)) groups.set(key, { date, items: [] });
    groups.get(key)!.items.push(task);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-base">Задания</CardTitle>
          <CardDescription>
            Что нужно сделать и к какому сроку. Коллеге задание можно поставить, если роль это позволяет.
          </CardDescription>
        </div>
        <Button type="button" size="sm" onClick={openNew}>
          + Задание
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {tasks.length === 0 && (
          <p className="text-sm text-muted-foreground">На этот период заданий нет.</p>
        )}

        {overdue.length > 0 && (
          <section className="space-y-2" aria-label="Просроченные задания">
            <h3 className="text-sm font-medium text-destructive">Просрочено</h3>
            <ul className="space-y-2">
              {overdue.map((task) => (
                <TaskItem key={task.id} task={task} currentUserId={currentUserId} showDay onEdit={openEdit} />
              ))}
            </ul>
          </section>
        )}

        {[...groups.values()].map(({ date, items }) => (
          <section key={zonedDayKey(date, timeZone)} className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              {(() => {
                const text = formatInZone(date, "weekdayDayMonth", timeZone);
                return text.charAt(0).toUpperCase() + text.slice(1);
              })()}
            </h3>
            <ul className="space-y-2">
              {items.map((task) => (
                <TaskItem key={task.id} task={task} currentUserId={currentUserId} onEdit={openEdit} />
              ))}
            </ul>
          </section>
        ))}
      </CardContent>

      {draft && (
        <TaskDialog
          draft={draft}
          assignees={assignees}
          vacancies={vacancies}
          onClose={() => setDraft(null)}
          onCloseAutoFocus={returnFocus.onCloseAutoFocus}
        />
      )}
    </Card>
  );
}

function TaskItem({
  task,
  currentUserId,
  showDay,
  onEdit,
}: {
  task: TaskDTO;
  currentUserId: string;
  showDay?: boolean;
  onEdit: (task: TaskDTO, opener: HTMLElement) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { triggerRef, focusRef, questionId, groupProps } = useConfirmFocus(confirming);
  const [pending, start] = useTransition();
  const done = Boolean(task.completedAt);
  const due = new Date(task.dueAt);
  const timeZone = useTimeZone();

  function toggle() {
    setError(null);
    start(async () => {
      const result = await toggleTaskDoneAction(task.id, !done);
      if (result.error) setError(result.error);
    });
  }

  function remove() {
    setError(null);
    start(async () => {
      const result = await deleteTaskAction(task.id);
      if (result.error) {
        setError(result.error);
        setConfirming(false);
      }
    });
  }

  return (
    <li className={panelClass("plain", "space-y-1")}>
      <div className="flex flex-wrap items-start gap-3">
        <input
          type="checkbox"
          checked={done}
          disabled={!task.canComplete || pending}
          onChange={toggle}
          aria-label={done ? "Вернуть в работу" : "Отметить выполненным"}
          className="mt-1 size-4"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className={`text-sm font-medium ${done ? "text-muted-foreground line-through" : ""}`}>
            {task.title}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className={task.overdue ? "font-medium text-destructive" : undefined}>
              {showDay ? `${formatDayMonth(due, timeZone)}, ` : ""}
              {formatTime(due, timeZone)}
            </span>
            {task.assignee.id !== currentUserId && <span>исполнитель: {task.assignee.fullName}</span>}
            {task.createdBy.id !== currentUserId && task.assignee.id === currentUserId && (
              <span>поставил(а): {task.createdBy.fullName}</span>
            )}
            {task.vacancy && (
              <Link href={`/a/vacancies/${task.vacancy.id}`} className="underline underline-offset-2">
                {task.vacancy.label}
              </Link>
            )}
            {task.candidate && (
              <Link href={`/a/candidates/${task.candidate.id}`} className="underline underline-offset-2">
                {task.candidate.fullName}
              </Link>
            )}
            {done && <Badge variant="secondary">выполнено</Badge>}
          </div>
        </div>

        {task.canEdit &&
          (confirming ? (
            <span {...groupProps} className="flex items-center gap-2 text-xs">
              {/* Видно «Удалить?», читалке — какое именно задание: строк в списке много */}
              <span id={questionId}>
                Удалить<span className="sr-only"> задание «{task.title}»</span>?
              </span>
              <Button type="button" size="sm" variant="destructive" loading={pending} onClick={remove}>
                Да
              </Button>
              <Button ref={focusRef} aria-describedby={questionId} type="button" size="sm" variant="outline" onClick={() => setConfirming(false)}>
                Нет
              </Button>
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Изменить задание"
                onClick={(e) => onEdit(task, e.currentTarget)}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                ref={triggerRef}
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Удалить задание"
                onClick={() => setConfirming(true)}
              >
                <Trash2 className="size-4" />
              </Button>
            </span>
          ))}
      </div>
      <FormMessage compact error={error} />
    </li>
  );
}

function TaskDialog({
  draft,
  assignees,
  vacancies,
  onClose,
  onCloseAutoFocus,
}: {
  draft: Draft;
  assignees: AssigneeDTO[];
  vacancies: VacancyDTO[];
  /** Куда вернуть фокус после закрытия (кнопка, открывшая окно). */
  onCloseAutoFocus: (event: Event) => void;
  onClose: () => void;
}) {
  const timeZone = useTimeZone();
  const [title, setTitle] = useState(draft.title);
  const [dueLocal, setDueLocal] = useState(draft.dueLocal);
  const [assigneeId, setAssigneeId] = useState(draft.assigneeId);
  const [vacancyId, setVacancyId] = useState(draft.vacancyId);
  const [candidate, setCandidate] = useState(draft.candidate);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ id: string; fullName: string; hint: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const requestRef = useRef(0);

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

  function save() {
    setError(null);
    // «Настенное» время из поля — в зоне профиля, перевод только через timezone.ts
    const due = zonedToUtc(dueLocal, timeZone);
    if (Number.isNaN(due.getTime())) {
      setError("Укажите дату и время");
      return;
    }
    start(async () => {
      const result = await saveTaskAction({
        id: draft.id,
        title,
        dueAt: due.toISOString(),
        assigneeId,
        vacancyId,
        candidateId: candidate?.id,
      });
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{draft.id ? "Изменить задание" : "Новое задание"}</DialogTitle>
        </DialogHeader>

        <form
          {...noScriptForm}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="task-due">Срок</Label>
              <Input
                id="task-due"
                type="datetime-local"
                required
                value={dueLocal}
                onChange={(e) => setDueLocal(e.target.value)}
              />
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
                      {a.fullName}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </div>

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
