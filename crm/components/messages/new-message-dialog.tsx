"use client";

import { PenSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { describeUser } from "./direct-conversation-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Correspondent } from "@/lib/services/messages";
import type { UserRole } from "@/lib/generated/prisma/enums";

/**
 * Выбор, кому написать.
 *
 * Список приходит готовым с сервера и фильтруется здесь: людей,
 * которым можно писать, — десятки, а не тысячи, и гонять за ними
 * на сервер на каждую букву незачем. Кто попадает в список, решает
 * lib/services/messages — сотрудник одного клиента не увидит здесь
 * сотрудников другого.
 */
export function NewMessageDialog({
  correspondents,
  hrefBase,
}: {
  correspondents: Correspondent[];
  /** "" для клиента (/messages), "/a" для агентства. */
  hrefBase: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const found = q
    ? correspondents.filter(
        (c) =>
          c.fullName.toLowerCase().includes(q) ||
          (c.clientName ?? "агентство").toLowerCase().includes(q) ||
          (c.position ?? "").toLowerCase().includes(q),
      )
    : correspondents;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PenSquare className="size-4" />
          Написать
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Кому написать</DialogTitle>
        </DialogHeader>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Имя, компания или должность"
          aria-label="Поиск по людям"
          autoFocus
        />

        <div className="max-h-80 space-y-1 overflow-y-auto">
          {found.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {correspondents.length === 0
                ? "Писать пока некому: в кабинете нет других людей."
                : "Никого не нашли по этому запросу."}
            </p>
          ) : (
            found.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(`${hrefBase}/messages/${c.id}`);
                }}
                className="w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-muted"
              >
                <div className="font-medium">{c.fullName}</div>
                <div className="text-xs text-muted-foreground">
                  {describeUser(c.role as UserRole, c.clientName)}
                  {c.position ? ` · ${c.position}` : ""}
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
