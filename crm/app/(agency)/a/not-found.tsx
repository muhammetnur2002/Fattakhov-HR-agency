import { CabinetNotFound } from "@/components/shell/cabinet-not-found";
import { AGENCY_HOME } from "@/lib/nav";

/** 404 в кабинете агентства — внутри оболочки (меню, нижняя панель). */
export default function AgencyNotFound() {
  return <CabinetNotFound homeHref={AGENCY_HOME} listHref="/a/vacancies" listLabel="К списку вакансий" />;
}
