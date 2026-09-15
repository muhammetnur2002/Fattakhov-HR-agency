"use client";

import { Lock, Reply } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  createCommentAction,
  deleteCommentAction,
  editCommentAction,
  markReadAction,
  type CommentState,
} from "@/app/actions/comments";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ROLE_LABELS } from "@/lib/labels";
import type { UserRole } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

export type ThreadComment = {
  id: string;
  body: string;
  visibility: "INTERNAL" | "SHARED";
  parentId: string | null;
  createdAt: Date;
  editedAt: Date | null;
  isRead: boolean;
  authorId: string;
  author: {
    id: string;
    fullName: string;
    role: string;
    position: string | null;
  } | null;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Отправляем…" : "Отправить"}
    </Button>
  );
}

/**
 * Тред обсуждения.
 *
 * Один компонент на оба кабинета. Внутренние комментарии сюда просто
 * не доходят для клиента — их отфильтровал слой доступа, а не этот
 * компонент. Здесь только их визуальное отличие для агентства, чтобы
 * рекрутер видел, что пишет не клиенту.
 */
export function CommentThread({
  comments,
  applicationId,
  vacancyId,
  canWriteInternal,
  canWrite,
  canDeleteAny,
  currentUserId,
  emptyText,
}: {
  comments: ThreadComment[];
  applicationId?: string;
  vacancyId?: string;
  canWriteInternal: boolean;
  canWrite: boolean;
  /**
   * Право убрать чужую реплику (comment.deleteAny — только владелец).
   *
   * Правку так не открывают и не откроют: исправленный чужой текст
   * остаётся подписан чужим именем, и по треду не видно, что автор
   * этого не писал. Удаление честнее — реплика исчезает целиком.
   */
  canDeleteAny: boolean;
  currentUserId: string;
  emptyText: string;
}) {
  const [state, setState] = useState<CommentState>({});
  const [replyTo, setReplyTo] = useState<ThreadComment | null>(null);
  const [internal, setInternal] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  /**
   * Обычный обработчик вместо useActionState: после успешной отправки
   * надо очистить поле и выйти из режима ответа, а делать это эффектом
   * на изменение состояния — лишний каскад перерисовок.
   */
  async function handleSubmit(formData: FormData) {
    const result = await createCommentAction({}, formData);
    setState(result);
    if (result.ok) {
      formRef.current?.reset();
      setReplyTo(null);
      setInternal(false);
    }
  }

  // Открыли тред — считаем прочитанным. Ответа не ждём: это фоновая
  // отметка, а не действие пользователя
  useEffect(() => {
    const unread = comments
      .filter((c) => !c.isRead && c.authorId !== currentUserId)
      .map((c) => c.id);
    if (unread.length > 0) void markReadAction(unread);
  }, [comments, currentUserId]);

  // Ответ во внутренней ветке обязан остаться внутренним — сервис это
  // проверит, но переключатель лучше не давать трогать вовсе
  const forcedInternal = replyTo?.visibility === "INTERNAL";
  const isInternal = forcedInternal || internal;

  const roots = comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);

  /*
    Обе формы уже полагаются на revalidatePath внутри самого действия —
    комментарий подтянется автообновлением страницы, тем же путём, каким
    уже подтягивается только что отправленный. Собственного состояния
    списка здесь ещё не было, и заводить его только ради редактирования
    и удаления незачем.
  */
  async function handleEdit(commentId: string, body: string) {
    const fd = new FormData();
    fd.set("commentId", commentId);
    fd.set("body", body);
    if (applicationId) fd.set("applicationId", applicationId);
    if (vacancyId) fd.set("vacancyId", vacancyId);
    return editCommentAction({}, fd);
  }

  async function handleDelete(commentId: string) {
    const fd = new FormData();
    fd.set("commentId", commentId);
    if (applicationId) fd.set("applicationId", applicationId);
    if (vacancyId) fd.set("vacancyId", vacancyId);
    return deleteCommentAction({}, fd);
  }

  return (
    <div className="space-y-4">
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ol className="space-y-4">
          {roots.map((c) => (
            <li key={c.id} className="space-y-3">
              <CommentItem
                comment={c}
                currentUserId={currentUserId}
                canDeleteAny={canDeleteAny}
                onReply={canWrite ? () => setReplyTo(c) : undefined}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
              {repliesOf(c.id).length > 0 && (
                <ol className="ml-6 space-y-3 border-l pl-4">
                  {repliesOf(c.id).map((r) => (
                    <li key={r.id}>
                      <CommentItem
                        comment={r}
                        currentUserId={currentUserId}
                        canDeleteAny={canDeleteAny}
                        onReply={canWrite ? () => setReplyTo(c) : undefined}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}

      {canWrite && (
        <form ref={formRef} action={handleSubmit} className="space-y-3 border-t pt-4">
          {applicationId && (
            <input type="hidden" name="applicationId" value={applicationId} />
          )}
          {vacancyId && (
            <input type="hidden" name="vacancyId" value={vacancyId} />
          )}
          {replyTo && <input type="hidden" name="parentId" value={replyTo.id} />}

          {replyTo && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-xs">
              <span className="truncate">
                Ответ: {replyTo.author?.fullName} — {replyTo.body.slice(0, 60)}
                {replyTo.body.length > 60 ? "…" : ""}
              </span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="shrink-0 underline"
              >
                отменить
              </button>
            </div>
          )}

          <Textarea
            name="body"
            rows={3}
            required
            placeholder={
              isInternal
                ? "Внутренняя заметка — клиент её не увидит"
                : "Написать клиенту…"
            }
            className={cn(isInternal && "bg-amber-50 dark:bg-amber-950/30")}
          />

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton />

            {canWriteInternal && (
              <label
                className={cn(
                  "flex items-center gap-2 text-sm",
                  forcedInternal && "opacity-60",
                )}
              >
                <input
                  type="checkbox"
                  name="internal"
                  checked={isInternal}
                  disabled={forcedInternal}
                  onChange={(e) => setInternal(e.target.checked)}
                  className="size-4"
                />
                <Lock className="size-3.5" />
                Внутренний, клиент не увидит
              </label>
            )}
          </div>

          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
        </form>
      )}
    </div>
  );
}

function CommentItem({
  comment,
  currentUserId,
  canDeleteAny,
  onReply,
  onEdit,
  onDelete,
}: {
  comment: ThreadComment;
  currentUserId: string;
  canDeleteAny: boolean;
  onReply?: () => void;
  onEdit: (commentId: string, body: string) => Promise<CommentState>;
  onDelete: (commentId: string) => Promise<CommentState>;
}) {
  const internal = comment.visibility === "INTERNAL";
  const own = comment.authorId === currentUserId;
  const canDelete = own || canDeleteAny;

  const [mode, setMode] = useState<"view" | "editing" | "confirmDelete">("view");
  const [draft, setDraft] = useState(comment.body);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);

  async function saveEdit() {
    setPending(true);
    const result = await onEdit(comment.id, draft);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMode("view");
  }

  async function confirmDelete() {
    setPending(true);
    const result = await onDelete(comment.id);
    setPending(false);
    if (result.error) {
      setError(result.error);
      setMode("view");
      return;
    }
    // Комментарий исчезнет из пропа после revalidatePath — до тех пор
    // просто прячем его, чтобы не ждать с открытой формой подтверждения
    setRemoved(true);
  }

  if (removed) return null;

  return (
    <div
      className={cn(
        "rounded-md border p-3",
        // Внутренние визуально отличаются, чтобы рекрутер не перепутал,
        // кому он пишет
        internal && "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30",
        !comment.isRead && !own && "border-l-2 border-l-primary",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Avatar className="size-6">
          <AvatarFallback className="text-[10px]">
            {initials(comment.author?.fullName ?? "?")}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium">
          {comment.author?.fullName ?? "Удалённый пользователь"}
        </span>
        {comment.author && (
          <span className="text-xs text-muted-foreground">
            {ROLE_LABELS[comment.author.role as UserRole]}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {formatDateTime(comment.createdAt)}
          {comment.editedAt ? " · изменено" : ""}
        </span>

        {internal && (
          <Badge variant="outline" className="gap-1">
            <Lock className="size-3" />
            внутренний
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-3">
          {onReply && mode === "view" && (
            <button
              type="button"
              onClick={onReply}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Reply className="size-3" />
              Ответить
            </button>
          )}
          {/* Править — строго своё: чужой текст, исправленный кем-то другим,
              остаётся подписан прежним именем (см. editComment
              в lib/services/comments.ts) */}
          {own && mode === "view" && (
            <button
              type="button"
              onClick={() => {
                setDraft(comment.body);
                setError(null);
                setMode("editing");
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Изменить
            </button>
          )}
          {/* Удалять — своё либо, по праву comment.deleteAny, чужое:
              переписку с клиентом иногда нужно почистить не тому, кто
              в ней ошибся */}
          {canDelete && mode === "view" && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode("confirmDelete");
              }}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              Удалить
            </button>
          )}
        </div>
      </div>

      {mode === "editing" ? (
        <div className="mt-2 space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending || !draft.trim()}
              onClick={saveEdit}
            >
              {pending ? "Сохраняем…" : "Сохранить"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setMode("view")}
            >
              Отмена
            </Button>
          </div>
        </div>
      ) : mode === "confirmDelete" ? (
        <div className="mt-2 space-y-2">
          <p className="whitespace-pre-line text-sm text-muted-foreground line-through">
            {comment.body}
          </p>
          <div className="flex items-center gap-2 text-sm">
            {/* Удаление чужого — не рядовое действие, и спрашивать
                о нём той же фразой значит дать промахнуться мимо */}
            <span>
              {own
                ? "Удалить комментарий?"
                : `Удалить комментарий — ${comment.author?.fullName ?? "другой автор"}?`}
            </span>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={confirmDelete}
            >
              {pending ? "Удаляем…" : "Да, удалить"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setMode("view")}
            >
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-line text-sm">{comment.body}</p>
      )}

      {error && (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));
}
