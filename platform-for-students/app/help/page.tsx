import { getSession } from '@/lib/security/guards';
import { HOME_BY_ROLE } from '@/lib/security/session';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { SupportForm } from '@/components/forms/SupportForm';
import { ShowTourButton } from '@/components/onboarding/ShowTourButton';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { pageMetadata } from '@/lib/seo';
import { PENDING_APPLICATION_DAYS, STUDY_DOC_WORKDAYS } from '@/lib/study';

// Адрес в canonical и og:url — из APP_URL на запрос (см. lib/seo.ts)
export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return pageMetadata({
    title: 'Помощь',
    description: 'Как пользоваться платформой: студентам, компаниям и HR-менеджеру агентства.',
    path: '/help',
  });
}

interface Question {
  q: string;
  a: string;
}

const STUDENTS: Question[] = [
  {
    q: 'Как откликнуться на вакансию?',
    a: 'Смахните карточку в ленте вправо или нажмите «Откликнуться» в подробностях вакансии. Сопроводительное письмо не нужно — работодатель увидит ваш профиль.',
  },
  {
    q: 'Почему отклик «ждёт подтверждения учёбы»?',
    a: 'Работодатели видят только студентов, чью учёбу проверило агентство. Пока HR-менеджер не подтвердил учёбу, отклик сохраняется и ждёт, а после подтверждения уходит работодателю сам.',
  },
  {
    q: 'Как подтвердить учёбу?',
    a: `Загрузите справку об обучении или фото студенческого билета в разделе «Профиль» → «Учёба». Сделайте это в течение ${STUDY_DOC_WORKDAYS} рабочих дней после регистрации. HR-менеджер проверит файл и подтвердит учёбу или вернёт с причиной.`,
  },
  {
    q: 'Что будет, если не загрузить справку?',
    a: `Смотреть вакансии и свайпать можно и без неё. Но отклик, который ждёт подтверждения учёбы дольше ${PENDING_APPLICATION_DAYS} дней, удаляется, а вакансия возвращается в ленту.`,
  },
  {
    q: 'Кто видит мои данные?',
    a: 'Профиль без контактов — фамилию и имя, возраст, вуз, навыки, «о себе» и портфолио — видят работодатели, которые заключили договор с агентством или прошли его проверку: они ищут кандидатов и могут пригласить. Почту, телефон, фото и резюме работодатель видит, когда вы откликнулись на его вакансию или он пригласил вас. Дату рождения целиком не видит никто, кроме вас. Справку видит только HR-менеджер и удаляет после проверки.',
  },
  {
    q: 'Почему нельзя выбрать больше часов?',
    a: 'Часы в неделю должны помещаться в выбранные дни: не больше восьми часов на день и сорока в неделю. Отметьте больше дней — станут доступны большие варианты.',
  },
  {
    q: 'Как удалить профиль?',
    a: 'В разделе «Профиль» внизу страницы. Вместе с профилем удаляются отклики и переписка — это и есть отзыв согласия на обработку данных.',
  },
];

const COMPANIES: Question[] = [
  {
    q: 'Как зарегистрировать компанию?',
    a: 'Регистрация компании переехала в CRM агентства: укажите рабочую почту, телефон и пароль, подтвердите код с почты — кабинет откроется сразу. Название компании и ИНН агентство запросит отдельно, для заключения договора.',
  },
  {
    q: 'Почему вакансия ещё не видна студентам?',
    a: 'Каждая вакансия проходит проверку агентства перед публикацией — обычно в течение рабочего дня. Статус видно в разделе «Вакансии»: черновик, на проверке, опубликована или возвращена с причиной.',
  },
  {
    q: 'Как опубликовать вакансию?',
    a: 'В разделе «Вакансии» создайте вакансию: должность, задачи, адрес, дни и часы. Отправьте на проверку — после одобрения агентством она появится в ленте студентов.',
  },
  {
    q: 'Почему опубликованная вакансия снова на проверке?',
    a: 'Любая правка опубликованной вакансии проверяется заново. Студенты, которые уже откликнулись, до проверки видят одобренную версию.',
  },
  {
    q: 'Как ответить студенту?',
    a: 'Откройте отклик в разделе «Отклики» или «Сообщения» и напишите первым. После вашего сообщения студент сможет ответить.',
  },
  {
    q: 'Как изменить название компании или ИНН?',
    a: 'Сейчас реквизиты передаёт и меняет ваш менеджер агентства — самостоятельно в кабинете это пока не редактируется.',
  },
];

