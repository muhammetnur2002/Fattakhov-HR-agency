"use client";

import { CalendarClock, Video, MapPin } from "lucide-react";
import { useRef, useState } from "react";

import {
  proposeSlotsAction,
  submitFeedbackAction,
  transitionInterviewAction,
  type InterviewState,
} from "@/app/actions/interviews";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormMessage } from "@/components/ui/form-message";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  InterviewFormat,
  InterviewStatus,
} from "@/lib/generated/prisma/enums";
import { INTERVIEW_STATUS_LABELS, INTERVIEW_TYPE_LABELS } from "@/lib/labels";
import { INTERVIEW_STATUS_TONE } from "@/lib/status-tones";
import { Panel, panelClass } from "@/components/ui/panel";
import { formatInZone } from "@/lib/format-date";
import { CopyButton } from "@/components/shared/copy-button";
import { useConfirmFocus } from "@/lib/hooks/use-return-focus";

export type InterviewView = {
  id: string;
  type: keyof typeof INTERVIEW_TYPE_LABELS;
  status: InterviewStatus;
  format: InterviewFormat;
  scheduledAt: string | null;
  durationMinutes: number;
  timezone: string;
  meetingUrl: string | null;
  address: string | null;
  feedbackRating: number | null;
  feedbackNote: string | null;
  slots: { id: string; startsAt: string; isSelected: boolean }[];
};

export type Participant = { id: string; fullName: string };

function Submit({ label, size = "sm" }: { label: string; size?: "sm" | "lg" }) {
  return <SubmitButtonBase size={size}>{label}</SubmitButtonBase>;
}

/**
 * Встречи по кандидату.
 *
 * Главное здесь — задача «предложить слоты»: она появляется, как только
 * клиент нажал «пригласить на интервью», и висит, пока рекрутер не
 * пришлёт времена. Это тот шаг, на котором обычно теряются дни.
 */
export function InterviewSection({
  applicationId,
  interviews,
  participants,
  canManage,
  now,
}: {
  applicationId: string;
  interviews: InterviewView[];
  participants: Participant[];
  canManage: boolean;
  /**
   * Момент отрисовки со страницы (мс). Часы не берутся здесь: в клиентском компоненте
   * сервер и гидратация увидели бы разные «сейчас», как в CalendarView.
   */
  now: number;
}) {
  if (interviews.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Встреч пока нет. Они появятся, когда клиент пригласит кандидата
        на интервью.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {interviews.map((interview) => (
        <InterviewCard
          key={interview.id}
          applicationId={applicationId}
          interview={interview}
          participants={participants}
          canManage={canManage}
          now={now}
        />
      ))}
    </div>
  );
}

