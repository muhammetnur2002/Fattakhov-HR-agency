"use client";

import { useActionState, useState, type RefObject } from "react";

import {
  activateVacancyAction,
  agencyTransitionAction,
  assignRecruitersAction,
  clarifyVacancyAction,
  estimateVacancyAction,
  saveAgencyNotesAction,
  type AgencyVacancyState,
} from "@/app/(agency)/a/vacancies/actions";
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
import { DeleteVacancies } from "@/components/vacancies/delete-vacancies";
import type { VacancyStatus } from "@/lib/generated/prisma/enums";
import { panelClass } from "@/components/ui/panel";
import { FormMessage } from "@/components/ui/form-message";
import { useFormAction } from "@/lib/hooks/use-form-action";

type Recruiter = {
  id: string;
  fullName: string;
  /** Активных вакансий на человеке. */
  vacancies: number;
  /** Кандидатов в работе по ним. */
  candidates: number;
};

/** «3 вакансии · 12 кандидатов» — то, чего не хватало при выборе. */
function describeLoad(r: Recruiter): string {
  if (r.vacancies === 0) return "свободен";
  const vacancies = `${r.vacancies} ${pluralVacancies(r.vacancies)}`;
  return r.candidates > 0
    ? `${vacancies} · ${r.candidates} ${pluralCandidates(r.candidates)}`
    : vacancies;
}

function pluralVacancies(n: number): string {
  const last = n % 10;
  const teen = n % 100 >= 11 && n % 100 <= 14;
  if (!teen && last === 1) return "вакансия";
  if (!teen && last >= 2 && last <= 4) return "вакансии";
  return "вакансий";
}

function pluralCandidates(n: number): string {
  const last = n % 10;
  const teen = n % 100 >= 11 && n % 100 <= 14;
  if (!teen && last === 1) return "кандидат";
  if (!teen && last >= 2 && last <= 4) return "кандидата";
  return "кандидатов";
}

// Как и у ClientForm: Radix не даёт пустую строку как значение пункта,
// а «Не назначен» на сервере должен превратиться в пустую строку.
const NO_RECRUITER = "__none__";

function Submit({
  label,
  variant = "default",
  size = "sm",
  loading,
}: {
  label: string;
  variant?: "default" | "outline";
  size?: "sm" | "default";
  /** Форма уходит через useFormAction: useFormStatus её не видит. */
  loading?: boolean;
}) {
  return (
    <SubmitButtonBase size={size} variant={variant} loading={loading}>
      {label}
    </SubmitButtonBase>
  );
}

/**
 * Результат под формой. Плашка стоит вне формы, поэтому ссылка из `useFormAction` (`messageRef`) обязательна
 * там, где форма идёт через хук: иначе после общего отказа фокус не дойдёт до плашки.
 */
function Feedback({
  state,
  messageRef,
}: {
  state: AgencyVacancyState;
  messageRef?: RefObject<HTMLElement | null>;
}) {
  return <FormMessage ref={messageRef} error={state.error} ok={state.ok} />;
}

/**
 * Приёмка заявки: три исхода — взять в работу, назвать сроки, задать вопросы.
 * Показывается только пока заявка не запущена.
 */
