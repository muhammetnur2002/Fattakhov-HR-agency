/**
 * Иконки меню.
 *
 * Явная карта вместо динамического импорта по строке: так неверное имя
 * в lib/nav.ts ловится компилятором, а не пустым местом в интерфейсе.
 */
import {
  Briefcase,
  Building2,
  CalendarDays,
  ChartLine,
  FileText,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  MessagesSquare,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export const NAV_ICONS = {
  LayoutDashboard,
  Briefcase,
  Users,
  CalendarDays,
  MessagesSquare,
  FileText,
  Building2,
  Inbox,
  Wallet,
  ChartLine,
  UserCog,
  GraduationCap,
  ShieldCheck,
  Settings,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof NAV_ICONS;
