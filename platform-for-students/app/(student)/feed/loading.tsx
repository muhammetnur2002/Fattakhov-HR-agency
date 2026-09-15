import { VacancyCardSkeleton, Skeleton } from '@/components/ui/Skeleton';

/** Заглушка ленты: та же геометрия, что и у настоящей колоды. */
export default function Loading() {
  return (
    <div className="flex flex-col items-center">
      <div className="mb-6 w-full max-w-[26rem] space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-[22rem]" />
      </div>
      <div className="h-[clamp(460px,64dvh,600px)] w-full max-w-[26rem]">
        <VacancyCardSkeleton />
      </div>
      <div className="mt-7 flex items-center justify-center gap-5">
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="size-11 rounded-full" />
        <Skeleton className="size-14 rounded-full" />
      </div>
    </div>
  );
}