function InterviewCard({
  applicationId,
  interview,
  participants,
  canManage,
  now,
}: {
  applicationId: string;
  interview: InterviewView;
  participants: Participant[];
  canManage: boolean;
  now: number;
}) {
  const [state, setState] = useState<InterviewState>({});
  const [proposing, setProposing] = useState(false);
  const scheduleUrlRef = useRef<HTMLElement>(null);
  const [rating, setRating] = useState("");
  const [editingFeedback, setEditingFeedback] = useState(false);
  // «Изменить оценку» пропадает, пока на её месте форма: фокус — на выбор оценки, после «Отмены» или
  // сохранения — обратно на кнопку. Форме в этом режиме название даёт её вопрос «Как прошло?»
  const { triggerRef, focusRef, questionId } = useConfirmFocus(editingFeedback);

  // Оценку спрашиваем только у встречи, которая уже прошла (так же, как в календаре):
  // у будущей такой вопрос выглядит как ошибка интерфейса. Закрытая встреча — всегда
  const isPast = interview.scheduledAt != null && new Date(interview.scheduledAt).getTime() < now;
  const canGiveFeedback =
    interview.status === "COMPLETED" || (interview.status === "CONFIRMED" && isPast);

  const needsSlots =
    interview.status === "SLOTS_REQUESTED" ||
    interview.status === "RESCHEDULE_REQUESTED";

  async function handlePropose(formData: FormData) {
    const result = await proposeSlotsAction({}, formData);
    setState(result);
    if (result.ok) setProposing(false);
  }

  async function handleTransition(formData: FormData) {
    setState(await transitionInterviewAction({}, formData));
  }

  async function handleFeedback(formData: FormData) {
    const result = await submitFeedbackAction({}, formData);
    setState(result);
    if (result.ok) setEditingFeedback(false);
  }

  return (
    <div className={panelClass("plain", needsSlots ? "border-primary/50" : undefined)}>
      <div className="flex flex-wrap items-center gap-2">
        <CalendarClock className="size-4" />
        <span className="text-sm font-medium">
          {INTERVIEW_TYPE_LABELS[interview.type]}
        </span>
        <StatusBadge tone={INTERVIEW_STATUS_TONE[interview.status]}>
          {INTERVIEW_STATUS_LABELS[interview.status]}
        </StatusBadge>
      </div>

      {interview.scheduledAt && (
        <div className="text-sm">
          {formatInZone(interview.scheduledAt, "weekdayShortDayMonthTime", interview.timezone)}
          <span className="text-muted-foreground">
            {" · "}
            {interview.durationMinutes} мин
          </span>
        </div>
      )}

      {interview.status === "SLOTS_PROPOSED" && (
        <div className="text-sm text-muted-foreground">
          Кандидат выбирает из {interview.slots.length} вариантов.
        </div>
      )}

      {(interview.meetingUrl || interview.address) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {interview.format === "ONLINE" ? (
            <>
              <Video className="size-4" />
              <a
                href={interview.meetingUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate underline underline-offset-2"
              >
                {interview.meetingUrl}
              </a>
            </>
          ) : (
            <>
              <MapPin className="size-4" />
              {interview.address}
            </>
          )}
        </div>
      )}

      {interview.feedbackRating && (
        <div className="rounded-md bg-muted p-3 text-sm">
          <div className="font-medium">Оценка: {interview.feedbackRating} из 5</div>
          {interview.feedbackNote && (
            <p className="mt-1 whitespace-pre-line">{interview.feedbackNote}</p>
          )}
          {/* Нажали не ту оценку — исправить можно: она идёт в аналитику клиента */}
          {canGiveFeedback && !editingFeedback && (
            <Button
              ref={triggerRef}
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 -ml-2.5"
              onClick={() => {
                setRating(String(interview.feedbackRating));
                setEditingFeedback(true);
              }}
            >
              Изменить оценку
            </Button>
          )}
        </div>
      )}

      {/* Ссылка для кандидата: рассылки пока нет, рекрутер отправляет сам */}
      {state.scheduleUrl && (
        <Panel tone="muted">
          <div className="text-sm font-medium">Ссылка для кандидата</div>
          <div className="flex items-center gap-2">
            <code
              ref={scheduleUrlRef}
              className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs"
            >
              {state.scheduleUrl}
            </code>
            <CopyButton
              text={state.scheduleUrl}
              targetRef={scheduleUrlRef}
              iconOnly
              ariaLabel="Скопировать ссылку для кандидата"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Действует 7 дней. Кандидат откроет её с телефона и выберет время.
          </p>
        </Panel>
      )}

      {state.conflicts && state.conflicts.length > 0 && (
        // Предупреждение, а не обычная плашка: треугольник. Появляется после отправки формы встречи, поэтому
        // role="alert" (вставленный с текстом status объявляется не везде)
        <Alert variant="warning" role="alert">
          <AlertDescription>
            <div className="font-medium">Возможные накладки</div>
            {state.conflicts.map((c) => (
              <div key={c} className="text-sm">
                {c}
              </div>
            ))}
            <div className="mt-1 text-xs text-muted-foreground">
              Не блокируем — решать вам.
            </div>
          </AlertDescription>
        </Alert>
      )}

      {canManage && (
        <div className="flex flex-wrap gap-2">
          {(needsSlots || interview.status === "SLOTS_PROPOSED") && (
            <Button
              type="button"
              size="sm"
              variant={needsSlots ? "default" : "outline"}
              onClick={() => setProposing(!proposing)}
            >
              {interview.status === "SLOTS_PROPOSED"
                ? "Другие варианты"
                : "Предложить время"}
            </Button>
          )}

          {interview.status === "CONFIRMED" && (
            <>
              <form action={handleTransition}>
                <input type="hidden" name="interviewId" value={interview.id} />
                <input type="hidden" name="applicationId" value={applicationId} />
                <input type="hidden" name="to" value="RESCHEDULE_REQUESTED" />
                <Submit label="Перенести" />
              </form>
              <form action={handleTransition}>
                <input type="hidden" name="interviewId" value={interview.id} />
                <input type="hidden" name="applicationId" value={applicationId} />
                <input type="hidden" name="to" value="NO_SHOW" />
                <Submit label="Не пришёл" />
              </form>
            </>
          )}
        </div>
      )}

      {proposing && canManage && (
        <SlotForm
          applicationId={applicationId}
          interviewId={interview.id}
          participants={participants}
          onSubmit={handlePropose}
        />
      )}

      {/* Обратная связь: после встречи её ждут от того, кто на ней был */}
      {canGiveFeedback && (!interview.feedbackRating || editingFeedback) && (
          <form
            action={handleFeedback}
            aria-labelledby={editingFeedback ? questionId : undefined}
            className="space-y-2 border-t pt-3"
          >
            <input type="hidden" name="interviewId" value={interview.id} />
            <input type="hidden" name="applicationId" value={applicationId} />
            <Label id={questionId} htmlFor={`rating-${interview.id}`}>
              Как прошло?
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Select name="rating" value={rating} onValueChange={setRating}>
                <SelectTrigger ref={focusRef} id={`rating-${interview.id}`}>
                  <SelectValue placeholder="Оценка" />
                </SelectTrigger>
                <SelectContent>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} из 5
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Submit label="Сохранить" />
            </div>
            <Textarea
              name="note"
              rows={2}
              defaultValue={editingFeedback ? (interview.feedbackNote ?? "") : undefined}
              placeholder="Что важно запомнить по итогам встречи"
            />
            {editingFeedback && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingFeedback(false)}>
                Отмена
              </Button>
            )}
          </form>
        )}

      <FormMessage error={state.error} ok={state.scheduleUrl ? null : state.ok} />
    </div>
  );
}

