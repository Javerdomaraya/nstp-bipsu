import React from 'react';
import Skeleton from './Skeleton';

export type PageHeaderSkeletonProps = {
  hasEyebrow?: boolean;
  hasSubtitle?: boolean;
  hasSearch?: boolean;
  hasActions?: boolean;
  className?: string;
};

export default function PageHeaderSkeleton({
  hasEyebrow = true,
  hasSubtitle = true,
  hasSearch = true,
  hasActions = true,
  className = '',
}: PageHeaderSkeletonProps) {
  return (
    <header
      aria-hidden="true"
      className={`sticky top-0 z-20 w-full min-w-0 border-b border-slate-200/80 bg-white/95 px-4 sm:px-6 py-2.5 sm:py-3.5 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 ${className}`}
    >
      <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              {hasEyebrow && <Skeleton className="h-2.5 w-20 rounded" />}
              <Skeleton className="h-6 sm:h-7 w-48 rounded-lg" />
              {hasSubtitle && <Skeleton className="hidden sm:block h-3.5 w-64 rounded" />}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3 lg:justify-end">
          {hasSearch && (
            <Skeleton className="h-9 sm:h-10 w-full sm:w-64 lg:w-80 rounded-xl" />
          )}
          {hasActions && (
            <Skeleton className="hidden lg:block h-9 sm:h-10 w-28 rounded-xl" />
          )}
        </div>
      </div>
    </header>
  );
}
