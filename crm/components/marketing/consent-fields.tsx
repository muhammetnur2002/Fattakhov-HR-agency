import Link from "next/link";

import { withEmailOff } from "@/components/shared/email-off";
import {
  LEAD_CONSENT_TEXT,
  MARKETING_CONSENT_TEXT,
  PRIVACY_EMAIL,
  PRIVACY_POLICY_PATH,
} from "@/lib/legal/consent-texts";

/**
 * Галочки согласия под формой.
 *
 * Две, раздельные, обе пустые по умолчанию - требование раздела 10
 * юридического пакета и статьи 9 закона в редакции с 01.09.2025:
 * согласие оформляется отдельно от иных документов, а не «нажимая
 * кнопку, вы соглашаетесь со всем сразу».
 *
 * Первая обязательна, без неё форма не отправляется. Вторая, про
 * рекламу, обязательной быть не может никогда: статья 18 закона
 * о рекламе требует отдельного добровольного согласия, и связывать
 * его с отправкой заявки нельзя.
 *
 * Проверка на обязательность стоит и здесь (required), и на сервере.
 * Здесь - чтобы человек увидел подсказку сразу; там - потому что
 * браузерную проверку обходят одной строкой в консоли.
 */
export function ConsentFields({ idPrefix }: { idPrefix: string }) {
  return (
    <div className="mt-6 space-y-4 border-t pt-5">
      <label
        htmlFor={`${idPrefix}-consent`}
        className="flex cursor-pointer gap-3"
      >
        <input
          id={`${idPrefix}-consent`}
          name="consent"
          type="checkbox"
          required
          className="mt-0.5 size-4 shrink-0 cursor-pointer accent-brand-graphite"
        />
        <span className="text-sm leading-relaxed text-muted-foreground">
          {withEmailOff(LEAD_CONSENT_TEXT, PRIVACY_EMAIL)}{" "}
          <Link
            href={PRIVACY_POLICY_PATH}
            className="underline underline-offset-2 hover:text-foreground"
          >
            Политика обработки персональных данных
          </Link>
          .
        </span>
      </label>

      <label
        htmlFor={`${idPrefix}-marketing`}
        className="flex cursor-pointer gap-3"
      >
        <input
          id={`${idPrefix}-marketing`}
          name="marketingConsent"
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 cursor-pointer accent-brand-graphite"
        />
        <span className="text-sm leading-relaxed text-muted-foreground">
          {withEmailOff(MARKETING_CONSENT_TEXT, PRIVACY_EMAIL)}
        </span>
      </label>
    </div>
  );
}
