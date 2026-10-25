import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type StatCardProps = {
  title: string;
  value: string | number;
  detail?: string;
  icon: LucideIcon;
  target?: string;
  onClick?: () => void;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  badge?: string;
  progress?: number;
};

const toneStyles = {
  default: {
    iconBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    valColor: 'text-slate-900 dark:text-slate-100',
    border: 'border-slate-200 dark:border-slate-800',
  },
  primary: {
    iconBg: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    valColor: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-100 dark:border-blue-900/30',
  },
  success: {
    iconBg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    valColor: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-100 dark:border-emerald-900/30',
  },
  warning: {
    iconBg: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    valColor: 'text-amber-800 dark:text-amber-300',
    border: 'border-amber-100 dark:border-amber-900/30',
  },
  danger: {
    iconBg: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    valColor: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-100 dark:border-rose-900/30',
  },
};

export default function StatCard({
  title,
  value,
  detail,
  icon: Icon,
  onClick,
  tone = 'primary',
  badge,
  progress,
}: StatCardProps) {
  const styles = toneStyles[tone] || toneStyles.primary;
  const isClickable = Boolean(onClick);

  return (
    <div
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => e.key === 'Enter' && onClick?.() : undefined}
      className={`group flex min-h-[6.75rem] w-full flex-col justify-between rounded-2xl border bg-white p-3.5 sm:p-4 shadow-sm transition-all duration-200 ${
        isClickable
          ? 'cursor-pointer hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:hover:border-blue-700'
          : ''
      } ${styles.border} dark:bg-slate-900`}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 break-words leading-tight">
                {title}
              </p>
              {badge && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {badge}
                </span>
              )}
            </div>
            <p className={`mt-1 text-xl sm:text-2xl font-bold tracking-tight break-words ${styles.valColor}`}>
              {value}
            </p>
          </div>
          <span
            className={`grid h-9 w-9 sm:h-10 sm:w-10 shrink-0 place-items-center rounded-xl transition-transform group-hover:scale-105 ${styles.iconBg}`}
          >
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
        </div>
        {progress !== undefined && (
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                tone === 'success'
                  ? 'bg-emerald-500'
                  : tone === 'warning'
                  ? 'bg-amber-500'
                  : tone === 'danger'
                  ? 'bg-rose-500'
                  : 'bg-blue-600'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}
      </div>
      {detail && (
        <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-400 break-words leading-relaxed">
          {detail}
        </p>
      )}
    </div>
  );
}
