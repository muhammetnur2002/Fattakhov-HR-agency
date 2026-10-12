"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { saveCompanyProfileAction } from "@/app/(client)/company/actions";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useFormAction } from "@/lib/hooks/use-form-action";
import type { CompanyProfile } from "@/lib/services/company-profile";

function Submit({ loading }: { loading: boolean }) {
  return (
    <SubmitButton loading={loading} pendingLabel="Сохраняем…">
      Сохранить
    </SubmitButton>
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
    // Vercel не пропускает запрос больше 4,5 МБ — предупреждаем до отправки, а не ошибкой после
    if (file.size > 4 * 1024 * 1024) {
      setError("Файл больше 4 МБ — уменьшите картинку");
      return;
    }
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
            <Button type="button" variant="outline" size="sm" loading={busy} onClick={() => input.current?.click()}>
              {busy ? "Загружаем…" : url ? "Заменить" : "Добавить логотип"}
            </Button>
            {url && (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void remove()}>
                <Trash2 className="mr-1 size-4" aria-hidden />
                Убрать
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">JPG или PNG до 4 МБ. Виден студентам на карточке вакансии.</p>
          <FormMessage compact error={error} className="text-sm" />
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
  // Отправка через useFormAction: после action формы React 19 очищает поля, и при ошибке («ИНН уже
  // занят») человек терял бы набранное
  const { state, fields: errors, pending, formProps } = useFormAction(saveCompanyProfileAction, {});
  const ro = !editable;

  return (
    <div className="space-y-6">
      <LogoField initialUrl={company.logoUrl} editable={editable} name={company.name} />

      <form {...formProps} className="space-y-4">
        <Field label="Название компании" error={errors.name}>
          <Input id="name" name="name" defaultValue={company.name} required readOnly={ro} />
        </Field>
        <Field label="Юридическое лицо" error={errors.legalName}>
          <Input
            id="legalName"
            name="legalName"
            defaultValue={company.legalName ?? ""}
            placeholder="ООО «Ромашка» / ИП Иванов И. И."
            readOnly={ro}
          />
        </Field>
        <Field
          label="ИНН"
          error={errors.inn}
          hint="По ИНН агентство проверяет компанию перед публикацией вакансии на студенческой платформе."
        >
          <Input
            id="inn"
            name="inn"
            inputMode="numeric"
            defaultValue={company.inn ?? ""}
            placeholder="10 цифр у компании, 12 у ИП"
            readOnly={ro}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Отрасль" error={errors.industry}>
            <Input id="industry" name="industry" defaultValue={company.industry ?? ""} readOnly={ro} />
          </Field>
          <Field label="Город" error={errors.city}>
            <Input id="city" name="city" defaultValue={company.city ?? ""} readOnly={ro} />
          </Field>
        </div>
        <Field label="Сайт" error={errors.website}>
          <Input id="website" name="website" defaultValue={company.website ?? ""} placeholder="https://" readOnly={ro} />
        </Field>
        <Field label="О компании" error={errors.description}>
          <Textarea
            id="description"
            name="description"
            rows={5}
            defaultValue={company.description ?? ""}
            placeholder="Чем занимается компания, сколько человек в команде, что важно знать кандидату"
            readOnly={ro}
          />
        </Field>

        <FormMessage error={state.error} ok={state.ok} />
        {editable ? (
          <Submit loading={pending} />
        ) : (
          <p className="text-sm text-muted-foreground">Профиль компании правит администратор компании.</p>
        )}
      </form>
    </div>
  );
}
