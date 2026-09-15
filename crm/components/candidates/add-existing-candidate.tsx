"use client";

import { useEffect, useState, useTransition } from "react";

import {
  addToVacancyAction,
  searchExistingCandidatesAction,
} from "@/app/(agency)/a/candidates/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Result = {
  id: string;
  fullName: string;
  currentPosition: string | null;
  currentCompany: string | null;
  city: string | null;
  _count: { applications: number };
};

/**
 * Привязка уже существующего кандидата к этой вакансии.
 *
 * addToVacancyAction в сервисе был готов давно, но интерфейса к нему
 * не было вовсе — единственный путь добавить кандидата шёл через форму
 * «новый кандидат», которая всегда заводит нового человека в базе,
 * даже если он там уже есть под другой вакансией.
 */
export function AddExistingCandidate({ vacancyId }: { vacancyId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [searching, startSearch] = useTransition();
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      startSearch(async () => {
        const found = await searchExistingCandidatesAction(query);
        setResults(found);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function handleAdd(candidateId: string) {
    setAddingId(candidateId);
    setError(null);
    const fd = new FormData();
    fd.set("vacancyId", vacancyId);
    fd.set("candidateId", candidateId);
    const result = await addToVacancyAction({}, fd);
    setAddingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setResults([]);
          setError(null);
        }
      }}
    >
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Из базы
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Добавить кандидата из базы</DialogTitle>
        </DialogHeader>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Имя, должность, компания, телефон…"
          autoFocus
        />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {query.trim() && !searching && results.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Никого не нашли.
            </p>
          )}
          {results.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-md border p-2.5"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{c.fullName}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {[c.currentPosition, c.currentCompany, c.city]
                    .filter(Boolean)
                    .join(" · ") || "Профиль не заполнен"}
                  {c._count.applications > 0 &&
                    ` · уже в ${c._count.applications} ${
                      c._count.applications === 1 ? "воронке" : "воронках"
                    }`}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={addingId === c.id}
                onClick={() => handleAdd(c.id)}
              >
                {addingId === c.id ? "Добавляем…" : "Добавить"}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
