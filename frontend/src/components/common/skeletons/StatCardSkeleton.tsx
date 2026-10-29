import React from 'react';
import Skeleton from './Skeleton';

export type StatCardSkeletonProps = {
  hasProgress?: boolean;
  hasDetail?: boolean;
  className?: string;
};

export default function StatCardSkeleton({
  hasProgress = false,
  hasDetail = true,
  className = '',
}: StatCardSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`flex min-h-[6.75rem] w-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-24 rounded" />
            <Skeleton className="h-7 w-20 rounded-md" />
          </div>
          <Skeleton className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl shrink-0" />
        </div>
        {hasProgress && <Skeleton className="mt-2.5 h-1.5 w-full rounded-full" />}
      </div>
      {hasDetail && <Skeleton className="mt-2.5 h-3 w-36 rounded" />}
    </div>
  );
}
