import React from 'react';
import Skeleton from './Skeleton';

export type ListSkeletonProps = {
  count?: number;
  className?: string;
};

export default function ListSkeleton({
  count = 3,
  className = '',
}: ListSkeletonProps) {
  return (
    <div aria-hidden="true" className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <Skeleton className="h-4 w-1/3 rounded" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-full rounded mb-1.5" />
          <Skeleton className="h-3 w-3/4 rounded mb-3" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-20 rounded" />
            <Skeleton className="h-3 w-24 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
