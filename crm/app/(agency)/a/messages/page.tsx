import { MessageSquare } from "lucide-react";

export const metadata = { title: "Сообщения" };

/** Ничего не выбрано — список диалогов слева, здесь только подсказка. */
export default function AgencyMessagesPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="grid size-12 place-items-center rounded-2xl border bg-muted/40">
        <MessageSquare className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <p className="max-w-[32ch] text-sm text-muted-foreground">
        Выберите диалог слева, чтобы посмотреть переписку.
      </p>
    </div>
  );
}
