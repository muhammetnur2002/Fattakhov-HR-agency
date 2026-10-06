import type { RejectionReason } from "@/lib/generated/prisma/enums";
import { REJECTION_REASON_LABELS } from "@/lib/labels";

/**
 * Причины отказов.
 *
 * Это рабочий инструмент, а не отчётность: если половина отказов —
 * «слишком дорогой», значит вилка в брифе разошлась с рынком, и это
 * разговор с клиентом, а не повод искать дальше.
 */
export function RejectionChart({
  rejections,
  emptyText = "Отказов пока не было.",
}: {
  rejections: { reason: RejectionReason; count: number }[];
  emptyText?: string;
}) {
  if (rejections.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  const total = rejections.reduce((sum, r) => sum + r.count, 0);
  const max = Math.max(...rejections.map((r) => r.count));

  return (
    <div className="space-y-2">
      {rejections.map((item) => (
        <div key={item.reason} className="flex items-center gap-3">
          {/*
            min-w-0 вместо shrink-0: подпись задаёт желаемую ширину, но
            уступает её, когда строка не помещается. С shrink-0 она
            держала 12rem намертво, и на узком экране за край уезжало
            число справа — молча, потому что обрезал его overflow
            карточки, а не полоса прокрутки. truncate уже стоял, но без
            min-w-0 внутри flex он не срабатывает: элемент не может стать
            уже своего содержимого.
          */}
          <div className="w-48 min-w-0 truncate text-sm">
            {REJECTION_REASON_LABELS[item.reason]}
          </div>
          <div className="h-5 flex-1 rounded bg-muted">
            <div
              className="h-full rounded bg-foreground/70"
              style={{ width: `${Math.max((item.count / max) * 100, 3)}%` }}
            />
          </div>
          <div className="w-20 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
            {item.count} · {Math.round((item.count / total) * 100)}%
          </div>
        </div>
      ))}
    </div>
  );
}