const TIMEZONES = [
  "Europe/Kaliningrad",
  "Europe/Moscow",
  "Asia/Yekaterinburg",
  "Asia/Krasnoyarsk",
  "Asia/Vladivostok",
];

function SlotForm({
  applicationId,
  interviewId,
  participants,
  onSubmit,
}: {
  applicationId: string;
  interviewId: string;
  participants: Participant[];
  onSubmit: (formData: FormData) => Promise<void>;
}) {
  // Три поля по умолчанию: два это минимум, третье обычно тоже заполняют
  const [slotCount, setSlotCount] = useState(3);
  const [format, setFormat] = useState<InterviewFormat>("ONLINE");

  return (
    <form action={onSubmit} className={panelClass("plain", "space-y-4")}>
      <input type="hidden" name="interviewId" value={interviewId} />
      <input type="hidden" name="applicationId" value={applicationId} />

      <div className="space-y-2">
        <Label>Варианты времени</Label>
        {Array.from({ length: slotCount }).map((_, i) => (
          <Input key={i} type="datetime-local" name="slot" required={i < 2} />
        ))}
        <div className="flex gap-2">
          {slotCount < 5 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSlotCount(slotCount + 1)}
            >
              + вариант
            </Button>
          )}
          {slotCount > 2 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSlotCount(slotCount - 1)}
            >
              − вариант
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          От двух до пяти. Один вариант — это не выбор, а ультиматум.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="timezone">Часовой пояс</Label>
          <Select name="timezone" defaultValue="Europe/Moscow">
            <SelectTrigger id="timezone" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="durationMinutes">Длительность, мин</Label>
          <Input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            defaultValue={60}
            min={15}
            step={15}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="format">Формат</Label>
          <Select
            name="format"
            value={format}
            onValueChange={(v) => setFormat(v as InterviewFormat)}
          >
            <SelectTrigger id="format" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ONLINE">Онлайн</SelectItem>
              <SelectItem value="OFFICE">В офисе</SelectItem>
              <SelectItem value="PHONE">По телефону</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          {format === "ONLINE" ? (
            <>
              <Label htmlFor="meetingUrl">Ссылка на встречу</Label>
              <Input
                id="meetingUrl"
                name="meetingUrl"
                placeholder="https://telemost.yandex.ru/…"
              />
            </>
          ) : (
            <>
              <Label htmlFor="address">Адрес</Label>
              <Input id="address" name="address" placeholder="Казань, ул. …" />
            </>
          )}
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Кто будет на встрече</legend>
        {participants.map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="participantUserIds"
              value={p.id}
              className="size-4"
            />
            {p.fullName}
          </label>
        ))}
        <p className="text-xs text-muted-foreground">
          Их имена увидит кандидат, а встреча попадёт в их календарь.
        </p>
      </fieldset>

      <Submit label="Сохранить и получить ссылку" size="lg" />
    </form>
  );
}
