import React from 'react';
import StatCardSkeleton from './StatCardSkeleton';

export type StatsGridSkeletonProps = {
  count?: number;
  className?: string;
};

export default function StatsGridSkeleton({
  count = 4,
  className = '',
}: StatsGridSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4 ${className}`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}
