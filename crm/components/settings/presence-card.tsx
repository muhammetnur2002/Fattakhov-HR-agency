import { PresenceSetting } from "@/components/settings/presence-setting";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { effectiveShowPresence } from "@/lib/presence";

/**
 * Карточка «Статус „в сети“» в настройках — одна для кабинета агентства и
 * клиента.
 *
 * Скрыть статус вправе только владелец агентства: у него в карточке
 * переключатель. У остальных переключателя нет — только пояснение, что статус
 * виден всем собеседникам; даже если когда-то у них было сохранено «выключено»,
 * действует правило из effectiveShowPresence, и серверное действие отклонит
 * попытку сохранить.
 */
export function PresenceCard({ role, showPresence }: { role: string; showPresence: boolean }) {
  const canHide = role === "OWNER";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Статус «в сети»</CardTitle>
        <CardDescription>
          {canHide
            ? "Видно ли другим людям в «Сообщениях», что вы сейчас в кабинете и когда были в нём последний раз."
            : "Те, кому вы можете писать в «Сообщениях», видят, что вы сейчас в кабинете и когда были в нём последний раз."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {canHide ? (
          <PresenceSetting showPresence={effectiveShowPresence({ role, showPresence })} />
        ) : (
          <p className="text-sm text-muted-foreground">Статус «в сети» виден всем собеседникам</p>
        )}
      </CardContent>
    </Card>
  );
}
