import { BackToSite } from "./back-to-site";
import { BottomTabs } from "./bottom-tabs";
import { GlobalSearchField, MobileSearchLink } from "./global-search-field";
import { IconRail } from "./icon-rail";
import { NotificationBell } from "./notification-bell";
import { SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { Logo } from "@/components/brand/logo";
import {
  countUnreadNotifications,
  listNotifications,
} from "@/lib/notifications/notify";
import { canDo, type Actor } from "@/lib/access";
import { prisma } from "@/lib/db/prisma";
import { ROLE_LABELS } from "@/lib/labels";
import { isContractOnlyPath } from "@/lib/contract-gate";
import type { NavItem } from "@/lib/nav";
import { countUnreadConversations } from "@/lib/services/comments";
import { countUnreadDirectMessages } from "@/lib/services/messages";
import { siteOrigin } from "@/lib/urls";

/**
 * Каркас обоих кабинетов.
 *
 * Меню фильтруется здесь, на сервере, через canDo — клиенту не отправляются
 * даже ссылки на разделы, куда ему нельзя. Само по себе это не защита
 * (маршруты всё равно проверяются на входе), но убирает пункты, которые
 * при нажатии дали бы 404.
 *
 * Разделы на трёх ширинах — три разных вида одного и того же списка:
 * телефон (< md) — нижняя панель BottomTabs, планшет (md–xl) — узкая
 * панель иконок IconRail, компьютер (≥ xl) — полный сайдбар. Бургера нет:
 * два нажатия на каждый переход и тянуться в верхний угол.
 */
export async function AppShell({
  actor,
  nav,
  title,
  notificationsHref,
  searchHrefBase,
  contractLocked = false,
  children,
}: {
  actor: Actor;
  nav: NavItem[];
  title: string;
  notificationsHref: string;
  /** Пустая строка для клиента (/search), "/a" для агентства (/a/search). */
  searchHrefBase: string;
  /** Клиент без действующего договора: разделы работы агентства помечаются замком. */
  contractLocked?: boolean;
  children: React.ReactNode;
}) {
  const [user, notifications, unreadCount, unreadThreads, unreadDirect] =
    await Promise.all([
      prisma.user.findFirst({
        where: { id: actor.id },
        select: { fullName: true, email: true },
      }),
      listNotifications(actor.id),
      countUnreadNotifications(actor.id),
      countUnreadConversations(actor),
      countUnreadDirectMessages(actor),
    ]);

  // В разделе «Сообщения» две вкладки, и счётчик в меню обязан считать
  // обе: иначе человек видит ноль и не открывает раздел, где его ждёт
  // личное сообщение
  const unreadMessages = unreadThreads + unreadDirect;

  const items = nav
    .filter(
      (item) =>
        !item.requires || canDo(actor, item.requires, { clientId: actor.clientId }),
    )
    // Единственный пункт со счётчиком — «Сообщения»; отдельного поля
    // requires под это нет, проще подставить по адресу, чем городить
    // ещё один параметр AppShell ради одного пункта меню
    .map((item) =>
      item.href.endsWith("/messages") && unreadMessages > 0
        ? { ...item, badge: unreadMessages }
        : item,
    )
    .map((item) =>
      contractLocked && isContractOnlyPath(item.href) ? { ...item, locked: true } : item,
    );

  const siteHref = siteOrigin();
  const roleLabel = ROLE_LABELS[actor.role];

  return (
    // cabinet-shell — метка для шкалы текста кабинета и правил сенсорного
    // экрана (globals.css): оба кабинета собираются этим компонентом,
    // поэтому правка в одном месте действует сразу и в агентстве, и у
    // клиента, на всех ролях.
    // Отступы слева и справа — под вырез камеры в альбомной ориентации
    // (viewport-fit=cover в макетах кабинетов); в портрете они нулевые
    <div className="cabinet-shell flex min-h-svh pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      {/*
        Графит сайдбара - фирменный цвет знака, а не просто «тёмная тема».
        Тёмная панель рядом со светлой рабочей областью даёт продукту
        глубину, которой белое на белом не даёт никогда, и заодно держит
        бренд на экране всё время, пока человек работает.
      */}
      {/*
        Полный сайдбар — только с xl (1280). Ниже — узкая панель иконок
        (планшет) и нижняя панель (телефон). Раньше граница стояла на md
        (768), и на планшете меню занимало 240px из 768–1024 — почти треть
        экрана: плитки дашборда сжимались в две узкие колонки с переносами
        в каждой подписи.

        На компьютере меню закреплено на высоту экрана: при прокрутке
        страницы стоит на месте, а если разделов больше, чем влезает,
        прокручивается само. self-start обязателен: родитель — flex
        со stretch по умолчанию, он растянул бы сайдбар на всю высоту
        содержимого, и прилипать было бы нечему.
      */}
      <aside className="relative hidden w-60 shrink-0 flex-col bg-brand-graphite p-4 xl:sticky xl:top-0 xl:flex xl:h-svh xl:self-start xl:overflow-y-auto print:hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[url('/brand/slate-ribbed.jpg')] bg-cover bg-center opacity-25 mix-blend-overlay"
        />
        <div className="relative mb-7 px-1">
          <Logo variant="lockup" tone="light" className="h-7" priority />
          {/* Кабинет клиента открывает заказчик: ему важно, чьей компанией
              подписан экран, а не как называется его собственная */}
          <div className="mt-2.5 text-[11px] leading-tight text-white/65">
            {title}
            <br />
            {roleLabel}
          </div>
        </div>
        <div className="relative">
          {/* Выход на сайт — над пунктами меню, отделён линией:
              это уход из продукта, а не ещё один раздел */}
          <BackToSite href={siteHref} className="mb-2 border-b border-white/10 pb-3" />
          <SidebarNav items={items} />
        </div>
      </aside>

      {/* Планшет: узкая панель разделов вместо бургера */}
      <IconRail items={items} siteHref={siteHref} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header data-app-header className="flex h-14 items-center justify-between gap-4 border-b bg-background px-4 md:sticky md:top-0 md:z-30 print:hidden">
          {/* Разделы на телефоне — в нижней панели (BottomTabs), на
              планшете — в узкой панели иконок (IconRail). Бургер остался
              без дела и убран; в шапке до xl — только знак: у панели
              иконок своего логотипа нет */}
          <div className="flex items-center gap-2 xl:hidden">
            <Logo variant="mark" className="h-6" />
          </div>

          <GlobalSearchField hrefBase={searchHrefBase} />

          <div className="ml-auto flex items-center gap-1">
            <MobileSearchLink hrefBase={searchHrefBase} />
            <ThemeToggle />
            <NotificationBell
              notifications={notifications}
              unreadCount={unreadCount}
              historyHref={notificationsHref}
            />
            <UserMenu
              fullName={user?.fullName ?? ""}
              email={user?.email ?? ""}
              roleLabel={roleLabel}
              companyHref={actor.clientId ? "/company" : undefined}
            />
          </div>
        </header>

        {/* Снизу на телефоне — место под нижнюю панель и полосу «Домой»
            (--tabbar-space, globals.css): иначе последняя карточка страницы
            уходила бы под панель */}
        <main className="flex-1 p-4 pb-(--tabbar-space) md:p-6 print:p-0">{children}</main>
      </div>

      <BottomTabs items={items} title={title} roleLabel={roleLabel} siteHref={siteHref} />
    </div>
  );
}
