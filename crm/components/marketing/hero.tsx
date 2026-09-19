import { HeroOffer } from "./hero-offer";
import { HeroVideo } from "./hero-video";
import { Button } from "@/components/ui/button";

/**
 * Первый экран.
 *
 * Композиция несимметричная: текст слева, фирменный знак справа крупно
 * на сланце. Центрированный заголовок на тёмном фоне читается как
 * презентация, а не как страница услуги.
 *
 * Внутри ровно четыре текстовых элемента: надзаголовок, заголовок,
 * подзаголовок, кнопки. Ни строчки о сроках, ни полосы с логотипами,
 * ни счётчиков: всё это ниже, отдельными блоками. Первый экран отвечает
 * на один вопрос, что мы делаем, и даёт одно действие.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-brand-slate text-white">
      {/* Видео вместо статичной картинки на широких экранах: тот же кроп,
          то же место. На узких и при reduced-motion — кадр постера: см.
          комментарий в HeroVideo про пропорции и предпочтение движения. */}
      <HeroVideo />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[url('/brand/slate-speckle.jpg')] bg-cover bg-center md:hidden motion-reduce:md:block"
      />
      {/* Плотнее, чем было у статичной картинки: собственные куб и надпись
          в ролике иначе читаются вторым логотипом рядом с ценником и
          спорят с ним за внимание — ролику место фоновой текстуры, а не
          второго знака на экране. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,rgba(8,12,16,0.94)_0%,rgba(8,12,16,0.85)_46%,rgba(8,12,16,0.72)_100%)]"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12 lg:py-28">
        <div>
          <div className="text-sm font-medium tracking-[0.14em] text-white/65 uppercase">
            Внешняя функция найма
          </div>

          {/* Переносы отданы text-balance. Жёсткий <br> тут стоял и делал
              хуже: он фиксировал первую строку, браузер добивал остаток
              по ширине, и последним словом на отдельной строке висело
              «нанимать.» Балансировщик распределяет ровнее сам */}
          <h1 className="mt-5 text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl md:text-6xl lg:text-[4.25rem]">
            Отдел найма, который не нужно нанимать.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70 md:text-xl">
            Выделенная команда из трёх человек, 30+ источников поиска
            и прозрачная воронка. Без найма, адаптации и постоянных расходов.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="secondary">
              <a href="#diagnostic">Получить план найма</a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <a href="#pricing">Как устроена подписка</a>
            </Button>
          </div>
        </div>

        {/*
          Справа ценник, а не фирменный знак. Знак красив, но на решение
          читать дальше не влияет, а разница в деньгах влияет. На узких
          экранах он идёт под текстом: там это первое, что видно после
          заголовка, и это правильный порядок.
        */}
        <div className="mt-10 lg:mt-0">
          <HeroOffer />
        </div>
      </div>
    </section>
  );
}
