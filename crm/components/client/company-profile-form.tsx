"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { startTransition, useActionState, useRef, useState } from "react";

import { saveCompanyProfileAction, type CompanyProfileState } from "@/app/(client)/company/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CompanyProfile } from "@/lib/services/company-profile";

function Submit({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Сохраняем…" : "Сохранить"}
    </Button>
  );
}

/** Логотип: загружается сразу при выборе файла, остальной профиль сохраняется кнопкой. */
function LogoField({ initialUrl, editable, name }: { initialUrl: string | null; editable: boolean; name: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/company-logo", { method: "POST", body });
      const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !data.url) setError(data.error ?? "Не удалось загрузить логотип");
      else setUrl(data.url);
    } catch {
      setError("Нет связи — попробуйте ещё раз");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/company-logo", { method: "DELETE" }).catch(() => null);
    if (response?.ok) setUrl(null);
    else setError("Не удалось убрать логотип");
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-muted">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- файл из нашего хранилища, размеры заранее неизвестны
          <img src={url} alt={`Логотип ${name}`} className="size-full object-cover" />
        ) : (
          <ImagePlus className="size-7 text-muted-foreground" aria-hidden />
        )}
      </div>
      {editable && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? "Загружаем…" : url ? "Заменить" : "Добавить логотип"}
            </Button>
            {url && (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void remove()}>
                <Trash2 className="mr-1 size-4" aria-hidden />
                Убрать
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">JPG или PNG до 20 МБ. Виден студентам на карточке вакансии.</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png"
            className="sr-only"
            tabIndex={-1}
            aria-label="Файл логотипа"
            onChange={(event) => void upload(event.target.files?.[0])}
          />
        </div>
      )}
    </div>
  );
}

/** Профиль компании клиента. Правит администратор, остальные сотрудники читают. */
export function CompanyProfileForm({ company, editable }: { company: CompanyProfile; editable: boolean }) {
  const [state, action, pending] = useActionState<CompanyProfileState, FormData>(saveCompanyProfileAction, {});

  // Отправляем вручную: после action формы React 19 очищает поля, и при ошибке («ИНН уже
  // занят») человек терял бы набранное
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }
  const errors = state.fields ?? {};
  const ro = !editable;

  return (
    <div className="space-y-6">
      <LogoField initialUrl={company.logoUrl} editable={editable} name={company.name} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Название компании</Label>
          <Input id="name" name="name" defaultValue={company.name} required readOnly={ro} />
          {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="legalName">Юридическое лицо</Label>
          <Input
            id="legalName"
            name="legalName"
            defaultValue={company.legalName ?? ""}
            placeholder="ООО «Ромашка» / ИП Иванов И. И."
            readOnly={ro}
          />
          {errors.legalName && <p className="text-sm text-destructive">{errors.legalName}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="inn">ИНН</Label>
          <Input
            id="inn"
            name="inn"
            inputMode="numeric"
            defaultValue={company.inn ?? ""}
            placeholder="10 цифр у компании, 12 у ИП"
            readOnly={ro}
          />
          <p className="text-xs text-muted-foreground">
            По ИНН агентство проверяет компанию перед публикацией вакансии на студенческой платформе.
          </p>
          {errors.inn && <p className="text-sm text-destructive">{errors.inn}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="industry">Отрасль</Label>
            <Input id="industry" name="industry" defaultValue={company.industry ?? ""} readOnly={ro} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">Город</Label>
            <Input id="city" name="city" defaultValue={company.city ?? ""} readOnly={ro} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="website">Сайт</Label>
          <Input id="website" name="website" defaultValue={company.website ?? ""} placeholder="https://" readOnly={ro} />
          {errors.website && <p className="text-sm text-destructive">{errors.website}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">О компании</Label>
          <Textarea
            id="description"
            name="description"
            rows={5}
            defaultValue={company.description ?? ""}
            placeholder="Чем занимается компания, сколько человек в команде, что важно знать кандидату"
            readOnly={ro}
          />
          {errors.description && <p className="text-sm text-destructive">{errors.description}</p>}
        </div>

        {state.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        {state.ok && (
          <Alert>
            <AlertDescription>{state.ok}</AlertDescription>
          </Alert>
        )}
        {editable ? (
          <Submit pending={pending} />
        ) : (
          <p className="text-sm text-muted-foreground">Профиль компании правит администратор компании.</p>
        )}
      </form>
    </div>
  );
}
