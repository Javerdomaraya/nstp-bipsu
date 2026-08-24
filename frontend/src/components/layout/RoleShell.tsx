import { ReactNode, useEffect, useState } from 'react';
import { CalendarDays, GraduationCap, LogOut, MoonStar, SunMedium } from 'lucide-react';
import type { AuthenticatedUser } from '../../services/authUser';

export type ShellSidebarItem = {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning' | 'info';
};

type Props = {
  /** Only the identity strip is rendered here: portal name, display name, email. */
  user: AuthenticatedUser;
  onLogout: () => void;
  eyebrow: string;
  title: string;
  description: string;
  sidebarTitle: string;
  sidebarItems: ShellSidebarItem[];
  children: ReactNode;
};

const toneClasses: Record<NonNullable<ShellSidebarItem['tone']>, string> = {
  default: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100',
  info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-100',
};

export default function RoleShell({
  user,
  onLogout,
  eyebrow,
  title,
  description,
  sidebarTitle,
  sidebarItems,
  children,
}: Props) {
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const savedTheme = localStorage.getItem('nstp-theme');
    return savedTheme === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
    localStorage.setItem('nstp-theme', themeMode);
  }, [themeMode]);

  return (
    <div className="min-h-screen bg-[#eef4fb] text-slate-900 dark:bg-[#0b1426] dark:text-slate-100">
      <div className="min-h-screen flex flex-col lg:flex-row p-2 md:p-3 gap-2 md:gap-3">
        <aside className="lg:w-80 xl:w-88 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/75 md:p-4">
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 overflow-hidden rounded-2xl border border-blue-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <img src="/bipsu-logo.png" alt="Biliran Province State University logo" className="h-full w-full object-contain" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight dark:text-slate-100">BiPSU NSTP Portal</h1>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-600 dark:text-slate-300">
                  {user.role === 'admin' ? 'Admin Portal' : user.role === 'facilitator' ? 'Facilitator Portal' : user.role === 'student' ? 'Student Portal' : 'NSTP Management System'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setThemeMode((mode) => (mode === 'dark' ? 'light' : 'dark'))}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              aria-label="Toggle theme"
            >
              {themeMode === 'dark' ? <SunMedium className="w-4 h-4" /> : <MoonStar className="w-4 h-4" />}
              {themeMode === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 mb-4 text-[0.98rem] dark:border-slate-700 dark:bg-slate-900/70">
            <p className="text-xs uppercase tracking-[0.18em] font-semibold text-blue-700 mb-2 dark:text-blue-300">Signed In</p>
            <p className="font-semibold text-slate-900 leading-tight dark:text-slate-100">{user.name}</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">{user.email}</p>
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <CalendarDays className="w-3.5 h-3.5 text-blue-700" />
              {new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 text-[0.98rem] shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-2 mb-3 text-slate-900 font-semibold dark:text-slate-100">
              <GraduationCap className="w-4 h-4 text-blue-700" />
              {sidebarTitle}
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
              {sidebarItems.map((item) => (
                <div key={item.label} className={`rounded-xl border px-3 py-2.5 ${toneClasses[item.tone || 'default']}`}>
                  <p className="text-xs uppercase tracking-[0.16em] font-semibold opacity-80">{item.label}</p>
                  <p className="mt-1 text-sm font-semibold leading-snug">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-[0.98rem] shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm font-semibold text-slate-900 mb-2 dark:text-slate-100">Account Actions</p>
            <button
              onClick={onLogout}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </aside>

        <main className="flex-1 min-h-0 overflow-hidden">
          <div className="size-full rounded-xl border border-slate-200/80 bg-white/75 shadow-[0_20px_60px_-32px_rgba(15,23,42,0.35)] overflow-hidden dark:border-slate-700 dark:bg-slate-950/70 dark:shadow-[0_20px_60px_-32px_rgba(2,6,23,0.8)]">
            <div className="flex flex-col gap-3 border-b border-slate-200/80 bg-white px-4 py-4 dark:border-slate-700 dark:bg-slate-900 md:flex-row md:items-center md:justify-between md:px-6">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] font-semibold text-blue-700 dark:text-blue-300">{eyebrow}</p>
                <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">{title}</h2>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 max-w-xl text-left md:text-right">
                {description}
              </p>
            </div>

            <div className="h-full overflow-auto p-3 md:p-4">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
