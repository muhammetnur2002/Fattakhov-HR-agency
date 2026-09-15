import { GlobalSearchField, MobileSearchLink } from "./global-search-field";
import { MobileNav } from "./mobile-nav";
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
import type { NavItem } from "@/lib/nav";
import { countUnreadConversations } from "@/lib/services/comments";
import { countUnreadDirectMessages } from "@/lib/services/messages";

/**
 * Каркас обоих кабинетов.
 *
 * Меню фильтруется здесь, на сервере, через canDo — клиенту не отправляются
 * даже ссылки на разделы, куда ему нельзя. Само по себе это не защита
 * (маршруты всё равно проверяются на входе), но убирает пункты, которые
 * при нажатии дали бы 404.
 */
export async function AppShell({
  actor,
  nav,
  title,
  notificationsHref,
  searchHrefBase,
  children,
}: {
  actor: Actor;
  nav: NavItem[];
  title: string;
  notificationsHref: string;
  /** Пустая строка для клиента (/search), "/a" для агентства (/a/search). */
  searchHrefBase: string;
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
    );

  return (
    // cabinet-shell — метка для шкалы текста кабинета (globals.css):
    // оба кабинета собираются этим компонентом, поэтому правка размера
    // в одном месте действует сразу и в агентстве, и у клиента, на всех
    // ролях и без привязки к ширине экрана
    <div className="cabinet-shell flex min-h-svh">
      {/*
        Графит сайдбара - фирменный цвет знака, а не просто «тёмная тема».
        Тёмная панель рядом со светлой рабочей областью даёт продукту
        глубину, которой белое на белом не даёт никогда, и заодно держит
        бренд на экране всё время, пока человек работает.
      */}
      <aside className="relative hidden w-60 shrink-0 flex-col bg-brand-graphite p-4 md:flex print:hidden">
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
            {ROLE_LABELS[actor.role]}
          </div>
        </div>
        <div className="relative">
          <SidebarNav items={items} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-4 border-b px-4 print:hidden">
          <div className="flex items-center gap-2 md:hidden">
            {/* Единственный способ дойти до разделов на телефоне: сайдбар
                скрыт до md, а без этой кнопки на мобильном не было вообще
                никакой навигации, кроме дашборда */}
            <MobileNav items={items} title={title} roleLabel={ROLE_LABELS[actor.role]} />
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
              roleLabel={ROLE_LABELS[actor.role]}
            />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 print:p-0">{children}</main>
      </div>
    </div>
  );
}
