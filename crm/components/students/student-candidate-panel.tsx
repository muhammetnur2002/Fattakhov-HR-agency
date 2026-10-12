"use client";

import { useState, useTransition } from "react";

import {
  offerWorkAction,
  sendStudentMessageAction,
  type StudentActionState,
} from "@/app/(agency)/a/candidates/student-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormMessage } from "@/components/ui/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export type ChatRow = {
  id: string;
  author: "STUDENT" | "AGENCY";
  staffName: string | null;
  body: string;
  createdAt: string;
};

export type VacancyChoice = { id: string; label: string; title: string };

function when(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Текст предложения по умолчанию (тот же, что defaultOfferText на сервере). */
function offerText(studentName: string, vacancyTitle: string): string {
  const first = studentName.trim().split(/\s+/)[0] || "";
  return `${first ? `${first}, здравствуйте` : "Здравствуйте"}! Предлагаем вам вакансию «${vacancyTitle}». Откликнетесь?`;
}

/**
 * «Предложить работу»: вакансия из CRM, кандидат встаёт в её воронку, студенту
 * уходит сообщение в чат платформы. Текст можно поправить или убрать совсем:
 * без текста кандидат просто попадает в воронку.
 */
export function OfferWorkCard({
  candidateId,
  studentName,
  vacancies,
}: {
  candidateId: string;
  studentName: string;
  vacancies: VacancyChoice[];
}) {
  const [vacancyId, setVacancyId] = useState("");
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);
  const [state, setState] = useState<StudentActionState>({});
  const [pending, startTransition] = useTransition();

  function pick(id: string) {
    setVacancyId(id);
    const vacancy = vacancies.find((v) => v.id === id);
    // Пока сотрудник не правил текст, он следует за выбранной вакансией
    if (vacancy && !touched) setMessage(offerText(studentName, vacancy.title));
  }

  function submit() {
    setState({});
    startTransition(async () => {
      const result = await offerWorkAction({ candidateId, vacancyId, message });
      setState(result);
      if (result.ok) {
        setVacancyId("");
        setMessage("");
        setTouched(false);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Предложить работу</CardTitle>
        <CardDescription>
          Кандидат встанет в воронку выбранной вакансии на первый этап. Студент получит
          сообщение в своём кабинете и по почте.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {vacancies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Нет запущенных вакансий, куда его ещё можно предложить.
          </p>
        ) : (
          <>
            <select
              aria-label="Вакансия"
              value={vacancyId}
              onChange={(event) => pick(event.target.value)}
              className="h-9 w-full rounded-lg border border-field bg-background px-3 text-sm"
            >
              <option value="">Выберите вакансию…</option>
              {vacancies.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
            <Textarea
              aria-label="Сообщение студенту"
              placeholder="Сообщение студенту (можно оставить пустым)"
              value={message}
              maxLength={2000}
              rows={3}
              onChange={(event) => {
                setTouched(true);
                setMessage(event.target.value);
              }}
            />
            <Button type="button" size="sm" loading={pending} disabled={!vacancyId} onClick={submit}>
              {pending ? "Отправляем…" : "Предложить"}
            </Button>
          </>
        )}
        <FormMessage error={state.error} ok={state.ok} />
        {state.warning && (
          <Alert variant="warning">
            <AlertDescription>{state.warning}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Переписка со студентом. Студент видит её в разделе «Сообщения» своего кабинета
 * на студенческой платформе; ответы приходят уведомлением тем, кто с ним работает.
 */
export function StudentChatCard({
  candidateId,
  messages,
  platformError,
}: {
  candidateId: string;
  messages: ChatRow[];
  /** Платформа не ответила: переписку показать нельзя, писать тоже. */
  platformError?: string;
}) {
  const [body, setBody] = useState("");
  const [state, setState] = useState<StudentActionState>({});
  const [pending, startTransition] = useTransition();

  function send() {
    setState({});
    startTransition(async () => {
      const result = await sendStudentMessageAction({ candidateId, body });
      setState(result);
      if (result.ok) setBody("");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Переписка со студентом
          <Badge variant="outline">через студплатформу</Badge>
        </CardTitle>
        <CardDescription>
          Студент отвечает в своём кабинете. Телефон и почта студента здесь не показываются.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {platformError ? (
          <Alert variant="destructive">
            <AlertDescription>{platformError}</AlertDescription>
          </Alert>
        ) : (
          <>
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Вы ещё не писали этому студенту. Первое сообщение откроет беседу.
              </p>
            ) : (
              <ul className="space-y-2">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={
                      m.author === "STUDENT"
                        ? "rounded-lg border border-primary/40 p-3 text-sm"
                        : "rounded-lg border bg-muted/40 p-3 text-sm"
                    }
                  >
                    <div className="mb-1 text-xs text-muted-foreground">
                      {m.author === "STUDENT" ? "Студент" : `${m.staffName ?? "Агентство"} (агентство)`} ·{" "}
                      {when(m.createdAt)}
                    </div>
                    <div className="whitespace-pre-line break-words">{m.body}</div>
                  </li>
                ))}
              </ul>
            )}

            <Textarea
              aria-label="Сообщение студенту"
              placeholder="Написать студенту…"
              value={body}
              maxLength={2000}
              rows={3}
              onChange={(event) => setBody(event.target.value)}
            />
            <Button type="button" size="sm" loading={pending} disabled={!body.trim()} onClick={send}>
              {pending ? "Отправляем…" : "Отправить"}
            </Button>
            <FormMessage error={state.error} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
