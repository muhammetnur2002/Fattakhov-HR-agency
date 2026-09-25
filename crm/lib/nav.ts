/**
 * Состав меню для обоих кабинетов.
 *
 * У пункта может быть `requires` — действие из слоя прав. Пункт показывается,
 * только если canDo() его разрешает. Так меню не расходится с реальными
 * правами: добавили роль — меню перестроилось само, без правок в компонентах.
 */
import { AGENCY_ROLES, type Action } from "@/lib/access";
import type { UserRole } from "@/lib/generated/prisma/enums";

/** Корень своего кабинета для каждой стороны — используются оба разом. */
export const AGENCY_HOME = "/a";
export const CLIENT_HOME = "/dashboard";

/**
 * Куда ведёт роль.
 *
 * Раньше это было посчитано дважды: своим списком ролей внутри proxy.ts
 * (AGENCY_ROLES там — Set с тем же содержимым, что и здесь) и, отдельно,
 * при входе — где после успешного signIn с redirectTo:"/" тот же ответ
 * приходилось выяснять заново, уже в middleware, вторым редиректом.
 * Тот второй хоп — не просто лишний запрос: если он приходит вслед
 * за сработавшим внутри Server Action redirect(), браузер обновляет
 * содержимое страницы на /a, а адресную строку — на промежуточный "/"
 * так и не трогает. Меньше 25% — это Next, не эта функция; но раз
 * прямой редирект на верный адрес убирает вторую половину цепочки,
 * убирает и саму возможность разъехаться.
 */
export function homePathFor(role: UserRole): string {
  return (AGENCY_ROLES as readonly UserRole[]).includes(role)
    ? AGENCY_HOME
    : CLIENT_HOME;
}

export type NavItem = {
  href: string;
  label: string;
  /** Иконка из lucide-react, имя экспорта. */
  icon: string;
  /** Право, без которого пункт не показывается. */
  requires?: Action;
  /** Точное совпадение пути — для корневых пунктов, иначе они всегда активны. */
  exact?: boolean;
  /** Счётчик рядом с пунктом — сейчас только непрочитанные «Сообщения», см. AppShell. */
  badge?: number;
};

export const CLIENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Дашборд", icon: "LayoutDashboard", exact: true },
  { href: "/vacancies", label: "Вакансии", icon: "Briefcase" },
  { href: "/candidates", label: "Кандидаты", icon: "Users" },
  { href: "/messages", label: "Сообщения", icon: "MessagesSquare" },
  { href: "/calendar", label: "Календарь", icon: "CalendarDays" },
  {
    href: "/analytics",
    label: "Аналитика",
    icon: "ChartLine",
    requires: "analytics.client",
  },
  {
    href: "/documents",
    label: "Документы",
    icon: "FileText",
    requires: "invoice.view",
  },
  {
    href: "/students",
    label: "Студенческая платформа",
    icon: "GraduationCap",
    requires: "students.enterAsClient",
  },
  { href: "/settings", label: "Настройки", icon: "Settings" },
];

export const AGENCY_NAV: NavItem[] = [
  { href: "/a", label: "Дашборд", icon: "LayoutDashboard", exact: true },
  { href: "/a/vacancies", label: "Вакансии", icon: "Briefcase" },
  { href: "/a/candidates", label: "Кандидаты", icon: "Users" },
  { href: "/a/messages", label: "Сообщения", icon: "MessagesSquare" },
  { href: "/a/calendar", label: "Календарь", icon: "CalendarDays" },
  {
    href: "/a/clients",
    label: "Клиенты",
    icon: "Building2",
    requires: "client.view",
  },
  {
    // Заявки с сайта разбирает тот же круг, что заводит клиентов
    href: "/a/leads",
    label: "Заявки с сайта",
    icon: "Inbox",
    requires: "client.manage",
  },
  {
    href: "/a/finance",
    label: "Финансы",
    icon: "Wallet",
    requires: "invoice.view",
  },
  {
    href: "/a/analytics",
    label: "Аналитика",
    icon: "ChartLine",
    requires: "analytics.agency",
  },
  {
    // Команду ведёт владелец и тот, кому он это доверил
    href: "/a/team",
    label: "Сотрудники",
    icon: "UserCog",
    requires: "staff.manage",
  },
  {
    // Модерация компаний/вакансий, справки студентов, метрики пилота —
    // читаются и решаются прямо здесь, без перехода на студенческую
    // платформу (см. lib/students-service.ts). /a/students остаётся
    // редиректом на этот адрес — старые ссылки не ломаются.
    href: "/a/reviews",
    label: "Проверки",
    icon: "ShieldCheck",
    requires: "students.enter",
  },
  {
    href: "/a/settings",
    label: "Настройки",
    icon: "Settings",
    requires: "org.settings",
  },
];
