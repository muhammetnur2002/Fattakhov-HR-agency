/**
 * Шаблон этапов воронки по умолчанию (ТЗ 5.3).
 *
 * Создаётся для каждой вакансии при её активации. Этапы редактируются
 * под конкретную вакансию, поэтому это именно шаблон, а не справочник.
 *
 * visibleToClient — порог видимости (BR-3). Первые два этапа скрыты:
 * лонг-лист и скрининг — внутренняя работа агентства, клиент видит
 * кандидата начиная с «Представлен».
 */
export const DEFAULT_PIPELINE_STAGES = [
  {
    code: "LONGLIST",
    name: "Лонг-лист",
    order: 1,
    visibleToClient: false,
    isTerminal: false,
    slaHours: null,
  },
  {
    code: "SCREENING",
    name: "Скрининг рекрутера",
    order: 2,
    visibleToClient: false,
    isTerminal: false,
    slaHours: 48,
  },
  {
    code: "PRESENTED",
    name: "Представлен клиенту",
    order: 3,
    visibleToClient: true,
    isTerminal: false,
    slaHours: 72,
  },
  {
    code: "CLIENT_INTERVIEW",
    name: "Интервью с клиентом",
    order: 4,
    visibleToClient: true,
    isTerminal: false,
    slaHours: 120,
  },
  {
    code: "FINAL",
    name: "Финальный этап / тестовое",
    order: 5,
    visibleToClient: true,
    isTerminal: false,
    slaHours: 120,
  },
  {
    code: "OFFER",
    name: "Оффер",
    order: 6,
    visibleToClient: true,
    isTerminal: false,
    slaHours: 72,
  },
  {
    code: "HIRED",
    name: "Вышел на работу",
    order: 7,
    visibleToClient: true,
    isTerminal: true,
    slaHours: null,
  },
] as const;

export type PipelineStageTemplate = (typeof DEFAULT_PIPELINE_STAGES)[number];
export type PipelineStageCode = PipelineStageTemplate["code"];