export function VacancyIntake({
  vacancyId,
  status,
  recruiters = [],
  canAssign = false,
}: {
  vacancyId: string;
  status: VacancyStatus;
  /** С нагрузкой — чтобы выбирать ведущего осознанно, не открывая аналитику. */
  recruiters?: Recruiter[];
  /** Право назначать: у аккаунт-менеджера приёмка есть, а назначения нет. */
  canAssign?: boolean;
}) {
  const [activateState, activate] = useActionState<AgencyVacancyState, FormData>(
    activateVacancyAction,
    {},
  );
  // Вопрос и сроки набираются текстом: React 19 стирал их после любого ответа сервера, в том числе
  // отказа («Вопрос слишком короткий»), а useFormAction оставляет
  const estimateForm = useFormAction<AgencyVacancyState>(estimateVacancyAction, {});
  const clarifyForm = useFormAction<AgencyVacancyState>(clarifyVacancyAction, {});
  const [mode, setMode] = useState<"none" | "estimate" | "clarify">("none");
  const [lead, setLead] = useState(NO_RECRUITER);

  const canIntake = ["SUBMITTED", "CLARIFYING", "ESTIMATED"].includes(status);
  if (!canIntake) return null;

  // Правила воронки заявки (ТЗ 6.1): пока клиент не ответил на вопросы,
  // взять заявку в работу и назвать сроки нельзя — она вернётся на
  // рассмотрение, когда клиент поправит бриф и отправит её заново
  if (status === "CLARIFYING") {
    return (
      <p className="text-sm text-muted-foreground">
        Вопросы отправлены, ждём клиента. Он уточнит бриф и отправит заявку заново — после этого её можно будет взять в
        работу или назвать сроки.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <form action={activate} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="vacancyId" value={vacancyId} />

          {/* Ведущий выбирается здесь же: запуск без ответственного —
              самый тихий способ потерять вакансию на неделю */}
          {canAssign && recruiters.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="intakeLead" className="text-xs">
                Ведущий рекрутер
              </Label>
              <input
                type="hidden"
                name="leadRecruiterId"
                value={lead === NO_RECRUITER ? "" : lead}
              />
              <Select value={lead} onValueChange={setLead}>
                <SelectTrigger id="intakeLead" size="sm" className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_RECRUITER}>Выбрать позже</SelectItem>
                  {recruiters.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.fullName} · {describeLoad(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Submit label="Взять в работу" />
        </form>

        {status === "SUBMITTED" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setMode(mode === "estimate" ? "none" : "estimate")}
          >
            Назвать сроки
          </Button>
        )}

        {status === "SUBMITTED" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setMode(mode === "clarify" ? "none" : "clarify")}
          >
            Задать вопросы
          </Button>
        )}
      </div>

      {/* Вопрос пишется здесь же: отдельный поход в обсуждение ради
          одной фразы — самый частый способ его вовсе не задать */}
      {mode === "clarify" && status === "SUBMITTED" && (
        <form {...clarifyForm.formProps} className={panelClass("plain", "space-y-4")}>
          <input type="hidden" name="vacancyId" value={vacancyId} />
          <div className="space-y-2">
            <Label htmlFor="question">Что нужно уточнить</Label>
            <Textarea
              id="question"
              name="question"
              rows={3}
              required
              placeholder="Например: какой бюджет по вилке и кто принимает решение по кандидатам?"
            />
            <p className="text-xs text-muted-foreground">
              Вопрос появится в обсуждении вакансии — клиент увидит его
              вместе со статусом «уточняем детали».
            </p>
          </div>
          <div className="flex gap-2">
            <Submit label="Отправить вопрос" loading={clarifyForm.pending} />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setMode("none")}
            >
              Отмена
            </Button>
          </div>
        </form>
      )}

      {/* Сроки уже названы — форму прячем, иначе она висит открытой
          после успешной отправки */}
      {mode === "estimate" && status === "SUBMITTED" && (
        <form {...estimateForm.formProps} className={panelClass("plain", "space-y-4")}>
          <input type="hidden" name="vacancyId" value={vacancyId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="estimatedFirstCandidatesAt">
                Первые кандидаты к
              </Label>
              <Input
                id="estimatedFirstCandidatesAt"
                name="estimatedFirstCandidatesAt"
                type="date"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimatedCloseAt">Ожидаемое закрытие</Label>
              <Input id="estimatedCloseAt" name="estimatedCloseAt" type="date" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Дата первых кандидатов обязательна — именно её увидит клиент
            в своём кабинете.
          </p>
          <Submit label="Отправить клиенту" loading={estimateForm.pending} />
        </form>
      )}

      <Feedback state={activateState} />
      <Feedback state={estimateForm.state} messageRef={estimateForm.messageRef} />
      <Feedback state={clarifyForm.state} messageRef={clarifyForm.messageRef} />
    </div>
  );
}

