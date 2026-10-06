import Link from "next/link";

import { withEmailOff } from "@/components/shared/email-off";
import {
  MARKETING_CONSENT_TEXT,
  PRIVACY_EMAIL,
  PRIVACY_POLICY_PATH,
} from "@/lib/legal/consent-texts";
import {
  VISITOR_CONSENT_CHECKBOX,
  VISITOR_CONSENT_DOCUMENT,
  VISITOR_CONSENT_POLICY_WORDS,
  type ConsentBlock,
} from "@/lib/legal/visitor-consent";

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
 * Первая — по документу юриста №2 (lib/legal/visitor-consent.ts): у галочки
 * его «текст отметки», под ней — полный текст согласия. Пункты 6.1 и 7.2
 * документа: человек подтверждает, что ознакомился с текстом, — значит,
 * текст обязан быть доступен здесь же, до отправки, а не только в файле
 * у оператора. Раскрывается без скриптов (<details>): читается и тогда,
 * когда страница ещё не ожила.
 *
 * Проверка на обязательность стоит и здесь (required), и на сервере.
 * Здесь - чтобы человек увидел подсказку сразу; там - потому что
 * браузерную проверку обходят одной строкой в консоли.
 */
export function ConsentFields({ idPrefix }: { idPrefix: string }) {
  const [before, after] = VISITOR_CONSENT_CHECKBOX.split(
    VISITOR_CONSENT_POLICY_WORDS,
  );

  return (
    <div className="mt-6 space-y-4 border-t pt-5">
      <div className="space-y-2">
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
            {before}
            <Link
              href={PRIVACY_POLICY_PATH}
              className="underline underline-offset-2 hover:text-foreground"
            >
              {VISITOR_CONSENT_POLICY_WORDS}
            </Link>
            {after}
          </span>
        </label>

        {/* Вне label: нажатие на «Текст согласия» не должно ставить галочку */}
        <details className="ml-7 text-sm text-muted-foreground">
          <summary className="w-fit cursor-pointer underline underline-offset-2 hover:text-foreground">
            Текст согласия
          </summary>
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto rounded-lg border bg-background/60 p-4 text-xs leading-relaxed">
            {VISITOR_CONSENT_DOCUMENT.map((block, i) => (
              <ConsentBlockView key={i} block={block} />
            ))}
          </div>
        </details>
      </div>

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

/** Блок документа — с той же разметкой смысла, что в .docx: шапка, заголовок, разделы. */
function ConsentBlockView({ block }: { block: ConsentBlock }) {
  const text = withEmailOff(block.text, PRIVACY_EMAIL);
  switch (block.kind) {
    case "operator":
      return <p className="text-right whitespace-pre-line">{text}</p>;
    case "title":
      return (
        <p className="pt-2 text-center font-semibold tracking-wide text-foreground">
          {text}
        </p>
      );
    case "subtitle":
      return <p className="text-center font-medium text-foreground">{text}</p>;
    case "edition":
      return <p className="text-center">{text}</p>;
    case "heading":
      return <p className="pt-2 font-medium text-foreground">{text}</p>;
    default:
      return <p>{text}</p>;
  }
}
