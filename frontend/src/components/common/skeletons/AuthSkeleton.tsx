import React from 'react';
import Skeleton from './Skeleton';

export default function AuthSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm md:p-6"
    >
      <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 lg:grid lg:grid-cols-[400px_1fr]">
        {/* Left Branding Panel (Desktop) */}
        <div className="relative hidden bg-[#06245c] p-8 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Skeleton className="h-14 w-14 rounded-2xl bg-white/20" />
              <Skeleton className="h-14 w-14 rounded-2xl bg-white/20" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-32 rounded bg-white/20" />
              <Skeleton className="h-7 w-56 rounded-lg bg-white/25" />
              <Skeleton className="h-4 w-72 rounded bg-white/15" />
            </div>
            <div className="space-y-3 pt-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl bg-white/10 p-3">
                  <Skeleton className="h-4 w-4 rounded-full bg-white/30" />
                  <Skeleton className="h-3.5 w-48 rounded bg-white/20" />
                </div>
              ))}
            </div>
          </div>
          <div className="pt-6 border-t border-white/10">
            <Skeleton className="h-3 w-40 rounded bg-white/15" />
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="p-6 sm:p-8 md:p-10 space-y-6">
          {/* Header & Tabs */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-24 rounded" />
                <Skeleton className="h-6 w-44 rounded-lg" />
              </div>
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
            {/* Segmented Tab Pill */}
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>

          {/* Role selector pills */}
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 rounded-lg" />
            ))}
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-24 rounded" />
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-20 rounded" />
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
          </div>

          {/* Submit Button */}
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
