import React from 'react';
import Skeleton from './Skeleton';
import PageHeaderSkeleton from './PageHeaderSkeleton';
import StatsGridSkeleton from './StatsGridSkeleton';
import TableSkeleton from './TableSkeleton';

export type AppShellSkeletonProps = {
  portalLabel?: string;
};

export default function AppShellSkeleton({
  portalLabel = 'Loading workspace…',
}: AppShellSkeletonProps) {
  return (
    <div className="min-h-screen bg-[#edf5fb] text-[#061a42] dark:bg-[#08111f] dark:text-slate-100 flex flex-col lg:flex-row">
      {/* Sidebar Placeholder */}
      <aside
        aria-hidden="true"
        className="hidden lg:flex w-20 shrink-0 flex-col justify-between border-r border-white/10 bg-[#061f4f] p-4 text-white"
      >
        <div className="flex flex-col items-center gap-6">
          <Skeleton className="h-11 w-11 rounded-2xl bg-white/20" />
          <div className="flex flex-col items-center gap-4 w-full">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-10 rounded-xl bg-white/15" />
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl bg-white/15" />
          <Skeleton className="h-10 w-10 rounded-xl bg-white/15" />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <PageHeaderSkeleton />

        <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
          {/* Top greeting / banner */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-28 rounded" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
            <Skeleton className="h-6 w-64 rounded-md" />
            <Skeleton className="h-3.5 w-96 max-w-full rounded" />
          </div>

          {/* Stats Cards */}
          <StatsGridSkeleton count={4} />

          {/* Table / Content Section */}
          <TableSkeleton columns={5} rows={5} />
        </main>
      </div>
    </div>
  );
}
