"use client";

import { Check, FileText, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { decideStudyReviewAction } from "./actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { studentsFileProxyUrl } from "@/lib/students-file-url";
import type { PendingStudyStudent } from "@/lib/students-service";

export function StudyBoard({ students: initial }: { students: PendingStudyStudent[] }) {
  const router = useRouter();
  const [students, setStudents] = useState(initial);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  async function decide(student: PendingStudyStudent, decision: "APPROVE" | "REJECT", note?: string): Promise<boolean> {
    setBusy((current) => new Set(current).add(student.id));
    try {
      const result = await decideStudyReviewAction({ studentId: student.id, decision, note });
      if (result.error) {
        toast.error(result.error);
        return false;
      }
      setStudents((list) => list.filter((s) => s.id !== student.id));
      toast.success(decision === "APPROVE" ? "Учёба подтверждена" : "Справка возвращена студенту");
      router.refresh();
      return true;
    } catch {
      toast.error("Не удалось сохранить решение — проверьте соединение");
      return false;
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(student.id);
        return next;
      });
    }
  }

  if (students.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Справок на проверке нет.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {students.map((student) => (
        <StudentCard
          key={student.id}
          student={student}
          busy={busy.has(student.id)}
          onDecide={(decision, note) => decide(student, decision, note)}
        />
      ))}
    </div>
  );
}

function StudentCard({
  student,
  busy,
  onDecide,
}: {
  student: PendingStudyStudent;
  busy: boolean;
  onDecide: (decision: "APPROVE" | "REJECT", note?: string) => Promise<boolean>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();

  async function reject() {
    if (note.trim().length < 5) {
      setError("Напишите причину — студент увидит её в профиле");
      return;
    }
    const done = await onDecide("REJECT", note.trim());
    if (done) {
      setRejecting(false);
      setNote("");
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-3">
          <Avatar>
            {student.photoUrl && <AvatarImage src={studentsFileProxyUrl(student.photoUrl)} alt="" />}
            <AvatarFallback>{student.fullName.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{student.fullName}</p>
            <p className="text-xs text-muted-foreground">
              {student.university} · {student.studyYear} курс{student.city ? ` · ${student.city}` : ""}
            </p>
          </div>
        </div>

        {student.studyDocUrl && (
          <a
            href={studentsFileProxyUrl(student.studyDocUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <FileText className="size-4 shrink-0" />
            <span className="min-w-0 break-all">{student.studyDocName ?? "Справка"}</span>
          </a>
        )}
        <p className="text-xs text-muted-foreground">
          Сверьте ФИО, учебное заведение и дату выдачи. После решения файл удаляется.
        </p>

        {rejecting ? (
          <div className="space-y-2">
            <Textarea
              value={note}
              rows={2}
              placeholder="Причина — студент увидит её в профиле"
              onChange={(e) => {
                setNote(e.target.value);
                setError(undefined);
              }}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" disabled={busy} onClick={() => void reject()}>
                <X /> Вернуть справку
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRejecting(false)}>
                Отмена
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => void onDecide("APPROVE")}>
              <Check /> Подтвердить учёбу
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setRejecting(true)}>
              <X /> Вернуть с причиной
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
