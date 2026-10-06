import { PrismaClient } from '@prisma/client';
import { blindIndex, encrypt } from '../lib/security/crypto';
import { hashPassword } from '../lib/security/password';
import { DEMO_CREDENTIALS, DEMO_INSTITUTIONS } from '../lib/db/seed-data';

/**
 * Разнообразные студенты для проверки поиска и фильтров в CRM (раздел «Студенты»).
 *
 *   npm run db:seed:search-demo
 *
 * Идемпотентно (по почте). Только для локальной базы: те же ограничения, что у основного
 * seed. Запускается после `npm run db:seed` — нужен справочник вузов. Здесь всё, что
 * проверяет вёрстку и фильтры: длинные имена и вузы, пустые поля, скрытое присутствие,
 * справки на проверке, пауза и трудоустройство, разный возраст, навыки и города.
 */
function assertSafeTarget() {
  const url = process.env.DATABASE_URL ?? '';
  const local = /@(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(url);
  if (process.env.NODE_ENV === 'production' || (!local && process.env.ALLOW_REMOTE_SEED !== '1')) {
    console.error('Отказ: seed запускается только на локальной базе (или с ALLOW_REMOTE_SEED=1 вне production).');
    process.exit(1);
  }
}
assertSafeTarget();

const prisma = new PrismaClient();

type Demo = {
  name: string;
  gender: 'MALE' | 'FEMALE';
  /** Возраст в годах: дата рождения считается от сегодняшнего дня */
  age: number;
  university: string;
  speciality: string;
  studyYear: number;
  city: string | null;
  skills: string[];
  about: string | null;
  status?: 'ACTIVE' | 'IN_PROGRESS' | 'PLACED' | 'PAUSED';
  study?: 'VERIFIED' | 'PENDING' | 'NONE';
  /** Когда заходил, минут назад; null — не заходил */
  seenMinutesAgo: number | null;
  hidePresence?: boolean;
  registeredDaysAgo: number;
};

const KFU = 'Казанский (Приволжский) федеральный университет';
const KAI = 'КАИ';
const KNRTU = 'КНИТУ';
const LONG_UNI = 'Казанский национальный исследовательский технический университет им. А. Н. Туполева — КАИ, институт компьютерных технологий и защиты информации';

const DEMO: Demo[] = [
  { name: 'Шарипова Алия Ильдаровна', gender: 'FEMALE', age: 19, university: KFU, speciality: 'Прикладная информатика', studyYear: 2, city: 'Казань', skills: ['Python', 'SQL', 'Excel'], about: 'Учусь на втором курсе, ищу стажировку аналитиком данных. Люблю разбираться в таблицах и строить дашборды.', study: 'VERIFIED', seenMinutesAgo: 1, registeredDaysAgo: 3 },
  { name: 'Ёлкин Пётр Сергеевич', gender: 'MALE', age: 22, university: KAI, speciality: 'Дизайн', studyYear: 4, city: 'Казань', skills: ['Figma', 'Photoshop', 'Иллюстрация'], about: 'Графический дизайнер, делаю айдентику и интерфейсы. Подрабатываю на фрилансе.', study: 'PENDING', status: 'PAUSED', seenMinutesAgo: 180, registeredDaysAgo: 12 },
  { name: 'Иванов Иван Иванович', gender: 'MALE', age: 25, university: KFU, speciality: 'Юриспруденция', studyYear: 5, city: 'Москва', skills: ['Договоры', 'Excel', 'Английский B2'], about: 'Магистрант. Работаю в юридической клинике.', study: 'VERIFIED', status: 'PLACED', seenMinutesAgo: 60 * 24 * 5, registeredDaysAgo: 40 },
  { name: 'Петрова Мария Андреевна', gender: 'FEMALE', age: 20, university: KNRTU, speciality: 'Химическая технология', studyYear: 3, city: 'Казань', skills: ['Лаборатория', 'Excel'], about: null, study: 'VERIFIED', seenMinutesAgo: 1, hidePresence: true, registeredDaysAgo: 8 },
  { name: 'Сидорова Анна Викторовна', gender: 'FEMALE', age: 21, university: KFU, speciality: 'Маркетинг', studyYear: 3, city: 'Казань', skills: ['SMM', 'Копирайтинг', 'Canva', 'Excel'], about: 'Веду два телеграм-канала, умею снимать и монтировать короткие видео. Хочу в SMM.', study: 'NONE', seenMinutesAgo: 2, registeredDaysAgo: 1 },
  { name: 'Тестов Тест Тестович', gender: 'MALE', age: 18, university: '', speciality: '', studyYear: 0, city: null, skills: [], about: null, study: 'NONE', seenMinutesAgo: null, registeredDaysAgo: 0 },
  { name: 'Гайнуллин Рамиль Рафикович', gender: 'MALE', age: 23, university: KAI, speciality: 'Информатика и вычислительная техника', studyYear: 4, city: 'Казань', skills: ['JavaScript', 'React', 'TypeScript', 'SQL', 'Git'], about: 'Фронтенд, пет-проекты на React. Ищу стажировку на полный день летом.', study: 'VERIFIED', seenMinutesAgo: 25, registeredDaysAgo: 20 },
  { name: 'Сафиуллина Эльвира Маратовна', gender: 'FEMALE', age: 19, university: 'КГМУ', speciality: 'Лечебное дело', studyYear: 2, city: 'Казань', skills: ['Первая помощь', 'Английский B1'], about: 'Хочу подработку по графику «через день».', study: 'VERIFIED', seenMinutesAgo: 600, registeredDaysAgo: 15 },
  { name: 'Хабибуллин Ильяс Айратович', gender: 'MALE', age: 21, university: KNRTU, speciality: 'Менеджмент', studyYear: 3, city: 'Набережные Челны', skills: ['Excel', 'CRM', 'Продажи'], about: 'Подрабатывал администратором в кофейне два сезона.', study: 'PENDING', seenMinutesAgo: 60 * 30, registeredDaysAgo: 30 },
  { name: 'Ким Юлия Олеговна', gender: 'FEMALE', age: 24, university: KFU, speciality: 'Журналистика', studyYear: 5, city: 'Казань', skills: ['Копирайтинг', 'Видео', 'Английский C1', 'Фото'], about: 'Пишу тексты для медиа и брендов, снимаю репортажи. Есть портфолио.', study: 'VERIFIED', seenMinutesAgo: 4, registeredDaysAgo: 50 },
  { name: 'Воробьёв Артём Дмитриевич', gender: 'MALE', age: 20, university: 'Казанский ГАУ', speciality: 'Агрономия', studyYear: 2, city: 'Казань', skills: ['Excel', 'Вождение'], about: null, study: 'NONE', seenMinutesAgo: 60 * 24 * 2, registeredDaysAgo: 6 },
  { name: 'Закирова Диляра Ринатовна', gender: 'FEMALE', age: 18, university: 'КГЭУ', speciality: 'Электроэнергетика', studyYear: 1, city: 'Казань', skills: ['Черчение', 'Excel'], about: 'Первокурсница, ищу подработку на вечера.', study: 'VERIFIED', seenMinutesAgo: 90, registeredDaysAgo: 2 },
  { name: 'Миронов Глеб Станиславович', gender: 'MALE', age: 26, university: KFU, speciality: 'Финансы и кредит', studyYear: 6, city: 'Казань', skills: ['Excel', '1С', 'Бухгалтерия', 'SQL'], about: 'Совмещаю учёбу и работу бухгалтером на полставки. Ищу позицию финансового аналитика.', study: 'VERIFIED', status: 'IN_PROGRESS', seenMinutesAgo: 300, registeredDaysAgo: 70 },
  { name: 'Нуриева Камилла Ренатовна', gender: 'FEMALE', age: 19, university: KAI, speciality: 'Реклама и связи с общественностью', studyYear: 2, city: 'Казань', skills: ['SMM', 'Canva', 'Фото', 'Видео'], about: 'Снимаю и монтирую для университетского медиацентра.', study: 'VERIFIED', seenMinutesAgo: 8, registeredDaysAgo: 9 },
  { name: 'Белов Максим Игоревич', gender: 'MALE', age: 22, university: KNRTU, speciality: 'Нефтегазовое дело', studyYear: 4, city: 'Альметьевск', skills: ['AutoCAD', 'Excel'], about: 'Практика на нефтебазе, ищу удалённую подработку.', study: 'VERIFIED', status: 'PAUSED', seenMinutesAgo: 60 * 24 * 12, registeredDaysAgo: 80 },
  { name: 'Фаттахова Ляйсан Рустемовна', gender: 'FEMALE', age: 21, university: KFU, speciality: 'Психология', studyYear: 3, city: 'Казань', skills: ['Интервью', 'Excel', 'Английский B2'], about: 'Проводила кастдевы и исследования для студенческого стартапа. Интересует HR и подбор персонала.', study: 'VERIFIED', seenMinutesAgo: 1, registeredDaysAgo: 4 },
  { name: 'Орлов Никита Павлович', gender: 'MALE', age: 19, university: KAI, speciality: 'Информационная безопасность', studyYear: 2, city: 'Казань', skills: ['Python', 'Linux', 'Сети'], about: null, study: 'PENDING', seenMinutesAgo: 45, registeredDaysAgo: 5 },
  { name: 'Абдуллина Регина Фанисовна-Мингалеева-Сабирзянова', gender: 'FEMALE', age: 20, university: LONG_UNI, speciality: 'Программная инженерия, профиль «Разработка мобильных и распределённых приложений»', studyYear: 3, city: 'Казань', skills: ['Kotlin', 'Android', 'Тестирование', 'Английский', 'Git', 'SQL', 'Docker', 'Kubernetes'], about: 'Разрабатываю мобильные приложения, участвовала в хакатонах. '.repeat(8), study: 'VERIFIED', seenMinutesAgo: 3, registeredDaysAgo: 18 },
  { name: 'Смирнов Константин Львович', gender: 'MALE', age: 24, university: KFU, speciality: 'Экономика', studyYear: 5, city: 'Москва', skills: ['Аналитика', 'Power BI', 'SQL'], about: 'Переехал в Москву, учусь заочно.', study: 'VERIFIED', status: 'PLACED', seenMinutesAgo: 60 * 24 * 20, registeredDaysAgo: 100 },
  { name: 'Галиева Алсу Тагировна', gender: 'FEMALE', age: 18, university: 'КГМУ', speciality: 'Педиатрия', studyYear: 1, city: 'Казань', skills: ['Первая помощь'], about: 'Волонтёр в детской больнице.', study: 'NONE', seenMinutesAgo: 20, hidePresence: true, registeredDaysAgo: 1 },
  { name: 'Попов Денис Васильевич', gender: 'MALE', age: 23, university: KNRTU, speciality: 'Автоматизация технологических процессов', studyYear: 4, city: 'Казань', skills: ['SQL', 'Python', 'Excel', 'Статистика'], about: 'Опыт работы на производстве, интересует аналитика данных.', study: 'VERIFIED', seenMinutesAgo: 60 * 8, registeredDaysAgo: 25 },
  { name: 'Зиннатуллина Лилия Ильгизовна', gender: 'FEMALE', age: 22, university: KFU, speciality: 'Востоковедение', studyYear: 4, city: 'Казань', skills: ['Китайский HSK4', 'Английский C1', 'Перевод'], about: 'Переводчик с китайского, ищу проектную работу.', study: 'VERIFIED', seenMinutesAgo: 60 * 24 * 3, registeredDaysAgo: 33 },
  { name: 'Кузнецов Егор Алексеевич', gender: 'MALE', age: 20, university: 'КГАСУ', speciality: 'Архитектура', studyYear: 3, city: 'Казань', skills: ['AutoCAD', 'SketchUp', 'Photoshop'], about: 'Делаю визуализации интерьеров.', study: 'PENDING', seenMinutesAgo: 120, registeredDaysAgo: 7 },
  { name: 'Мухаметшина Эльмира Альбертовна', gender: 'FEMALE', age: 25, university: KFU, speciality: 'Менеджмент организации', studyYear: 6, city: 'Казань', skills: ['Продажи', 'CRM', 'Excel', 'Переговоры'], about: 'Есть опыт в продажах и администрировании, ищу подработку по выходным.', study: 'VERIFIED', status: 'IN_PROGRESS', seenMinutesAgo: 15, registeredDaysAgo: 45 },
  { name: 'Романов Илья Петрович', gender: 'MALE', age: 21, university: KAI, speciality: 'Мехатроника и робототехника', studyYear: 3, city: 'Казань', skills: ['C++', 'Arduino', 'Python'], about: 'Собираю роботов для соревнований.', study: 'VERIFIED', seenMinutesAgo: 70, registeredDaysAgo: 22 },
  { name: 'Латыпова Гузель Радиковна', gender: 'FEMALE', age: 19, university: KNRTU, speciality: 'Дизайн', studyYear: 2, city: 'Казань', skills: ['Figma', 'Canva', 'Иллюстрация', 'SMM'], about: 'Рисую карточки товаров и оформляю соцсети малого бизнеса.', study: 'NONE', seenMinutesAgo: 6, registeredDaysAgo: 2 },
  { name: 'Борисов Тимофей Андреевич', gender: 'MALE', age: 18, university: 'КГЭУ', speciality: 'Информатика', studyYear: 1, city: 'Зеленодольск', skills: ['Python'], about: null, study: 'NONE', seenMinutesAgo: 60 * 24 * 9, registeredDaysAgo: 11 },
  { name: 'Назарова Полина Артуровна', gender: 'FEMALE', age: 22, university: KFU, speciality: 'Лингвистика', studyYear: 4, city: 'Казань', skills: ['Английский C1', 'Немецкий B2', 'Копирайтинг'], about: 'Ищу проектную работу переводчика.', study: 'VERIFIED', seenMinutesAgo: 10, registeredDaysAgo: 14 },
];

function birth(age: number): { birthDate: string; birthYear: number } {
  const now = new Date();
  // 1 января: возраст «age» держится весь год, на границе суток ошибки нет
  const year = now.getFullYear() - age;
  return { birthDate: `${year}-01-01`, birthYear: year };
}

async function main() {
  const institutions = new Map<string, string>();
  for (const item of DEMO_INSTITUTIONS) {
    const row = await prisma.institution.findUnique({ where: { slug: item.slug } });
    if (row) {
      institutions.set(row.name, row.id);
      if (row.shortName) institutions.set(row.shortName, row.id);
    }
  }

  const passwordHash = await hashPassword(DEMO_CREDENTIALS.student.password);
  let n = 0;
  for (const [i, d] of DEMO.entries()) {
    const email = `search-demo-${i + 1}@demo.ru`;
    const emailHash = blindIndex(email);
    const seen = d.seenMinutesAgo === null ? null : new Date(Date.now() - d.seenMinutesAgo * 60_000);
    const created = new Date(Date.now() - d.registeredDaysAgo * 86_400_000 - i * 60_000);
    const account = await prisma.account.upsert({
      where: { emailHash },
      update: { lastSeenAt: seen, showPresence: !d.hidePresence },
      create: {
        role: 'STUDENT',
        emailEnc: encrypt(email),
        emailHash,
        passwordHash,
        emailVerifiedAt: new Date(),
        lastSeenAt: seen,
        showPresence: !d.hidePresence,
        createdAt: created,
      },
    });
    const { birthDate, birthYear } = birth(d.age);
    const data = {
      fullNameEnc: encrypt(d.name),
      phoneEnc: encrypt(`+7 9${(17 + i) % 100}${i % 10} 20${i % 10}-3${i % 10}-4${(i + 3) % 10}`),
      gender: d.gender,
      birthYear,
      birthDateEnc: encrypt(birthDate),
      university: d.university,
      speciality: d.speciality,
      studyYear: d.studyYear,
      institutionId: institutions.get(d.university) ?? null,
      studyVerified: d.study === 'VERIFIED',
      studyVerifiedAt: d.study === 'VERIFIED' ? new Date() : null,
      studyDocUrl: d.study === 'PENDING' ? '/api/files/study/00000000-0000-0000-0000-000000000000.pdf' : null,
      studyDocName: d.study === 'PENDING' ? 'spravka.pdf' : null,
      studyDocAt: d.study === 'PENDING' ? new Date() : null,
      city: d.city,
      workDays: ['MON', 'WED', 'FRI'] as ('MON' | 'WED' | 'FRI')[],
      hoursPerWeek: 10 + (i % 4) * 5,
      skills: d.skills,
      about: d.about,
      lookingFor: (i % 2 === 0 ? ['INTERNSHIP', 'JOB'] : ['JOB']) as ('INTERNSHIP' | 'JOB')[],
      status: d.status ?? 'ACTIVE',
      consentVersion: 'demo',
      createdAt: created,
    };
    await prisma.student.upsert({
      where: { accountId: account.id },
      update: data,
      create: { accountId: account.id, ...data },
    });
    n++;
  }
  console.log(`Демо-студентов для поиска: ${n}`);
}

main()
  .catch((error) => {
    console.error('Не удалось заполнить базу:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
