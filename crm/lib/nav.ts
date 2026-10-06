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
 * Экран обязательной настройки двухфакторной для сотрудников агентства.
 * Живёт вне /a намеренно: макет /a никого без 2FA не пускает, и экран
 * внутри него отправил бы человека по кругу. Единственное место вне
 * кабинета, куда proxy.ts пускает сотрудника агентства.
 */
export const TWO_FACTOR_SETUP_PATH = "/security/two-factor";

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
  /** Раздел закрыт до договора: рядом с названием показывается замок. */
  locked?: boolean;
  /**
   * Вкладка нижней панели на телефоне — туда, куда заходят каждый день.
   * Их не больше четырёх: пятая кнопка — «Ещё», за ней весь остальной
   * список. Больше пяти вкладок в панели — уже не нажать большим пальцем,
   * не глядя.
   *
   * Выбор одинаковый в обоих кабинетах: дашборд, вакансии, кандидаты,
   * сообщения — ежедневная работа и рекрутёра, и нанимающего менеджера.
   * Команда, проверки студенческой платформы, финансы, настройки — раз
   * в неделю и реже, и почти все — только владельцу; им место в «Ещё».
   * У вкладок нет `requires`, поэтому все четыре есть у каждой роли
   * и панель не меняет состав от роли к роли.
   */
  mobileTab?: boolean;
};

export const CLIENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Дашборд", icon: "LayoutDashboard", exact: true, mobileTab: true },
  // У клиента без договора три вкладки из четырёх — с замком (AppShell,
  // lib/contract-gate.ts), как и в боковом меню: по нажатию открывается
  // тот же ContractGate с причиной. Это и есть подсказка, что откроется
  // после договора, поэтому вкладки не прячутся и не подменяются
  { href: "/vacancies", label: "Вакансии", icon: "Briefcase", mobileTab: true },
  { href: "/candidates", label: "Кандидаты", icon: "Users", mobileTab: true },
  { href: "/messages", label: "Сообщения", icon: "MessagesSquare", mobileTab: true },
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
  // Без requires: помощь нужна всем ролям, и до договора — больше всего
  { href: "/help", label: "Помощь", icon: "CircleHelp" },
];

export const AGENCY_NAV: NavItem[] = [
  { href: "/a", label: "Дашборд", icon: "LayoutDashboard", exact: true, mobileTab: true },
  { href: "/a/vacancies", label: "Вакансии", icon: "Briefcase", mobileTab: true },
  { href: "/a/candidates", label: "Кандидаты", icon: "Users", mobileTab: true },
  { href: "/a/messages", label: "Сообщения", icon: "MessagesSquare", mobileTab: true },
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
    label: "Студенческая платформа",
    icon: "ShieldCheck",
    requires: "students.enter",
  },
  // Без requires: там у каждого свои профиль, пароль, вход по двум
  // факторам и уведомления — включая пуш на телефон, который включается
  // только на этой странице. Разделы владельца (сбои, ПДн, договор,
  // сотрудники) страница прячет сама через canDo. С `org.settings` пункт
  // видел только владелец, а рекрутер добирался сюда лишь по адресу
  { href: "/a/settings", label: "Настройки", icon: "Settings" },
  // Без requires: помощь нужна всем, и рекрутеру нужнее всех —
  // именно он упирается в запреты представления
  { href: "/a/help", label: "Помощь", icon: "CircleHelp" },
];
