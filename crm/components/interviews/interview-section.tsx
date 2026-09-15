"use client";

import { CalendarClock, Copy, Check, Video, MapPin } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import {
  proposeSlotsAction,
  submitFeedbackAction,
  transitionInterviewAction,
  type InterviewState,
} from "@/app/actions/interviews";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

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
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size={size} disabled={pending}>
      {pending ? "…" : label}
    </Button>
  );
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
}: {
  applicationId: string;
  interviews: InterviewView[];
  participants: Participant[];
  canManage: boolean;
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
}: {
  applicationId: string;
  interview: InterviewView;
  participants: Participant[];
  canManage: boolean;
}) {
  const [state, setState] = useState<InterviewState>({});
  const [proposing, setProposing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState("");

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
    setState(await submitFeedbackAction({}, formData));
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-md border p-4",
        needsSlots && "border-primary/50",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <CalendarClock className="size-4" />
        <span className="text-sm font-medium">
          {INTERVIEW_TYPE_LABELS[interview.type]}
        </span>
        <Badge variant={needsSlots ? "destructive" : "secondary"}>
          {INTERVIEW_STATUS_LABELS[interview.status]}
        </Badge>
      </div>

      {interview.scheduledAt && (
        <div className="text-sm">
          {formatFull(interview.scheduledAt, interview.timezone)}
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
        </div>
      )}

      {/* Ссылка для кандидата: рассылки пока нет, рекрутер отправляет сам */}
      {state.scheduleUrl && (
        <div className="space-y-2 rounded-md border bg-muted/50 p-3">
          <div className="text-sm font-medium">Ссылка для кандидата</div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs">
              {state.scheduleUrl}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(state.scheduleUrl!);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Действует 7 дней. Кандидат откроет её с телефона и выберет время.
          </p>
        </div>
      )}

      {state.conflicts && state.conflicts.length > 0 && (
        <Alert>
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
      {(interview.status === "CONFIRMED" || interview.status === "COMPLETED") &&
        !interview.feedbackRating && (
          <form action={handleFeedback} className="space-y-2 border-t pt-3">
            <input type="hidden" name="interviewId" value={interview.id} />
            <input type="hidden" name="applicationId" value={applicationId} />
            <Label htmlFor={`rating-${interview.id}`}>Как прошло?</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Select name="rating" value={rating} onValueChange={setRating}>
                <SelectTrigger id={`rating-${interview.id}`}>
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
              placeholder="Что важно запомнить по итогам встречи"
            />
          </form>
        )}

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.ok && !state.scheduleUrl && (
        <Alert>
          <AlertDescription>{state.ok}</AlertDescription>
        </Alert>
      )}
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
    <form action={onSubmit} className="space-y-4 rounded-md border p-3">
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

      <div className="grid gap-3 sm:grid-cols-2">
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

function formatFull(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}
