import React from 'react';
import Skeleton from './Skeleton';
import { cn } from '../../ui/utils';

export type TableSkeletonProps = {
  columns?: number;
  rows?: number;
  hasHeader?: boolean;
  className?: string;
};

function getCellWidth(cIdx: number, totalCols: number): string {
  if (cIdx === 0) return 'w-36';
  if (cIdx === 1) return 'w-24';
  if (cIdx === totalCols - 1) return 'w-16';
  return 'w-20';
}

export default function TableSkeleton({
  columns = 4,
  rows = 5,
  hasHeader = true,
  className = '',
}: TableSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900',
        className
      )}
    >
      {hasHeader ? (
        <div className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:p-5 dark:border-slate-800">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-5 w-40 rounded" />
            <Skeleton className="h-3 w-60 rounded" />
          </div>
          <Skeleton className="h-9 w-24 rounded-xl" />
        </div>
      ) : null}

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/75 dark:border-slate-800 dark:bg-slate-950/60">
            <tr>
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="px-4 py-3.5 sm:px-6">
                  <Skeleton className={cn('h-3.5 rounded', i === 0 ? 'w-28' : 'w-20')} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {Array.from({ length: rows }).map((_, rIdx) => (
              <tr key={rIdx}>
                {Array.from({ length: columns }).map((_, cIdx) => (
                  <td key={cIdx} className="px-4 py-3.5 sm:px-6">
                    <Skeleton className={cn('h-4 rounded', getCellWidth(cIdx, columns))} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="divide-y divide-slate-100 p-3 md:hidden dark:divide-slate-800">
        {Array.from({ length: Math.min(rows, 3) }).map((_, idx) => (
          <div key={idx} className="space-y-2.5 p-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32 rounded" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-48 rounded" />
            <Skeleton className="h-3 w-28 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

