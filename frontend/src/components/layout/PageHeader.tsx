import React, { ReactNode } from 'react';
import { Menu, Search } from 'lucide-react';

export type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  onMenuClick?: () => void;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  onSearchSubmit?: () => void;
  searchPlaceholder?: string;
  actionsSlot?: ReactNode;
  hint?: string;
  className?: string;
};

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  onMenuClick,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  searchPlaceholder = 'Search…',
  actionsSlot,
  hint,
  className = '',
}: PageHeaderProps) {
  const hasSearch = onSearchChange !== undefined;

  return (
    <header className={`sticky top-0 z-20 w-full min-w-0 border-b border-slate-200/80 bg-white/95 px-4 sm:px-6 py-2.5 sm:py-3.5 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 ${className}`}>
      <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-4">
        {/* Top bar on mobile / Left area on desktop */}
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {onMenuClick && (
              <button
                type="button"
                onClick={onMenuClick}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/40 lg:hidden dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800 sm:h-10 sm:w-10"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              {eyebrow && (
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-700 sm:text-xs dark:text-blue-400">
                  {eyebrow}
                </p>
              )}
              <h1 className="truncate text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
                {title}
              </h1>
              {subtitle && (
                <p className="hidden sm:block truncate text-xs text-slate-500 sm:text-sm dark:text-slate-400">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* On mobile, render actionsSlot right aligned in top row */}
          {actionsSlot && (
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 lg:hidden">
              {actionsSlot}
            </div>
          )}
        </div>

        {/* Desktop actions + Search row */}
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3 lg:justify-end">
          {hasSearch && (
            <div className="relative min-w-0 w-full sm:w-64 lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSearchSubmit?.()}
                className="h-9 sm:h-10 w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-700 shadow-sm transition placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          )}

          {/* Desktop actions slot */}
          {actionsSlot && (
            <div className="hidden lg:flex shrink-0 items-center gap-2">
              {actionsSlot}
            </div>
          )}
        </div>
      </div>

      {hint && (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      )}
    </header>
  );
}
