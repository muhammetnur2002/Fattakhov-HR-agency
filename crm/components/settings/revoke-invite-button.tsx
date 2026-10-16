"use client";

import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormAction } from "@/lib/hooks/use-form-action";

export type RevokeInviteState = { error?: string };

/**
 * «Отозвать» у неотвеченного приглашения — одна кнопка на три экрана.
 *
 * Серверное действие приходит снаружи, как у InviteForm: экранов три —
 * сотрудники агентства, пользователи клиента глазами агентства и своя
 * команда в кабинете клиента, — и право за каждым стоит своё, а значит
 * и проверка разная. Разметка при этом одна и та же, и повторять её
 * трижды незачем.
 *
 * Отзыв — ОДНИМ нажатием, без вопроса «Отозвать приглашение?» (решение владельца,
 * 16.10.2026). С 13.10 кнопка переспрашивала через ConfirmBlock; прежнее поведение
 * возвращено: действие обратимо — приглашение можно создать заново, и это новая ссылка.
 * Поэтому приглашения не входят в перечень ConfirmBlock и не должны туда возвращаться без
 * решения владельца (`tests/confirm-block-rule.test.ts`, исключение с причиной).
 *
 * Что осталось полезным от переработки подтверждений: на время запроса кнопка
 * показывает ход («Отзываем…») и не даёт нажать повторно; отказ сервера — строкой
 * рядом с кнопкой, а фокус после него идёт на эту строку, а не слетает на `<body>`
 * (`useFormAction`). Исключение действия, в том числе «страница устарела»
 * (UnrecognizedActionError), `useActionState` отдаёт ближайшей границе ошибок сам:
 * отдельная ловля (`useStaleGuard`) здесь не нужна, и проглотить его некому.
 *
 * Форма и состояние у каждой кнопки свои: ошибка относится к конкретному
 * приглашению и показывается в его строке, а не общим сообщением наверху,
 * где непонятно, к какому из них она.
 */
export function RevokeInviteButton({
  action,
  id,
  clientId,
}: {
  action: (
    prev: RevokeInviteState,
    formData: FormData,
  ) => Promise<RevokeInviteState>;
  id: string;
  /**
   * Компания приглашённого. Нужна агентскому действию: право
   * проверяется на неё, и её же страницу надо обновить после отзыва.
   * В кабинете клиента компания берётся из актора — подставлять её
   * из формы там нельзя (см. app/(client)/settings/actions.ts).
   */
  clientId?: string;
}) {
  const { state, pending, formProps } = useFormAction<RevokeInviteState>(
    action,
    {},
  );

  return (
    <form {...formProps} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      {clientId && <input type="hidden" name="clientId" value={clientId} />}
      <SubmitButton
        size="sm"
        variant="ghost"
        pendingLabel="Отзываем…"
        loading={pending}
      >
        Отозвать
      </SubmitButton>
      <FormMessage compact error={state.error} className="max-w-64" />
    </form>
  );
}
