"use client";

import { Camera, FileText, ImageIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Fail closed: no file picker or upload until scanning and moderation are commissioned. */
export function AttachmentMenu() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 rounded-full" aria-label="Добавить вложение">
          <Plus className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Добавить вложение</DialogTitle>
          <DialogDescription>Отправка вложений пока недоступна: настраиваем проверку безопасности файлов и изображений.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          {[{ icon: FileText, label: "Файл" }, { icon: ImageIcon, label: "Изображение" }, { icon: Camera, label: "Камера" }].map(({ icon: Icon, label }) => (
            <button key={label} type="button" disabled className="flex min-w-0 flex-col items-center gap-2 rounded-xl border px-2 py-4 text-sm text-muted-foreground disabled:cursor-not-allowed">
              <Icon className="size-6" />{label}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
