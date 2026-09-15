import { z } from "zod";

import { STAGES } from "@/lib/audit/stages";
import { leadSchema } from "./lead";

/**
 * Ответы аудита, пришедшие с клиента.
 *
 * Оценки приходят из браузера, значит их нельзя считать честными:
 * подобрать себе 24 балла и отправить заявку «у нас всё отлично»
 * стоит одного запроса. Поэтому здесь проверяется и диапазон, и то,
 * что номер этапа существует, а сам балл потом пересчитывается на
 * сервере, а не берётся из формы.
 */
export const auditAnswersSchema = z
  .record(
    z.string().regex(/^\d+$/, "Номер этапа должен быть числом"),
    z.union([z.literal(0), z.literal(1), z.literal(2)]),
  )
  .refine(
    (v) => Object.keys(v).every((k) => STAGES.some((s) => s.number === +k)),
    { message: "В ответах есть несуществующий этап" },
  )
  .refine((v) => Object.keys(v).length === STAGES.length, {
    message: "Заполнены не все этапы",
  });

/**
 * Заявка по итогам аудита.
 *
 * Собственную заметку человека храним отдельно от выжимки расчёта:
 * склеиваются они на сервере, и порядок там фиксирован. Иначе
 * достаточно вписать в заметку «Экспресс-аудит: 24 из 24», чтобы
 * рекрутер прочитал подделку как расчёт.
 */
export const auditLeadSchema = leadSchema
  .pick({
    name: true,
    contact: true,
    company: true,
    // Форма аудита собирает те же данные, что и форма на лендинге,
    // значит требует того же согласия
    consent: true,
    marketingConsent: true,
  })
  .extend({
    note: z
      .string()
      .trim()
      .max(1000, "Слишком длинно, максимум 1000 символов")
      .optional()
      .transform((v) => (v ? v : null)),
    answers: auditAnswersSchema,
  });

export type AuditLeadInput = z.infer<typeof auditLeadSchema>;
