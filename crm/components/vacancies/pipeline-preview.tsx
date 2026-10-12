import { DEFAULT_PIPELINE_STAGES } from "@/lib/services/pipeline-stages";

/**
 * Воронка до запуска вакансии: те же семь колонок, пустые и серые.
 *
 * Этапы создаются в момент перевода вакансии «В работу». До этого вкладка
 * «Воронка» пропадала, и казалось, что воронки у вакансии нет. Здесь она
 * видна всегда, а до запуска показывает, какие колонки появятся, и без
 * кнопок: посадить кого-то на несуществующий этап нельзя.
 */
export function PipelinePreview() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Колонки включатся, когда вы возьмёте вакансию в работу.
      </p>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Этапы воронки">
        {DEFAULT_PIPELINE_STAGES.map((stage) => (
          <li
            key={stage.code}
            className="flex items-center justify-between gap-2 rounded-lg border border-dashed bg-muted/40 px-3 py-3 text-sm text-muted-foreground"
          >
            <span>{stage.name}</span>
            <span className="tabular-nums">0</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