const HR: Question[] = [
  {
    q: 'Как проверить компанию?',
    a: 'В разделе «Модерация» у каждой компании есть ИНН и ссылка на сайт ФНС. Проверьте, что компания действующая и название совпадает. Если о компании ничего не нашлось — позвоните по телефону из карточки.',
  },
  {
    q: 'Как проверить справку студента?',
    a: 'В разделе «Студенты» откройте файл справки. Сверьте фамилию, учебное заведение и дату выдачи. Подтвердите учёбу или верните справку с причиной — студент увидит её в профиле.',
  },
  {
    q: 'Что происходит после подтверждения учёбы?',
    a: 'Отклики студента, которые ждали подтверждения, сразу уходят работодателям. Файл справки удаляется — остаётся только отметка.',
  },
  {
    q: 'Где метрики пилота?',
    a: 'В разделе «Пилот»: регистрации, заполненные профили, отклики, приглашения и журнал событий. Публичный рейтинг вузов — на странице «Рейтинг вузов».',
  },
];

/**
 * Помощь — ответы на вопросы, с которыми приходят в первые дни.
 *
 * Открыта без входа: вопрос «как зарегистрировать компанию» задают до
 * регистрации. Ответы — раскрывающимися пунктами: так страница читается
 * списком вопросов, а не простынёй текста.
 */
export default async function HelpPage() {
  const session = await getSession();
  return (
    <div className="min-h-dvh">
      <header className="page-x mx-auto flex h-[var(--header-h)] max-w-3xl items-center justify-between gap-4">
        <Logo />
        <Link href={session ? HOME_BY_ROLE[session.role] : "/login"} className="text-small text-paper-faint transition-colors hover:text-paper">
          {session ? 'В кабинет' : 'Войти'}
        </Link>
      </header>

      <main className="page-x mx-auto max-w-3xl pb-24 pt-4">
        <h1 className="text-headline text-paper">Помощь</h1>
        <p className="mt-2.5 max-w-[56ch] text-body leading-relaxed text-paper-dim">
          Как устроена платформа для студентов, компаний и HR-менеджера агентства. Внутри кабинета эта
          страница и короткая инструкция — в меню профиля в шапке.
        </p>
        <div className="mt-5">
          <ShowTourButton />
        </div>

        <Group title="Студентам" items={STUDENTS} />
        <Group title="Компаниям" items={COMPANIES} />
        <Group title="HR-менеджеру агентства" items={HR} />

        <section className="mt-10">
          <SectionTitle>Написать в поддержку</SectionTitle>
          <div className="mt-4">
            <SupportForm />
          </div>
        </section>

        <p className="mt-10 text-small leading-relaxed text-paper-faint">
          Документы: <Link href="/legal/terms" className="underline underline-offset-4 hover:text-paper">пользовательское соглашение</Link>,{' '}
          <Link href="/legal/privacy" className="underline underline-offset-4 hover:text-paper">политика обработки персональных данных</Link>.
        </p>
      </main>
    </div>
  );
}

function Group({ title, items }: { title: string; items: Question[] }) {
  return (
    <section className="mt-10">
      <SectionTitle>{title}</SectionTitle>
      <div className="mt-4 space-y-2.5">
        {items.map((item) => (
          <details key={item.q} className="glass group rounded-2xl px-5 py-4">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-body font-medium text-paper [&::-webkit-details-marker]:hidden">
              {item.q}
              <ChevronDown className="mt-0.5 size-4 shrink-0 text-paper-faint transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <p className="mt-2.5 text-small leading-relaxed text-paper-dim">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