/** Пауза, закрытие и возврат в работу. */
export function VacancyStatusActions({
  vacancyId,
  status,
  canDelete = false,
}: {
  vacancyId: string;
  status: VacancyStatus;
  /** Закрытую вакансию можно убрать из списков — право vacancy.delete. */
  canDelete?: boolean;
}) {
  // Кнопки «приостановить» и «вернуть в работу» — формы без полей (action); причина закрытия набирается
  // текстом и не должна пропадать, если сервер отказал
  const { state, pending, formAction, formProps, messageRef } = useFormAction<AgencyVacancyState>(
    agencyTransitionAction,
    {},
  );
  const [closing, setClosing] = useState<null | "CLOSED_FAILED" | "CLOSED_CANCELLED">(
    null,
  );

  const isClosed = status.startsWith("CLOSED_");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "ACTIVE" && (
          <>
            <form action={formAction}>
              <input type="hidden" name="vacancyId" value={vacancyId} />
              <input type="hidden" name="to" value="ON_HOLD" />
              <Submit label="Приостановить" variant="outline" />
            </form>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setClosing("CLOSED_FAILED")}
            >
              Закрыть без найма
            </Button>
          </>
        )}

        {status === "ON_HOLD" && (
          <form action={formAction}>
            <input type="hidden" name="vacancyId" value={vacancyId} />
            <input type="hidden" name="to" value="ACTIVE" />
            <Submit label="Возобновить" variant="outline" />
          </form>
        )}

        {isClosed && (
          <form action={formAction}>
            <input type="hidden" name="vacancyId" value={vacancyId} />
            <input type="hidden" name="to" value="ACTIVE" />
            <Submit label="Вернуть в работу" variant="outline" />
          </form>
        )}

        {isClosed && canDelete && (
          <DeleteVacancies
            ids={[vacancyId]}
            label="Удалить вакансию"
            question="Удалить эту вакансию из списков? Отчёты и счета за прошлое не изменятся."
            redirectTo="/a/vacancies"
            variant="ghost"
          />
        )}
      </div>

      {closing && (
        <form {...formProps} className={panelClass("plain", "space-y-2")}>
          <input type="hidden" name="vacancyId" value={vacancyId} />
          <input type="hidden" name="to" value={closing} />
          <Label htmlFor="closeReason">Причина закрытия</Label>
          <Input
            id="closeReason"
            name="closeReason"
            required
            placeholder="Клиент заморозил найм до конца квартала"
          />
          <p className="text-xs text-muted-foreground">
            Попадёт в аналитику: по причинам видно, где агентство теряет
            вакансии.
          </p>
          <div className="flex gap-2">
            <Submit label="Закрыть" loading={pending} />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setClosing(null)}
            >
              Отмена
            </Button>
          </div>
        </form>
      )}

      <Feedback state={state} messageRef={messageRef} />
    </div>
  );
}

export function AssignRecruitersForm({
  vacancyId,
  recruiters,
  leadRecruiterId,
  recruiterIds,
}: {
  vacancyId: string;
  recruiters: Recruiter[];
  leadRecruiterId: string | null;
  recruiterIds: string[];
}) {
  const { state, pending, formProps } = useFormAction<AgencyVacancyState>(assignRecruitersAction, {});
  const [leadRecruiter, setLeadRecruiter] = useState(
    leadRecruiterId ?? NO_RECRUITER,
  );

  return (
    // key по текущему составу: после сохранения сервер присылает новые
    // значения, но defaultValue у несмонтированной заново формы их не
    // подхватит — и селект показывал бы «не назначен» при назначенном
    <form
      key={`${leadRecruiterId ?? "none"}:${recruiterIds.join(",")}`}
      {...formProps}
      className="space-y-4"
    >
      <input type="hidden" name="vacancyId" value={vacancyId} />

      <div className="space-y-2">
        <Label htmlFor="leadRecruiterId">Ведущий рекрутер</Label>
        <input
          type="hidden"
          name="leadRecruiterId"
          value={leadRecruiter === NO_RECRUITER ? "" : leadRecruiter}
        />
        <Select value={leadRecruiter} onValueChange={setLeadRecruiter}>
          <SelectTrigger id="leadRecruiterId" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_RECRUITER}>Не назначен</SelectItem>
            {recruiters.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.fullName} · {describeLoad(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Его имя и контакт видит клиент в своём кабинете.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Команда</legend>
        {recruiters.map((r) => (
          <label key={r.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="recruiterIds"
              value={r.id}
              defaultChecked={recruiterIds.includes(r.id)}
              className="size-4"
            />
            {r.fullName}
            <span className="text-xs text-muted-foreground">
              {describeLoad(r)}
            </span>
          </label>
        ))}
      </fieldset>

      <Submit label="Сохранить" loading={pending} />
      <Feedback state={state} />
    </form>
  );
}

/** Внутренние заметки — клиенту не видны (BR-3, поле agencyNotes). */
export function AgencyNotesForm({
  vacancyId,
  notes,
}: {
  vacancyId: string;
  notes: string | null;
}) {
  // Заметки набирают долго: после отказа сервера они остаются в поле
  const { state, pending, formProps } = useFormAction<AgencyVacancyState>(saveAgencyNotesAction, {});

  return (
    <form {...formProps} className="space-y-4">
      <input type="hidden" name="vacancyId" value={vacancyId} />
      <Textarea
        name="agencyNotes"
        rows={5}
        defaultValue={notes ?? ""}
        placeholder="Что клиент сказал голосом, где реальные границы вилки, кого уже показывали…"
      />
      <p className="text-xs text-muted-foreground">
        Видно только агентству. Клиент этих заметок не увидит никогда.
      </p>
      <Submit label="Сохранить заметки" loading={pending} />
      <Feedback state={state} />
    </form>
  );
}
