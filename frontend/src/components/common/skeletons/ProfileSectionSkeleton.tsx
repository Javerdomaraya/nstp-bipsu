import React from 'react';
import Skeleton from './Skeleton';

export type ProfileSectionSkeletonProps = {
  className?: string;
};

export default function ProfileSectionSkeleton({
  className = '',
}: ProfileSectionSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center gap-3 p-3 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      <Skeleton className="h-11 w-11 rounded-2xl shrink-0" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4 w-28 rounded" />
        <Skeleton className="h-3 w-36 rounded" />
      </div>
    </div>
  );
}
