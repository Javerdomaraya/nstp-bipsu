import React, { ReactNode } from 'react';
import { LucideIcon, Inbox } from 'lucide-react';

export type ColumnDef<T> = {
  key: string;
  header: string;
  /** Custom renderer for cell value. Receives row and row index */
  render?: (row: T, index: number) => ReactNode;
  /** Whether this column acts as the primary title/identifier on mobile card view */
  isPrimary?: boolean;
  /** Label to display on mobile card view. If omitted, uses `header` */
  mobileLabel?: string;
  /** If true, this column will not be shown in the mobile card view */
  hideOnMobile?: boolean;
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
  /** Width class (e.g. 'w-32', 'w-1/4') */
  width?: string;
};

export type DataTableProps<T> = {
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor: (item: T, index: number) => string | number;
  emptyMessage?: string;
  emptySubtext?: string;
  emptyIcon?: LucideIcon;
  isLoading?: boolean;
  title?: string;
  subtitle?: string;
  actionSlot?: ReactNode;
  onRowClick?: (item: T) => void;
  className?: string;
};

const alignClasses = {
  left: 'text-left justify-start',
  center: 'text-center justify-center',
  right: 'text-right justify-end',
};

export default function DataTable<T>({
  data,
  columns,
  keyExtractor,
  emptyMessage = 'No records found',
  emptySubtext = 'There are no entries available to display right now.',
  emptyIcon: EmptyIcon = Inbox,
  isLoading = false,
  title,
  subtitle,
  actionSlot,
  onRowClick,
  className = '',
}: DataTableProps<T>) {
  const primaryColumn = columns.find((c) => c.isPrimary) || columns[0];
  const secondaryColumns = columns.filter((c) => c !== primaryColumn && !c.hideOnMobile);

  const renderCellContent = (col: ColumnDef<T>, row: T, index: number) => {
    if (col.render) {
      return col.render(row, index);
    }
    const val = (row as Record<string, unknown>)[col.key];
    if (val === null || val === undefined) return '—';
    return String(val);
  };

  return (
    <div className={`w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {(title || subtitle || actionSlot) && (
        <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 dark:border-slate-800">
          <div>
            {title && (
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 sm:text-lg">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
                {subtitle}
              </p>
            )}
          </div>
          {actionSlot && <div className="flex items-center gap-2">{actionSlot}</div>}
        </div>
      )}

      {isLoading ? (
        <div className="flex min-h-[12rem] flex-col items-center justify-center p-8 text-center" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-600 border-t-transparent" />
          <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">Loading data…</p>
        </div>
      ) : data.length === 0 ? (
        <div className="flex min-h-[12rem] flex-col items-center justify-center p-8 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <EmptyIcon className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-200">{emptyMessage}</p>
          <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">{emptySubtext}</p>
        </div>
      ) : (
        <>
          {/* Mobile Card List (< 768px / md) */}
          <div className="space-y-2.5 p-3 md:hidden">
            {data.map((row, index) => {
              const rowKey = keyExtractor(row, index);
              const isClickable = Boolean(onRowClick);

              return (
                <div
                  key={rowKey}
                  onClick={isClickable ? () => onRowClick?.(row) : undefined}
                  role={isClickable ? 'button' : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                  className={`rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 transition-all dark:border-slate-800 dark:bg-slate-900/60 ${
                    isClickable
                      ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/80 active:scale-[0.99]'
                      : ''
                  }`}
                >
                  {/* Primary Heading */}
                  {primaryColumn && (
                    <div className="mb-2.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {renderCellContent(primaryColumn, row, index)}
                    </div>
                  )}

                  {/* Secondary Key-Value Attributes */}
                  <div className="space-y-1.5 pt-1 text-xs">
                    {secondaryColumns.map((col) => {
                      const label = col.mobileLabel || col.header;
                      return (
                        <div key={col.key} className="flex items-center justify-between gap-2 py-0.5">
                          <span className="font-medium text-slate-500 shrink-0 dark:text-slate-400">
                            {label}
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 text-right min-w-0 break-words">
                            {renderCellContent(col, row, index)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Semantic Table (>= 768px / md) */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/75 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  {columns.map((col) => {
                    const align = col.align ? alignClasses[col.align] : 'text-left';
                    return (
                      <th
                        key={col.key}
                        scope="col"
                        className={`px-4 py-3.5 font-semibold ${align} ${col.width || ''}`}
                      >
                        {col.header}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.map((row, index) => {
                  const rowKey = keyExtractor(row, index);
                  const isClickable = Boolean(onRowClick);

                  return (
                    <tr
                      key={rowKey}
                      onClick={isClickable ? () => onRowClick?.(row) : undefined}
                      className={`transition-colors ${
                        isClickable
                          ? 'cursor-pointer hover:bg-blue-50/40 dark:hover:bg-blue-900/10'
                          : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      {columns.map((col) => {
                        const align = col.align ? alignClasses[col.align] : 'text-left';
                        return (
                          <td
                            key={col.key}
                            className={`px-4 py-3 text-slate-700 dark:text-slate-200 ${align} ${col.width || ''}`}
                          >
                            {renderCellContent(col, row, index)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
