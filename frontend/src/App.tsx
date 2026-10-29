import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, Users, BarChart3, LogOut, CalendarDays, LayoutGrid, ClipboardList, MoonStar, SunMedium, Mic2, Bell, Maximize2, Search, ChevronDown, TrendingUp, Award, Menu, X, UserRound, Settings, ShieldCheck, SlidersHorizontal, History, CircleHelp, LockKeyhole, CheckCircle2, Download, Send, Save, Mail, RotateCcw } from 'lucide-react';
const LoginPage = React.lazy(() => import('./features/auth/pages/LoginPage'));
const GeneralEducation = React.lazy(() => import('./features/enrollment/GeneralEducation'));
const EnrollmentPage = React.lazy(() => import('./pages/EnrollmentPage'));
const QualifyingExam = React.lazy(() => import('./features/enrollment/QualifyingExam'));
const PendingAssignment = React.lazy(() => import('./features/enrollment/PendingAssignment'));
const ModulesPage = React.lazy(() => import('./pages/ModulesPage'));
const AssessmentsPage = React.lazy(() => import('./pages/AssessmentsPage'));
const AssessmentManager = React.lazy(() => import('./features/assessments/components/AssessmentManager'));
const ProgressTracker = React.lazy(() => import('./features/progress/pages/ProgressTracker'));
const AdminDashboard = React.lazy(() => import('./features/admin/pages/AdminDashboard'));
const FacilitatorDashboard = React.lazy(() => import('./features/facilitator/pages/FacilitatorDashboard'));
const CoordinatorDashboard = React.lazy(() => import('./features/coordinator/pages/CoordinatorDashboard'));
const AnnouncementsCenter = React.lazy(() => import('./features/announcements/pages/AnnouncementsCenter'));
const ReportsCenter = React.lazy(() => import('./pages/ReportsPage'));
const GradesPage = React.lazy(() => import('./pages/GradesPage'));
const RoleDashboardHome = React.lazy(() => import('./features/dashboard/pages/RoleDashboardHome'));
const StudentAttendanceView = React.lazy(() => import('./features/dashboard/components/StudentAttendanceView'));
import CollapsibleRoleSidebar from './components/layout/CollapsibleRoleSidebar';
import AppShell from './components/layout/AppShell';
import PageHeader from './components/layout/PageHeader';
import { safeJsonParse, setSessionUser, toNstpComponent, clearSessionSnapshots } from './data/nstpData';
import { useAnnouncements, useModules, useAssessments } from './hooks/index';
import type { NstpAccount } from './data/nstpData';
import { connectSocket, disconnectSocket } from './services/socketClient';
import { fetchCurrentUser, logoutCurrentUser } from './services/api';
import { normalizeAuthenticatedUser, type AuthenticatedUser, type StudentUser } from './services/authUser';
import { toast, Toaster } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './components/ui/dialog';
import SectionErrorBoundary from './components/common/SectionErrorBoundary';

type ShellSection = 'overview' | 'modules' | 'assessments' | 'progress' | 'attendance' | 'grades' | 'admin' | 'facilitator' | 'coordinator' | 'announcements' | 'reports';
type AccountUtility = 'profile' | 'settings' | 'security' | 'accessibility' | 'activity' | 'help';
type AccountPreferences = {
  defaultLanding: ShellSection;
  notificationDigest: boolean;
  emailAlerts: boolean;
  compactCards: boolean;
  fontScale: 'standard' | 'large';
  reduceMotion: boolean;
  focusMode: boolean;
  highContrast: boolean;
};

type AccountActivity = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
};

type AuthSplashState = {
  visible: boolean;
  mode: 'login' | 'logout';
  userName?: string;
};

const SENSITIVE_STORAGE_KEYS = new Set([
  'nstpUser', 'nstp-accounts', 'nstp-pending-student-registrations', 'nstp-grade-records',
  'nstp-attendance-records', 'nstp-attendance-sessions', 'nstp-student-roster',
  'nstp-assessment-library', 'nstp-module-library', 'nstp-training-groups',
  'qualifyingExamResults', 'nstp-component-application-state', 'nstp-admin-audit-log', 'nstp-pending-sync',
]);

function cleanupSensitiveStorage() {
  // Two stores, both cleared: the browser keys listed above, and the in-memory
  // snapshot map inside nstpData. Clearing only `localStorage` used to leave the
  // previous account's cached roster/module/assessment snapshots alive for the
  // next sign-in on the same tab, because the app does not reload between them.
  clearSessionSnapshots();
  for (const key of Object.keys(localStorage)) {
    if (SENSITIVE_STORAGE_KEYS.has(key) || /^(progress-|assessments-|assessments-history-|examResult-|general-education-)/.test(key)) {
      localStorage.removeItem(key);
    }
  }
}


const DEFAULT_ACCOUNT_PREFERENCES: AccountPreferences = {
  defaultLanding: 'overview',
  notificationDigest: true,
  emailAlerts: false,
  compactCards: false,
  fontScale: 'standard',
  reduceMotion: false,
  focusMode: false,
  highContrast: false,
};

function AuthSplash({ mode, userName }: { mode: 'login' | 'logout' | 'boot'; userName?: string }) {
  const isLogin = mode === 'login';
  const isBoot = mode === 'boot';
  const titleText = isBoot ? 'NSTP for BiPSU' : isLogin ? 'Welcome back' : 'Signing out';
  const bodyText = isBoot
    ? 'Loading your dashboard...'
    : isLogin
    ? `Signing in${userName ? `, ${userName.split(' ')[0]}` : ''}...`
    : 'Please wait...';
  const [progress, setProgress] = useState(10);
  const progressDurationMs = isBoot ? 1300 : isLogin ? 2100 : 1800;
  useEffect(() => {
    const startedAt = performance.now();
    const progressTicker = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const ratio = Math.max(0, Math.min(1, elapsed / progressDurationMs));
      setProgress(Math.round(10 + ratio * 90));
    }, 60);
    return () => window.clearInterval(progressTicker);
  }, [progressDurationMs]);

  return (
    <div className="fixed left-0 top-0 z-[9999] h-dvh w-screen flex items-center justify-center overflow-hidden bg-[#082d73]">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#06245c_0%,#0b4ea2_52%,#f2b705_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(180deg,transparent,rgba(2,6,23,0.45))]" />
      <div className="absolute -left-20 top-10 h-64 w-64 rounded-full border border-white/20" />
      <div className="absolute -right-16 bottom-16 h-72 w-72 rounded-full border border-[#ffd24d]/50" />
      <div className="absolute left-[8%] top-[18%] h-20 w-20 rotate-45 border border-white/20" />
      <div className="absolute right-[18%] top-[16%] h-1 w-32 rounded-full bg-[#ffd24d]/70" />
      <div className="absolute bottom-[18%] left-[18%] h-1 w-40 rounded-full bg-white/35" />

      <div
        className="relative w-[min(94vw,760px)] rounded-2xl border border-white/35 bg-white/92 p-6 shadow-[0_28px_90px_-34px_rgba(15,23,42,0.9)] transition-transform duration-200 dark:border-slate-600/60 dark:bg-slate-900/90"
      >
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-blue-200 bg-white p-1.5 shadow-sm dark:border-blue-400/30 dark:bg-slate-950">
              <img src="/bipsu-logo.png" alt="Biliran Province State University logo" className="h-full w-full object-contain" />
              <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-white bg-[#f2b705] dark:border-slate-900" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">Biliran Province State University</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{titleText}</h3>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-300">NSTP Portal for Brilliance, Innovation, Progress, Service and Unity</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold text-slate-700 dark:text-slate-200">
            <span className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-500/30 dark:bg-blue-500/10">CWTS</span>
            <span className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-500/30 dark:bg-blue-500/10">LTS</span>
            <span className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/10">MTS</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-950/70">
          <div className="mb-2 flex items-center justify-between gap-2 text-sm text-slate-700 dark:text-slate-200">
            <span className="inline-flex items-center gap-2 font-semibold">{bodyText}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-full animate-[splashPulse_1.05s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-blue-700 to-cyan-500" style={{ width: `${Math.max(progress, 16)}%` }} />
          </div>
        </div>
        <div className="mt-4 grid gap-2 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-3">
          <span>BiPSU blue and gold identity</span>
          <span>Student ID verification</span>
          <span>Grades and clearance portal</span>
        </div>
      </div>
    </div>
  );
}

const NAV_ITEMS: Record<string, Array<{ id: ShellSection; label: string; icon: any }>> = {
  student: [
    { id: 'overview', label: 'Dashboard', icon: LayoutGrid },
    { id: 'modules', label: 'Modules', icon: BookOpen },
    { id: 'assessments', label: 'Assessments', icon: ClipboardList },
    { id: 'progress', label: 'Progress', icon: TrendingUp },
    { id: 'attendance', label: 'Attendance', icon: CalendarDays },
    { id: 'grades', label: 'Grades', icon: Award },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'announcements', label: 'Announcements', icon: Bell },
  ],
  admin: [
    { id: 'overview', label: 'Dashboard', icon: LayoutGrid },
    { id: 'admin', label: 'Students & Enrollment', icon: Users },
    { id: 'modules', label: 'Modules', icon: BookOpen },
    { id: 'assessments', label: 'Assessments', icon: ClipboardList },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'announcements', label: 'Announcements', icon: Bell },
  ],
  facilitator: [
    { id: 'facilitator', label: 'Dashboard', icon: Mic2 },
    { id: 'modules', label: 'Modules', icon: BookOpen },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'announcements', label: 'Announcements', icon: Bell },
  ],
  coordinator: [
    { id: 'overview', label: 'Dashboard', icon: LayoutGrid },
    { id: 'coordinator', label: 'Facilitators', icon: Users },
    { id: 'modules', label: 'Modules', icon: BookOpen },
    { id: 'assessments', label: 'Assessments', icon: ClipboardList },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'announcements', label: 'Announcements', icon: Bell },
  ],
};

export default function App() {
  // The session is a discriminated union, so every screen below has to prove
  // which workspace it is rendering before it can read role-specific fields.
  // `normalizeAuthenticatedUser` is the only writer, and it returns null rather
  // than an unclassifiable user, which is why `null` is the sole other state.
  const [user, setUser] = useState<AuthenticatedUser | null>(() => {
    if (typeof window === 'undefined') return null;
    const devSession = window.sessionStorage.getItem('nstp-dev-session');
    if (devSession) {
      try {
        return normalizeAuthenticatedUser(JSON.parse(devSession));
      } catch {
        return null;
      }
    }
    return null;
  });
  const [activeSection, setActiveSection] = useState<ShellSection>('overview');
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('nstp-theme') as 'light' | 'dark' | null;
    return savedTheme === 'dark' ? 'dark' : 'light';
  });
  const [headerSearch, setHeaderSearch] = useState('');
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [workspaceLabel, setWorkspaceLabel] = useState('nstp-system/main');
  const [adminInitialView, setAdminInitialView] = useState<'overview' | 'enrollment' | 'students' | 'tools' | 'modules' | 'assessments' | 'facilitators' | 'assignments'>('overview');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [accountUtility, setAccountUtility] = useState<AccountUtility | null>(null);
  const [accountPreferences, setAccountPreferences] = useState<AccountPreferences>(DEFAULT_ACCOUNT_PREFERENCES);
  const [accountActivity, setAccountActivity] = useState<AccountActivity[]>([]);
  const [profileDraft, setProfileDraft] = useState({ name: '', email: '' });
  const [supportMessage, setSupportMessage] = useState('');
  const [supportStatus, setSupportStatus] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [headerHint, setHeaderHint] = useState<string | null>(null);
  const isStaff = user?.role === 'admin' || user?.role === 'coordinator' || user?.role === 'facilitator';
  const { data: serverNotices = [] } = useAnnouncements();
  const { data: serverModules = [] } = useModules({ enabled: isStaff });
  const { data: serverAssessments = [] } = useAssessments({ enabled: isStaff });
  const [readNoticeIds, setReadNoticeIds] = useState<string[]>([]);
  const [authSplash, setAuthSplash] = useState<AuthSplashState>({ visible: false, mode: 'login' });
  const [isAuthTransitioning, setIsAuthTransitioning] = useState(false);
  const [isBootSplashVisible, setIsBootSplashVisible] = useState(true);
  const [dataReady, setDataReady] = useState(false);
  const queryClient = useQueryClient();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const authTimerRef = useRef<number | null>(null);
  const pendingLoginRef = useRef<AuthenticatedUser | null>(null);
  const authModeRef = useRef<'login' | 'logout'>('login');
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);

  const clearAuthTimer = () => {
    if (authTimerRef.current !== null) {
      window.clearTimeout(authTimerRef.current);
      authTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearAuthTimer();
    };
  }, []);

  const completeAuthTransition = () => {
    clearAuthTimer();

    if (authModeRef.current === 'login') {
      const nextUser = pendingLoginRef.current;
      if (nextUser) {
        setUser(nextUser);
        setSessionUser(nextUser);
        // Facilitators land on their own workspace; every other role opens on the
        // overview its shell defines. The four-branch chain this replaced set the
        // same section three times, which read as though the roles differed.
        setActiveSection(nextUser.role === 'facilitator' ? 'facilitator' : 'overview');
      }
    } else {
      setUser(null);
      setSessionUser(null);
      setActiveSection('overview');
    }

    pendingLoginRef.current = null;
    setAuthSplash((state) => ({ ...state, visible: false }));
    setIsAuthTransitioning(false);
  };

  useEffect(() => {
    let syncInterval: ReturnType<typeof setInterval> | null = null;
    async function init() {
      cleanupSensitiveStorage();
      try {
        const current = await fetchCurrentUser();
        if (current?.success && current.data) {
          // /auth/me nests coordinator scope under coordinatorProfile.scope,
          // so it must go through the same normaliser as the login payload.
          const authenticatedUser = normalizeAuthenticatedUser(current.data);
          // A payload the normaliser cannot classify is not a session: leaving
          // `user` null returns the visitor to the login screen instead of
          // opening a workspace this client cannot prove they belong to.
          setUser(authenticatedUser);
          setSessionUser(authenticatedUser);
        }
      } catch {
        // apiClient has already shown the appropriate error; do not strand the
        // visitor behind the boot splash when a session has expired.
        if (!window.sessionStorage.getItem('nstp-dev-session')) {
          setUser(null);
          setSessionUser(null);
        }
      } finally {
        setDataReady(true);
      }
    }
    init();
    return () => {
      if (syncInterval !== null) clearInterval(syncInterval);
    };
  }, [queryClient]);

  useEffect(() => {
    const handleAuthExpired = () => {
      setUser(null);
      setSessionUser(null);
      setActiveSection('overview');
      setDataReady(true);
      setIsBootSplashVisible(false);
      setAuthSplash((state) => ({ ...state, visible: false }));
      setIsAuthTransitioning(false);
    };
    window.addEventListener('auth:expired', handleAuthExpired);
    return () => {
      window.removeEventListener('auth:expired', handleAuthExpired);
    };
  }, []);

  useEffect(() => {
    const handleApiError = (event: Event) => {
      const error = (event as CustomEvent<{ status?: number; message?: string }>).detail;
      if (error?.status === 401) toast.error('Your session has expired. Please sign in again.');
      else if (error?.status === 403) toast.error('You do not have permission to perform that action.');
      else if (error?.status === 409) toast.error(error.message || 'The change conflicts with current data and was not saved.');
      else toast.error(error?.message || 'Save failed. Your change was not confirmed by the server.');
    };
    const handleServiceUnavailable = () => toast.error('Service unavailable. Reconnecting...', {
      action: { label: 'Retry', onClick: () => { void queryClient.invalidateQueries(); } },
    });
    window.addEventListener('nstp-api-error', handleApiError);
    window.addEventListener('nstp-service-unavailable', handleServiceUnavailable);
    return () => {
      window.removeEventListener('nstp-api-error', handleApiError);
      window.removeEventListener('nstp-service-unavailable', handleServiceUnavailable);
    };
  }, []);

  useEffect(() => {
    if (user) {
      connectSocket();
    } else {
      disconnectSocket();
    }
    return () => {
      disconnectSocket();
    };
  }, [user]);

  useEffect(() => {
    const handleSocketSync = (event: Event) => {
      const collection = (event as CustomEvent<string>).detail;
      if (collection) {
        queryClient.invalidateQueries({ queryKey: [collection] });
      } else {
        queryClient.invalidateQueries();
      }
      if (['students', 'accounts', 'qualifying-results'].includes(collection)) {
        void refreshStudentAccess();
      }
    };
    window.addEventListener('nstp-socket-sync', handleSocketSync);
    return () => window.removeEventListener('nstp-socket-sync', handleSocketSync);
  }, [queryClient]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
  }, []);

  useEffect(() => {
    if (!dataReady) return;
    const bootTimer = window.setTimeout(() => {
      setIsBootSplashVisible(false);
    }, 1300);
    return () => window.clearTimeout(bootTimer);
  }, [dataReady]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
    localStorage.setItem('nstp-theme', themeMode);
  }, [themeMode]);

  const refreshStudentAccess = async () => {
    if (!user || user.role !== 'student') return;
    try {
      const res = await fetchCurrentUser();
      if (res?.data) {
        const freshUser = normalizeAuthenticatedUser(res.data);
        if (freshUser && freshUser.id === user.id) {
          setUser(freshUser);
          setSessionUser(freshUser);
        }
      }
    } catch {
      // Keep existing session on network error
    }
  };

  useEffect(() => {
    if (!user || user.role !== 'student') return;

    const handleCurrentUserUpdate = (event: Event) => {
      const nextUser = normalizeAuthenticatedUser((event as CustomEvent).detail);
      if (nextUser && nextUser.id === user.id && nextUser.role === user.role) {
        setUser(nextUser);
      }
    };

    window.addEventListener('nstp-current-user-updated', handleCurrentUserUpdate);
    return () => {
      window.removeEventListener('nstp-current-user-updated', handleCurrentUserUpdate);
    };
  }, [user]);

  useEffect(() => {
    const onOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(target)) {
        setWorkspaceMenuOpen(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        setProfileMenuOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, []);

  const userRole = user?.role;

  const getPreferenceKey = (userId = user?.id) => `nstp-account-preferences-${userId || 'guest'}`;
  const getActivityKey = (userId = user?.id) => `nstp-account-activity-${userId || 'guest'}`;

  const recordAccountActivity = (title: string, detail: string) => {
    if (!user?.id) return;
    setAccountActivity((previous) => {
      const nextActivity = [
        {
          id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title,
          detail,
          createdAt: new Date().toISOString(),
        },
        ...previous,
      ].slice(0, 18);
      localStorage.setItem(getActivityKey(user.id), JSON.stringify(nextActivity));
      return nextActivity;
    });
  };

  const updateAccountPreferences = (patch: Partial<AccountPreferences>, activityTitle: string, activityDetail: string) => {
    const nextPreferences = { ...accountPreferences, ...patch };
    setAccountPreferences(nextPreferences);
    if (user?.id) localStorage.setItem(getPreferenceKey(user.id), JSON.stringify(nextPreferences));
    recordAccountActivity(activityTitle, activityDetail);
  };

  useEffect(() => {
    if (!user?.id) return;
    const savedPreferences = safeJsonParse<AccountPreferences>(localStorage.getItem(getPreferenceKey(user.id)), DEFAULT_ACCOUNT_PREFERENCES);
    const savedActivity = safeJsonParse<AccountActivity[]>(localStorage.getItem(getActivityKey(user.id)), []);
    setAccountPreferences({ ...DEFAULT_ACCOUNT_PREFERENCES, ...savedPreferences });
    setAccountActivity(savedActivity);
    setProfileDraft({ name: user.name || '', email: user.email || '' });
    setSupportStatus(null);
    setSupportMessage('');
  }, [user?.id]);

  useEffect(() => {
    document.documentElement.dataset.portalFontScale = accountPreferences.fontScale;
    document.documentElement.dataset.portalFocusMode = accountPreferences.focusMode ? 'true' : 'false';
    document.documentElement.dataset.portalHighContrast = accountPreferences.highContrast ? 'true' : 'false';
    document.documentElement.dataset.portalCompactCards = accountPreferences.compactCards ? 'true' : 'false';
    document.documentElement.classList.toggle('reduce-motion', accountPreferences.reduceMotion);
  }, [accountPreferences]);

  useEffect(() => {
    if (!user?.id) {
      setReadNoticeIds([]);
      return;
    }

    const readKey = `nstp-notice-read-${user.id}`;
    const savedReads = safeJsonParse<string[]>(localStorage.getItem(readKey), []);
    setReadNoticeIds(savedReads || []);
  }, [user?.id]);

  const visibleNotifications = useMemo(() => {
    if (!userRole) return [];
    return [...serverNotices]
      .filter((notice) => notice.audience === 'all' || notice.audience === userRole)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [serverNotices, userRole]);

  const unreadNotificationCount = visibleNotifications.filter((notice) => !readNoticeIds.includes(notice.id)).length;

  const markNotificationRead = (noticeId: string) => {
    if (!user?.id || readNoticeIds.includes(noticeId)) return;
    const nextReadIds = [...readNoticeIds, noticeId];
    setReadNoticeIds(nextReadIds);
    localStorage.setItem(`nstp-notice-read-${user.id}`, JSON.stringify(nextReadIds));
  };

  const stripPassword = (data: unknown) => {
    if (!data || typeof data !== 'object') return data;
    const { password, ...rest } = data as Record<string, unknown>;
    return rest;
  };

  const handleLogin = (userData: unknown) => {
    if (isAuthTransitioning) return;

    // Normalise here as well: any future caller of onLogin gets the same shape.
    const authenticatedUser = normalizeAuthenticatedUser(stripPassword(userData));
    if (!authenticatedUser) {
      // Fail closed. The normaliser returns null when the payload has no id or no
      // role this client can serve, and there is no safe workspace to guess: the
      // old code carried the unknown role through and landed on the student shell.
      toast.error('Signed in, but this account has no workspace assigned in this app. Ask an administrator to check its role.');
      return;
    }

    pendingLoginRef.current = authenticatedUser;
    authModeRef.current = 'login';
    setIsAuthTransitioning(true);
    setAuthSplash({ visible: true, mode: 'login', userName: authenticatedUser.name });
    clearAuthTimer();
    authTimerRef.current = window.setTimeout(() => {
      completeAuthTransition();
    }, 2100);
  };

  const handleLogout = () => {
    if (isAuthTransitioning) return;
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    setShowLogoutModal(false);
    if (isAuthTransitioning) return;

    setProfileMenuOpen(false);
    setAccountUtility(null);
    setNotificationsOpen(false);
    setWorkspaceMenuOpen(false);
    setHeaderHint(null);

    await logoutCurrentUser();
    // Also cleared here, not only on boot. Logging out does not remount the app,
    // so without this a second account signing in on the same tab could read the
    // previous coordinator's cached module/assessment snapshot until a refresh.
    cleanupSensitiveStorage();
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_SENSITIVE_CACHES' });

    authModeRef.current = 'logout';
    setIsAuthTransitioning(true);
    setAuthSplash({ visible: true, mode: 'logout', userName: user?.name });
    clearAuthTimer();
    authTimerRef.current = window.setTimeout(() => {
      completeAuthTransition();
    }, 1800);
  };

  const cancelLogout = () => setShowLogoutModal(false);

  const renderLogoutModal = () => (
    <Dialog open={showLogoutModal} onOpenChange={(open) => { if (!open) setShowLogoutModal(false); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Logout</DialogTitle>
          <DialogDescription>
            Are you sure you want to logout?
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={cancelLogout}
            className="px-5 py-2.5 border border-slate-300 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={confirmLogout}
            className="px-5 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-medium hover:bg-rose-700 transition-colors"
          >
            Logout
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (!user) {
    return (
      <>
        <React.Suspense fallback={<div className="min-h-screen p-8 text-center" role="status">Loading sign-in…</div>}>
          <LoginPage onLogin={handleLogin} />
        </React.Suspense>
        {isBootSplashVisible && <AuthSplash mode="boot" />}
        {authSplash.visible && <AuthSplash mode={authSplash.mode} userName={authSplash.userName} />}
        <Toaster />
      </>
    );
  }

  // The enrolment funnel below belongs to students only. Narrowing once here is
  // what lets the gates read enrolment flags at all — under the session union
  // those fields exist on `StudentUser` and nowhere else, so a staff account can
  // no longer fall into the student funnel by carrying a stray flag.
  const studentUser = user.role === 'student' ? user : null;
  const generalEducationComplete = studentUser?.generalEducationComplete || false;
  const preferredComponent = studentUser?.preferredComponent || null;
  const examTaken = studentUser?.examTaken || false;
  const componentAssigned = studentUser?.component || null;

  if (studentUser && !generalEducationComplete) {
    return <>
      <GeneralEducation
        user={studentUser}
        onLogout={handleLogout}
        onComplete={() => {
          const updatedUser = { ...studentUser, generalEducationComplete: true };
          setUser(updatedUser);
        }}
      />
      {showLogoutModal && renderLogoutModal()}
    </>;
  }

  if (studentUser && generalEducationComplete && !preferredComponent) {
    return <>
      <EnrollmentPage
        user={studentUser}
        onLogout={handleLogout}
        onEnroll={(component) => {
          // `component` is typed `NstpComponent`, not `string`: EnrollmentPage's
          // options are literal-typed, so an unrecognised label cannot reach here.
          const updatedUser = { ...studentUser, preferredComponent: component };
          setUser(updatedUser);
        }}
      />
      {showLogoutModal && renderLogoutModal()}
    </>;
  }

  if (studentUser && preferredComponent && !examTaken) {
    return <>
      <QualifyingExam
        user={studentUser}
        onLogout={handleLogout}
        preferredComponent={preferredComponent}
        onComplete={(score, assignment) => {
          const updatedUser: StudentUser = {
            ...studentUser,
            examTaken: true,
            // A skipped or timed-out attempt reports null. The session records "no
            // score" by leaving the field out rather than storing a null that the
            // dashboards would render as a zero.
            ...(typeof score === 'number' ? { examScore: score } : {}),
            ...(assignment?.assignedComponent
              ? {
                  component: assignment.assignedComponent,
                  componentAccessStatus: assignment.status,
                }
              : {}),
          };
          setUser(updatedUser);
          if (assignment?.assignedComponent) {
            setActiveSection('modules');
            setHeaderHint(`Access granted to the ${assignment.assignedComponent} LMS.`);
          }
        }}
      />
      {showLogoutModal && renderLogoutModal()}
    </>;
  }

  if (studentUser && examTaken && !componentAssigned) {
    return <>
      <PendingAssignment user={studentUser} onLogout={handleLogout} onAssign={(component) => {
        // Validated inside PendingAssignment, which polls browser-writable storage.
        const updatedUser = { ...studentUser, component };
        setUser(updatedUser);
      }} />
      {showLogoutModal && renderLogoutModal()}
    </>;
  }

  const today = new Date().toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const navItems = NAV_ITEMS[user.role] || NAV_ITEMS.student;
  const goBackToOverview = () => {
    setAdminInitialView('overview');
    setActiveSection('overview');
  };
  const navigateToSection = (section: ShellSection) => {
    if (section === 'overview') setAdminInitialView('overview');
    if (user.role === 'admin' && section === 'admin') setAdminInitialView('enrollment');
    setActiveSection(section);
    setMobileSidebarOpen(false);
  };
  // Library statistics for the generic panels at the bottom of `renderSection`.
  //
  // Read lazily, on the one code path that renders them. These figures come from
  // the admin-populated client snapshot (`nstp-module-library`,
  // `nstp-assessment-library`), so evaluating them in every render of the shell
  // meant a coordinator session touched admin-scoped storage for numbers it never
  // displays — coordinators get their own figures from coordinator-scoped
  // endpoints in CoordinatorDashboard and ReportsCenter.
  const readLibraryStats = () => {
    const modules = serverModules;
    const assessments = serverAssessments;
    const moduleCount = modules.length;
    const assessmentCount = assessments.length;
    const commonModuleHours = modules.reduce((total, module) => total + module.hours, 0);
    const publishedPostModuleAssessments = modules.filter((module) =>
      assessments.some((assessment) => assessment.status === 'published' && assessment.moduleId === module.id)
    ).length;
    const majorExamCount = assessments.filter((assessment) => assessment.status === 'published' && assessment.type === 'exam').length;
    const objectiveReadiness = [
      commonModuleHours >= 25,
      publishedPostModuleAssessments >= moduleCount,
      majorExamCount > 0,
      Boolean(user.component || user.role !== 'student'),
    ].filter(Boolean).length;
    return { moduleCount, assessmentCount, commonModuleHours, publishedPostModuleAssessments, majorExamCount, objectiveReadiness };
  };

  const openAdminView = (view: 'overview' | 'enrollment' | 'students' | 'tools' | 'modules' | 'assessments' | 'facilitators' | 'assignments', label: string) => {
    setAdminInitialView(view);
    setActiveSection(view === 'overview' ? 'overview' : 'admin');
    setHeaderHint(`Opened ${label}`);
    setWorkspaceMenuOpen(false);
    setMobileSidebarOpen(false);
  };

  const workspaceActions = user.role === 'admin'
    ? [
      { label: 'Dashboard Overview', detail: 'Program metrics and operations', run: () => openAdminView('overview', 'Dashboard Overview') },
      { label: 'Student Approvals', detail: 'Approve new student access', run: () => openAdminView('enrollment', 'Student Approvals') },
      { label: 'Student Records', detail: 'Roster, progress, and student data', run: () => openAdminView('students', 'Student Records') },
      { label: 'Facilitator Accounts', detail: 'Manage facilitators and ownership', run: () => openAdminView('facilitators', 'Facilitator Accounts') },
      { label: 'Component Assignment', detail: 'Classify students into NSTP tracks', run: () => openAdminView('assignments', 'Component Assignment') },
      { label: 'Admin Tools', detail: 'Bulk actions, audit, exports', run: () => openAdminView('tools', 'Admin Tools') },
      { label: 'Reports Center', detail: 'Analytics and exports', run: () => { setActiveSection('reports'); setHeaderHint('Opened Reports Center'); setWorkspaceMenuOpen(false); } },
      { label: 'Notice Center', detail: 'Announcements and alerts', run: () => { setActiveSection('announcements'); setHeaderHint('Opened Notice Center'); setWorkspaceMenuOpen(false); } },
    ]
    : user.role === 'coordinator'
      ? [
        { label: 'Coordinator Dashboard', detail: 'Component overview and tools', run: () => { setActiveSection('overview'); setHeaderHint('Opened Coordinator Dashboard'); setWorkspaceMenuOpen(false); } },
        { label: 'Module Library', detail: 'Create and manage modules', run: () => { setActiveSection('modules'); setHeaderHint('Opened Module Library'); setWorkspaceMenuOpen(false); } },
        { label: 'Facilitator Accounts', detail: 'Manage component facilitators', run: () => { setActiveSection('coordinator'); setHeaderHint('Opened Facilitator Accounts'); setWorkspaceMenuOpen(false); } },
        { label: 'Reports Center', detail: 'Component analytics', run: () => { setActiveSection('reports'); setHeaderHint('Opened Reports Center'); setWorkspaceMenuOpen(false); } },
        { label: 'Notice Center', detail: 'Announcements and alerts', run: () => { setActiveSection('announcements'); setHeaderHint('Opened Notice Center'); setWorkspaceMenuOpen(false); } },
      ]
    : user.role === 'facilitator'
      ? [
        { label: 'Facilitator Dashboard', detail: 'Attendance and grade overview', run: () => { setActiveSection('facilitator'); setHeaderHint('Opened Facilitator Dashboard'); setWorkspaceMenuOpen(false); } },
        { label: 'Notice Center', detail: 'Read program updates', run: () => { setActiveSection('announcements'); setHeaderHint('Opened Notice Center'); setWorkspaceMenuOpen(false); } },
      ]
      : [
        { label: 'Student Dashboard', detail: 'Progress and student tasks', run: () => { setActiveSection('overview'); setHeaderHint('Opened Student Dashboard'); setWorkspaceMenuOpen(false); } },
        { label: 'Modules', detail: 'Study materials and completion', run: () => { setActiveSection('modules'); setHeaderHint('Opened Modules'); setWorkspaceMenuOpen(false); } },
        { label: 'Assessments', detail: 'Quizzes and exams', run: () => { setActiveSection('assessments'); setHeaderHint('Opened Assessments'); setWorkspaceMenuOpen(false); } },
        { label: 'Grades', detail: 'Released official standing', run: () => { setActiveSection('grades'); setHeaderHint('Opened Grades'); setWorkspaceMenuOpen(false); } },
        { label: 'Notice Center', detail: 'Program announcements', run: () => { setActiveSection('announcements'); setHeaderHint('Opened Notice Center'); setWorkspaceMenuOpen(false); } },
      ];

  const accountUtilities: Array<{ id: AccountUtility; label: string; detail: string; icon: any }> = [
    { id: 'profile', label: 'Profile details', detail: 'Identity, role, and NSTP affiliation', icon: UserRound },
    { id: 'settings', label: 'Account settings', detail: 'Display, layout, and notification preferences', icon: Settings },
    { id: 'security', label: 'Security and privacy', detail: 'Session, access scope, and data safeguards', icon: ShieldCheck },
    { id: 'accessibility', label: 'Accessibility', detail: 'Reading comfort, contrast, and layout controls', icon: SlidersHorizontal },
    { id: 'activity', label: 'Activity log', detail: 'Recent portal and account events', icon: History },
    { id: 'help', label: 'Help and support', detail: 'Contacts, guides, and service channels', icon: CircleHelp },
  ];

  const selectedAccountUtility = accountUtilities.find((item) => item.id === accountUtility);
  const SelectedAccountUtilityIcon = selectedAccountUtility?.icon;

  const openAccountUtility = (id: AccountUtility) => {
    setAccountUtility(id);
    setProfileMenuOpen(false);
  };

  const saveProfileDetails = () => {
    const nextName = profileDraft.name.trim();
    const nextEmail = profileDraft.email.trim();
    if (!nextName || !nextEmail || !nextEmail.includes('@')) {
      setHeaderHint('Enter a valid name and email before saving profile details.');
      return;
    }

    const updatedUser = { ...user, name: nextName, email: nextEmail };
    setUser(updatedUser);
    setHeaderHint('Profile details updated for this session.');
    recordAccountActivity('Profile updated', `${nextName} updated account display details.`);
  };

  const openDefaultLanding = () => {
    navigateToSection(accountPreferences.defaultLanding);
    setAccountUtility(null);
    setHeaderHint(`Opened your saved default landing page.`);
    recordAccountActivity('Default landing opened', `Opened ${accountPreferences.defaultLanding}.`);
  };

  const downloadJsonFile = (fileName: string, payload: unknown) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadPrivacySummary = () => {
    downloadJsonFile(`nstp-privacy-summary-${user.id}.json`, {
      account: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        component: user.component || preferredComponent || null,
      },
      preferences: accountPreferences,
      localDataStores: [
        'nstpUser',
        'nstp-accounts',
        'nstp-module-library',
        'nstp-assessment-library',
        'nstp-student-roster',
        'nstp-grade-records',
        getPreferenceKey(user.id),
        getActivityKey(user.id),
      ],
      generatedAt: new Date().toISOString(),
    });
    setHeaderHint('Downloaded privacy summary JSON.');
    recordAccountActivity('Privacy summary exported', 'Downloaded a local privacy and data summary.');
  };

  const exportAccountActivity = () => {
    downloadJsonFile(`nstp-account-activity-${user.id}.json`, accountActivity);
    setHeaderHint('Downloaded account activity JSON.');
    recordAccountActivity('Activity exported', 'Downloaded account activity history.');
  };

  const refreshPermissionCheck = () => {
    const roleSummary = user.role === 'admin'
      ? 'Full administrative permissions confirmed.'
      : user.role === 'coordinator'
        ? 'Coordinator permissions confirmed for module and facilitator management.'
        : user.role === 'facilitator'
          ? 'Facilitator permissions confirmed for attendance and grade management.'
          : 'Student permissions confirmed for learning, assessments, progress, and grades.';
    setHeaderHint(roleSummary);
    recordAccountActivity('Permission check refreshed', roleSummary);
  };

  const resetAccessibilityPreferences = () => {
    updateAccountPreferences(
      {
        fontScale: 'standard',
        reduceMotion: false,
        focusMode: false,
        highContrast: false,
        compactCards: false,
      },
      'Accessibility reset',
      'Restored default readability and motion settings.'
    );
    setHeaderHint('Accessibility preferences reset.');
  };

  const submitSupportTicket = () => {
    const message = supportMessage.trim();
    if (message.length < 10) {
      setSupportStatus('Write a short description of the concern before creating a ticket.');
      return;
    }

    const ticket = {
      id: `ticket-${Date.now()}`,
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      message,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    const tickets = safeJsonParse<any[]>(localStorage.getItem('nstp-support-tickets'), []);
    localStorage.setItem('nstp-support-tickets', JSON.stringify([ticket, ...tickets]));
    setSupportMessage('');
    setSupportStatus(`Support ticket ${ticket.id} was saved locally for follow-up.`);
    setHeaderHint('Support ticket created.');
    recordAccountActivity('Support ticket created', ticket.id);
  };

  const searchCommands = [
    ...navItems.map((item) => ({
      label: item.label,
      keywords: [item.label, item.id],
      run: () => {
        if (user.role === 'admin' && item.id === 'admin') {
          openAdminView('enrollment', 'Student Approvals');
          return;
        }
        setActiveSection(item.id);
        if (item.id === 'overview') setAdminInitialView('overview');
        setHeaderHint(`Opened ${item.label}`);
      },
    })),
    ...(user.role === 'admin'
      ? [
        { label: 'Student Approvals', keywords: ['approval', 'approvals', 'enrollment', 'request', 'requests'], run: () => openAdminView('enrollment', 'Student Approvals') },
        { label: 'Student Records', keywords: ['student', 'students', 'roster', 'records', 'grade release', 'grades'], run: () => openAdminView('students', 'Student Records') },
        { label: 'Admin Tools', keywords: ['admin tools', 'tools', 'bulk', 'audit', 'export', 'import', 'presets'], run: () => openAdminView('tools', 'Admin Tools') },
        { label: 'Facilitator Accounts', keywords: ['facilitator', 'facilitators', 'lecturer', 'teacher', 'accounts', 'ownership'], run: () => openAdminView('facilitators', 'Facilitator Accounts') },
        { label: 'Component Assignment', keywords: ['classification', 'classify', 'component', 'cwts', 'lts', 'mts', 'army', 'navy', 'assignment'], run: () => openAdminView('assignments', 'Component Assignment') },
        { label: 'Module Library', keywords: ['module', 'modules', 'lesson', 'learning', 'common module', 'materials'], run: () => { setActiveSection('modules'); setHeaderHint('Opened Module Library'); } },
        { label: 'Assessment Bank', keywords: ['assessment', 'assessments', 'quiz', 'exam', 'test', 'answer key'], run: () => { setActiveSection('assessments'); setHeaderHint('Opened Assessment Bank'); } },
        { label: 'Reports Center', keywords: ['report', 'reports', 'analytics', 'chart', 'export pdf', 'excel'], run: () => { setActiveSection('reports'); setHeaderHint('Opened Reports Center'); } },
        { label: 'Notice Center', keywords: ['notice', 'notices', 'announcement', 'announcements', 'alert'], run: () => { setActiveSection('announcements'); setHeaderHint('Opened Notice Center'); } },
      ]
      : []),
    ...(user.role === 'coordinator'
      ? [
        { label: 'Module Library', keywords: ['module', 'modules', 'lesson', 'learning'], run: () => { setActiveSection('modules'); setHeaderHint('Opened Module Library'); } },
        { label: 'Facilitator Accounts', keywords: ['facilitator', 'facilitators', 'accounts', 'manage'], run: () => { setActiveSection('coordinator'); setHeaderHint('Opened Facilitator Accounts'); } },
        { label: 'Reports Center', keywords: ['report', 'reports', 'analytics', 'chart'], run: () => { setActiveSection('reports'); setHeaderHint('Opened Reports Center'); } },
      ]
      : []),
    ...(user.role === 'facilitator'
      ? [
        { label: 'Notice Center', keywords: ['notice', 'announcement'], run: () => { setActiveSection('announcements'); setHeaderHint('Opened Notice Center'); } },
      ]
      : []),
    ...(user.role === 'student'
      ? [
        { label: 'Modules', keywords: ['module', 'modules', 'lesson', 'study', 'learning'], run: () => { setActiveSection('modules'); setHeaderHint('Opened Modules'); } },
        { label: 'Attendance', keywords: ['attendance', 'session', 'check-in', 'present', 'absent'], run: () => { setActiveSection('attendance'); setHeaderHint('Opened Attendance'); } },
        { label: 'Grades', keywords: ['grade', 'grades', 'standing', 'score', 'completion'], run: () => { setActiveSection('grades'); setHeaderHint('Opened Grades'); } },
        { label: 'Progress', keywords: ['progress', 'classification', 'component', 'cwts', 'lts', 'mts'], run: () => { setActiveSection('progress'); setHeaderHint('Opened Progress'); } },
      ]
      : []),
  ];

  const goToSectionBySearch = (rawQuery: string) => {
    const query = rawQuery.trim().toLowerCase();
    if (!query) return;

    const match = searchCommands.find((item) => item.keywords.some((keyword) => keyword.toLowerCase().includes(query) || query.includes(keyword.toLowerCase())));
    if (match) {
      match.run();
      setHeaderHint(`Opened ${match.label}`);
      setHeaderSearch('');
      return;
    }

    setHeaderHint(`No result for "${rawQuery}". Try student, module, assessment, grade, facilitator, report, or announcement.`);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    goToSectionBySearch(headerSearch);
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setHeaderHint('Fullscreen enabled');
      } else {
        await document.exitFullscreen();
        setHeaderHint('Fullscreen disabled');
      }
    } catch {
      setHeaderHint('Fullscreen is not available in this environment.');
    }
  };

  const initials = user.name
    ? String(user.name)
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part: string) => part[0]?.toUpperCase() || '')
      .join('')
    : 'U';

  const renderSection = () => {
    // Only the student branch at the bottom of this function is reachable today:
    // administrators, coordinators and facilitators return their own dashboards
    // above the shell that calls `renderSection()`. The staff branches below stay
    // as the wiring a future shell-hosted staff view would use, and the type of
    // `user` is still the full session union here because this closure is defined
    // before those early returns narrow it.
    if (user.role === 'admin') {
      if (activeSection === 'reports') return <SectionErrorBoundary name="Reports"><ReportsCenter user={user} /></SectionErrorBoundary>;
      if (activeSection === 'announcements') return <SectionErrorBoundary name="Announcements"><AnnouncementsCenter user={user} /></SectionErrorBoundary>;
      if (activeSection === 'modules') return <SectionErrorBoundary name="Modules"><ModulesPage user={user} role="admin" onBack={goBackToOverview} /></SectionErrorBoundary>;
      if (activeSection === 'assessments') return <SectionErrorBoundary name="Assessments"><AssessmentManager user={user} role="admin" /></SectionErrorBoundary>;
      return <SectionErrorBoundary name="Admin Dashboard"><AdminDashboard embedded initialView={activeSection === 'admin' ? adminInitialView : 'overview'} onNavigateApp={(target) => setActiveSection(target as ShellSection)} onLogout={handleLogout} /></SectionErrorBoundary>;
    }

    if (user.role === 'coordinator') {
      if (activeSection === 'reports') return <SectionErrorBoundary name="Reports"><ReportsCenter user={user} /></SectionErrorBoundary>;
      if (activeSection === 'announcements') return <SectionErrorBoundary name="Announcements"><AnnouncementsCenter user={user} /></SectionErrorBoundary>;
      if (activeSection === 'modules') return <SectionErrorBoundary name="Modules"><ModulesPage user={user} role="coordinator" onBack={() => setActiveSection('overview')} /></SectionErrorBoundary>;
      if (activeSection === 'assessments') return <SectionErrorBoundary name="Assessments"><AssessmentManager user={user} role="coordinator" /></SectionErrorBoundary>;
      return <SectionErrorBoundary name="Coordinator Dashboard"><CoordinatorDashboard embedded user={user} onLogout={handleLogout} onNavigate={(target) => setActiveSection(target as ShellSection)} /></SectionErrorBoundary>;
    }

    if (user.role === 'facilitator') {
      if (activeSection === 'reports') return <SectionErrorBoundary name="Reports"><ReportsCenter user={user} /></SectionErrorBoundary>;
      if (activeSection === 'announcements') return <SectionErrorBoundary name="Announcements"><AnnouncementsCenter user={user} /></SectionErrorBoundary>;
      if (activeSection === 'modules') return <SectionErrorBoundary name="Modules"><ModulesPage user={user} role="facilitator" onBack={() => setActiveSection('facilitator')} /></SectionErrorBoundary>;
      if (activeSection === 'assessments') return <SectionErrorBoundary name="Assessments"><AssessmentManager user={user} role="facilitator" /></SectionErrorBoundary>;
      return <SectionErrorBoundary name="Facilitator Dashboard"><FacilitatorDashboard embedded user={user} onLogout={handleLogout} onNavigate={(target) => setActiveSection(target as ShellSection)} /></SectionErrorBoundary>;
    }

    if (activeSection === 'reports') return <SectionErrorBoundary name="Reports"><ReportsCenter user={user} /></SectionErrorBoundary>;
    if (activeSection === 'announcements') return <SectionErrorBoundary name="Announcements"><AnnouncementsCenter user={user} /></SectionErrorBoundary>;
    if (activeSection === 'modules') return <SectionErrorBoundary name="Modules"><ModulesPage user={user} role="student" onBack={goBackToOverview} /></SectionErrorBoundary>;
    if (activeSection === 'assessments') return <SectionErrorBoundary name="Assessments"><AssessmentsPage user={user} onBack={goBackToOverview} /></SectionErrorBoundary>;
    if (activeSection === 'progress') return <SectionErrorBoundary name="Progress"><ProgressTracker user={user} onBack={goBackToOverview} /></SectionErrorBoundary>;
    if (activeSection === 'attendance') return <SectionErrorBoundary name="Attendance"><StudentAttendanceView user={user} onBack={goBackToOverview} /></SectionErrorBoundary>;
    if (activeSection === 'grades') return <SectionErrorBoundary name="Grades"><GradesPage user={user} /></SectionErrorBoundary>;
    if (activeSection === 'overview') {
      return <SectionErrorBoundary name="Dashboard Home"><RoleDashboardHome user={user} role="student" onNavigate={(target) => setActiveSection(target as ShellSection)} /></SectionErrorBoundary>;
    }
    const { moduleCount, assessmentCount, commonModuleHours, publishedPostModuleAssessments, majorExamCount, objectiveReadiness } = readLibraryStats();
    return (
      <div className="grid auto-rows-[minmax(120px,auto)] gap-4 md:grid-cols-6">
        <div className="bento-panel md:col-span-4 md:row-span-2 p-6">
          <p className="text-xs uppercase tracking-[0.18em] font-semibold text-blue-700 mb-2 dark:text-blue-300">Objective Readiness</p>
          <h2 className="text-2xl font-bold text-slate-900 mb-3 dark:text-slate-100">NSTP delivery, enrollment, assessment, and reporting are unified in one workspace.</h2>
          <p className="text-slate-600 dark:text-slate-300">
            The system now foregrounds the required 25 contact hours, post-module assessments, major examinations, and component classification for CWTS, LTS, MTS (Army), and MTS (Navy).
          </p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {[
              `${commonModuleHours}/25 Common Module hours`,
              `${publishedPostModuleAssessments}/${moduleCount} modules with published tests`,
              `${majorExamCount} published major exam${majorExamCount === 1 ? '' : 's'}`,
              user.role === 'student' ? (user.component ? `${user.component} classified` : 'Component classification pending') : 'Admin classification tools active',
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="bento-panel p-5 md:col-span-2">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">System readiness</p>
          <p className="mt-2 text-4xl font-bold text-blue-700 dark:text-blue-300">{objectiveReadiness}/4</p>
        </div>

        <div className="bento-panel p-5 md:col-span-2">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Learning materials</p>
          <p className="mt-2 text-4xl font-bold text-emerald-600 dark:text-emerald-300">{moduleCount}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{assessmentCount} assessments in the library</p>
        </div>

        <div className="bento-panel p-5 md:col-span-2">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Contact hours</p>
          <p className="mt-2 text-4xl font-bold text-amber-600 dark:text-amber-300">{commonModuleHours}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Required minimum: 25</p>
        </div>

        <div className="bento-panel p-5 md:col-span-3">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Recommended flow</p>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">Enrollment -&gt; Component classification -&gt; Common modules -&gt; Post-module tests -&gt; Major exam -&gt; Reports</p>
        </div>

        <div className="bento-panel p-5 md:col-span-3">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Current role</p>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-200 capitalize">{user.role} workspace with role-specific modules, assessments, reports, and notices.</p>
        </div>

        <div className="bento-panel p-5 md:col-span-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Quick Actions</p>
              <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">Continue your NSTP workflow</h3>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Open Modules', section: 'modules' as ShellSection, detail: 'Continue the 25-hour Common Module' },
              { label: 'Take Assessment', section: 'assessments' as ShellSection, detail: 'Quizzes and major examinations' },
              { label: 'View Progress', section: 'progress' as ShellSection, detail: 'Hours, scores, and milestones' },
              { label: 'Check Grades', section: 'grades' as ShellSection, detail: 'Official standing and clearance' },
              { label: 'Generate Report', section: 'reports' as ShellSection, detail: 'Export-ready academic records' },
            ].map((action) => (
              <button
                key={action.label}
                onClick={() => setActiveSection(action.section)}
                className="clickable-button rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500/50 dark:hover:bg-blue-500/10"
              >
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{action.label}</span>
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{action.detail}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  if (user.role === 'admin') {
    const adminView =
      activeSection === 'admin' ? adminInitialView :
      activeSection === 'modules' ? 'modules' :
      activeSection === 'assessments' ? 'assessments' :
      activeSection === 'reports' ? 'tools' :
      activeSection === 'announcements' ? 'settings' :
      'overview';

    return (
      <>
        <AdminDashboard initialView={adminView as any} onNavigateApp={(target) => setActiveSection(target as ShellSection)} onLogout={handleLogout} />
        {showLogoutModal && renderLogoutModal()}
        {isBootSplashVisible && <AuthSplash mode="boot" userName={user?.name} />}
        {authSplash.visible && <AuthSplash mode={authSplash.mode} userName={authSplash.userName} />}
      </>
    );
  }

  if (user.role === 'coordinator') {
    return (
      <>
        <CoordinatorDashboard user={user} onLogout={handleLogout} onNavigate={(target) => setActiveSection(target as ShellSection)} />
        {showLogoutModal && renderLogoutModal()}
        {isBootSplashVisible && <AuthSplash mode="boot" userName={user?.name} />}
        {authSplash.visible && <AuthSplash mode={authSplash.mode} userName={authSplash.userName} />}
      </>
    );
  }

  if (user.role === 'facilitator') {
    return (
      <>
        <FacilitatorDashboard user={user} onLogout={handleLogout} onNavigate={(target) => setActiveSection(target as ShellSection)} />
        {showLogoutModal && renderLogoutModal()}
        {isBootSplashVisible && <AuthSplash mode="boot" userName={user?.name} />}
        {authSplash.visible && <AuthSplash mode={authSplash.mode} userName={authSplash.userName} />}
      </>
    );
  }

  return (
    <>
      <Toaster />
      <AppShell
        portalLabel="Student Portal"
        sidebarOpen={mobileSidebarOpen}
        onSidebarToggle={setMobileSidebarOpen}
        avatarLabel={initials}
        accountLabel="Student"
        accountTitle={user.name}
        accountSubtitle={user.email}
        accountMeta={
          <div className="flex items-center gap-2 text-xs text-white/75">
            <CalendarDays className="h-4 w-4 text-[#E5B73B]" />
            {today}
          </div>
        }
        onLogout={handleLogout}
        sidebarGroups={[
          {
            label: 'Navigation',
            items: navItems.map((item) => ({
              label: item.label,
              icon: item.icon,
              active: activeSection === item.id,
              onClick: () => navigateToSection(item.id),
            })),
          },
        ]}
        header={
          <PageHeader
            eyebrow="Student Portal"
            title={
              activeSection === 'overview'
                ? 'Dashboard'
                : activeSection === 'modules'
                  ? 'Modules'
                  : activeSection === 'assessments'
                    ? 'Assessments'
                    : activeSection === 'progress'
                      ? 'Progress'
                      : activeSection === 'attendance'
                        ? 'Attendance Log'
                        : activeSection === 'grades'
                          ? 'Grades'
                        : activeSection === 'reports'
                          ? 'Reports'
                          : activeSection === 'announcements'
                            ? 'Notice Center'
                            : 'Student Portal'
            }
            onMenuClick={() => setMobileSidebarOpen(true)}
            searchValue={headerSearch}
            onSearchChange={setHeaderSearch}
            onSearchSubmit={() => {}}
            searchPlaceholder="Search"
            hint={headerHint || undefined}
            actionsSlot={
              <>
                <div className="relative" ref={workspaceMenuRef}>
                  <button
                    onClick={() => setWorkspaceMenuOpen((open) => !open)}
                    className="inline-flex h-10 sm:h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 sm:px-4 text-xs sm:text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  >
                    Actions
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>

                  {workspaceMenuOpen && (
                    <div className="absolute left-0 sm:left-auto sm:right-0 z-30 mt-2 max-h-[min(30rem,calc(100dvh-5rem))] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:w-72">
                      <div className="mb-1 px-2 py-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Quick menu</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{workspaceLabel}</p>
                      </div>
                      {workspaceActions.map((action) => (
                        <button
                          key={action.label}
                          onClick={() => {
                            setWorkspaceLabel(action.label);
                            action.run();
                          }}
                          className="mb-1 w-full rounded-xl px-3 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{action.label}</span>
                          <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{action.detail}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setThemeMode((mode) => (mode === 'dark' ? 'light' : 'dark'))}
                  className="inline-flex h-10 sm:h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs sm:text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  aria-label="Toggle theme"
                  title="Toggle theme"
                >
                  {themeMode === 'dark' ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
                  <span className="hidden sm:inline">{themeMode === 'dark' ? 'Light' : 'Dark'}</span>
                </button>

                <button
                  onClick={toggleFullscreen}
                  className="hidden sm:inline-flex h-10 sm:h-11 w-10 sm:w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  title="Toggle fullscreen"
                  aria-label="Toggle fullscreen"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>

                <div className="relative" ref={notificationsRef}>
                  <button
                    onClick={() => setNotificationsOpen((open) => !open)}
                    className="relative inline-flex h-10 sm:h-11 w-10 sm:w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    title="Open notifications"
                    aria-label="Open notifications"
                  >
                    <Bell className="h-4 w-4" />
                    {unreadNotificationCount > 0 && (
                      <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                        {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                      </span>
                    )}
                  </button>

                  {notificationsOpen && (
                    <div className="absolute right-0 z-30 mt-2 max-h-[min(34rem,calc(100dvh-5rem))] w-[min(20rem,calc(100vw-1rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                      <div className="mb-2 flex items-center justify-between px-2 py-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Notifications</p>
                        <button
                          onClick={() => {
                            setActiveSection('announcements');
                            setNotificationsOpen(false);
                          }}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/10"
                        >
                          Notice Center
                        </button>
                      </div>

                      <div className="max-h-72 space-y-1 overflow-auto pr-1">
                        {visibleNotifications.length === 0 && (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                            No notifications yet.
                          </div>
                        )}
                        {visibleNotifications.slice(0, 6).map((notice) => {
                          const unread = !readNoticeIds.includes(notice.id);
                          return (
                            <button
                              key={notice.id}
                              onClick={() => markNotificationRead(notice.id)}
                              className={`w-full rounded-xl border px-3 py-2.5 text-left ${unread ? 'border-blue-200 bg-blue-50/60 dark:border-blue-500/30 dark:bg-blue-500/10' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950'}`}
                            >
                              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{notice.title}</p>
                              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{notice.message}</p>
                              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{new Date(notice.createdAt).toLocaleString()}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative" ref={profileMenuRef}>
                  <button
                    onClick={() => setProfileMenuOpen((open) => !open)}
                    className="inline-flex h-10 sm:h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 sm:px-3 text-xs sm:text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    title="Profile menu"
                    aria-label="Profile menu"
                  >
                    <span className="inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-blue-700 text-xs font-semibold text-white">{initials}</span>
                    <span className="hidden max-w-[120px] truncate md:inline">{user.name}</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>

                  {profileMenuOpen && (
                    <div className="absolute right-0 z-30 mt-2 max-h-[min(30rem,calc(100dvh-5rem))] w-[min(20rem,calc(100vw-1rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                      <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Signed In</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{user.name}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-300">{user.email}</p>
                      </div>
                      <div className="mt-2 space-y-1">
                        {accountUtilities.map((action) => {
                          const Icon = action.icon;
                          return (
                            <button
                              key={action.id}
                              onClick={() => openAccountUtility(action.id)}
                              className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                                <Icon className="h-4 w-4" />
                              </span>
                              <span>
                                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{action.label}</span>
                                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{action.detail}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="my-2 h-px bg-slate-200 dark:bg-slate-800" />
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="mt-1 flex w-full items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-left text-sm font-semibold text-rose-700 shadow-sm hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                      >
                        <LogOut className="h-4 w-4" />
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              </>
            }
          />
        }
      >
        <React.Suspense fallback={<div className="p-8 text-center text-sm text-slate-600" role="status">Loading workspace…</div>}>
          {renderSection()}
        </React.Suspense>
      </AppShell>
      {accountUtility && selectedAccountUtility && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm md:p-6">
          <div className="max-h-[92dvh] w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800 md:px-6">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                  {SelectedAccountUtilityIcon && <SelectedAccountUtilityIcon className="h-5 w-5" />}
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Account Center</p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">{selectedAccountUtility.label}</h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{selectedAccountUtility.detail}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAccountUtility(null)}
                className="clickable-button inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                title="Close account center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70dvh] overflow-auto p-5 md:p-6">
              {accountUtility === 'profile' && (
                <div className="grid gap-4 md:grid-cols-[1fr_1.1fr]">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-lg font-semibold text-white">{initials}</span>
                      <div>
                        <p className="text-base font-semibold text-slate-950 dark:text-white">{user.name}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-300">{user.email}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <span className="rounded-xl bg-white p-3 dark:bg-slate-900">
                        <span className="block text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Role</span>
                        <span className="mt-1 block font-semibold capitalize text-slate-900 dark:text-slate-100">{user.role}</span>
                      </span>
                      <span className="rounded-xl bg-white p-3 dark:bg-slate-900">
                        <span className="block text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Status</span>
                        <span className="mt-1 block font-semibold text-emerald-700 dark:text-emerald-300">Active</span>
                      </span>
                    </div>
                    <div className="mt-4 space-y-3">
                      <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Display name
                        <input
                          value={profileDraft.name}
                          onChange={(event) => setProfileDraft((draft) => ({ ...draft, name: event.target.value }))}
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </label>
                      <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Email address
                        <input
                          type="email"
                          value={profileDraft.email}
                          onChange={(event) => setProfileDraft((draft) => ({ ...draft, email: event.target.value }))}
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={saveProfileDetails}
                        className="clickable-button inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
                      >
                        <Save className="h-4 w-4" />
                        Save profile
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-3">
                    {[
                      // This panel lives in the student shell, which the three role
                      // returns above are placed before, so `user` is a student here
                      // and the admin/facilitator arms these lines used to carry were
                      // unreachable — the session union is what made that visible.
                      ['NSTP component', user.component || preferredComponent || 'Pending assignment'],
                      ['Portal access', 'Student learning and grade portal'],
                      ['Last portal view', navItems.find((item) => item.id === activeSection)?.label || activeSection],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{label}</p>
                        <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {accountUtility === 'settings' && (
                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setThemeMode((mode) => (mode === 'dark' ? 'light' : 'dark'));
                      recordAccountActivity('Theme changed', `Switched to ${themeMode === 'dark' ? 'light' : 'dark'} mode.`);
                    }}
                    className="clickable-button rounded-2xl border border-slate-200 bg-white p-4 text-left hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-800"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">{themeMode === 'dark' ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />} Display mode</span>
                    <span className="mt-2 block text-sm text-slate-600 dark:text-slate-300">Currently using {themeMode} mode. Switch for the lighting condition of your device.</span>
                  </button>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                    <p className="text-sm font-semibold text-slate-950 dark:text-white">Notification preferences</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{unreadNotificationCount} unread item{unreadNotificationCount === 1 ? '' : 's'} from notices and program alerts.</p>
                    <div className="mt-3 space-y-2">
                      {[
                        ['notificationDigest', 'Daily digest inside portal'],
                        ['emailAlerts', 'Email-style alert preference'],
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => updateAccountPreferences({ [key]: !accountPreferences[key as keyof AccountPreferences] } as Partial<AccountPreferences>, 'Notification preference changed', label)}
                          className="clickable-button flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm dark:border-slate-700 dark:bg-slate-900"
                        >
                          <span className="font-medium text-slate-800 dark:text-slate-100">{label}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${accountPreferences[key as keyof AccountPreferences] ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>{accountPreferences[key as keyof AccountPreferences] ? 'On' : 'Off'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                    <label className="block text-sm font-semibold text-slate-950 dark:text-white">
                      Default landing
                      <select
                        value={accountPreferences.defaultLanding}
                        onChange={(event) => updateAccountPreferences({ defaultLanding: event.target.value as ShellSection }, 'Default landing changed', `Saved ${event.target.value} as the landing page.`)}
                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        {navItems.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={openDefaultLanding}
                      className="clickable-button mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200"
                    >
                      Open saved landing
                    </button>
                  </div>
                </div>
              )}

              {accountUtility === 'security' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                    <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200"><LockKeyhole className="h-4 w-4" /> Secure session active</p>
                    <p className="mt-2 text-sm text-emerald-800/80 dark:text-emerald-100/80">Your account is scoped to student learning access.</p>
                  </div>
                  {[
                    'Role-based access protects restricted modules.',
                    'Profile actions stay separate from learning and administration workflows.',
                    'Local portal data is saved only for NSTP workspace continuity.',
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                      <p className="text-sm text-slate-700 dark:text-slate-200">{item}</p>
                    </div>
                  ))}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <button type="button" onClick={refreshPermissionCheck} className="clickable-button inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                      <RotateCcw className="h-4 w-4" />
                      Check access
                    </button>
                    <button type="button" onClick={downloadPrivacySummary} className="clickable-button inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
                      <Download className="h-4 w-4" />
                      Privacy JSON
                    </button>
                    <button type="button" onClick={handleLogout} className="clickable-button inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                      <LogOut className="h-4 w-4" />
                      End session
                    </button>
                  </div>
                </div>
              )}

              {accountUtility === 'accessibility' && (
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    { key: 'fontScale', label: 'Large text', detail: 'Increase portal text size for easier reading.', value: accountPreferences.fontScale === 'large', patch: { fontScale: accountPreferences.fontScale === 'large' ? 'standard' : 'large' } },
                    { key: 'highContrast', label: 'High contrast', detail: 'Strengthen borders, foregrounds, and focus states.', value: accountPreferences.highContrast, patch: { highContrast: !accountPreferences.highContrast } },
                    { key: 'reduceMotion', label: 'Reduce motion', detail: 'Minimize transitions and motion effects.', value: accountPreferences.reduceMotion, patch: { reduceMotion: !accountPreferences.reduceMotion } },
                    { key: 'focusMode', label: 'Focus mode', detail: 'Tone down decorative surfaces around the workspace.', value: accountPreferences.focusMode, patch: { focusMode: !accountPreferences.focusMode } },
                    { key: 'compactCards', label: 'Compact cards', detail: 'Tighten card padding for dense dashboards.', value: accountPreferences.compactCards, patch: { compactCards: !accountPreferences.compactCards } },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => updateAccountPreferences(item.patch as Partial<AccountPreferences>, 'Accessibility preference changed', item.label)}
                      className="clickable-button rounded-2xl border border-slate-200 bg-white p-4 text-left hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-800"
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-950 dark:text-white">{item.label}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.value ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>{item.value ? 'On' : 'Off'}</span>
                      </span>
                      <span className="mt-2 block text-sm text-slate-600 dark:text-slate-300">{item.detail}</span>
                    </button>
                  ))}
                  <button type="button" onClick={resetAccessibilityPreferences} className="clickable-button inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
                    <RotateCcw className="h-4 w-4" />
                    Reset accessibility
                  </button>
                </div>
              )}

              {accountUtility === 'activity' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                    <div>
                      <p className="text-sm font-semibold text-slate-950 dark:text-white">Activity timeline</p>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{accountActivity.length} saved account event{accountActivity.length === 1 ? '' : 's'} on this device.</p>
                    </div>
                    <button
                      type="button"
                      onClick={exportAccountActivity}
                      disabled={accountActivity.length === 0}
                      className="clickable-button inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200"
                    >
                      <Download className="h-4 w-4" />
                      Export JSON
                    </button>
                  </div>
                  {accountActivity.slice(0, 10).map((item) => (
                    <div key={item.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-600 dark:bg-blue-300" />
                      <div>
                        <p className="text-sm font-semibold text-slate-950 dark:text-white">{item.title}</p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.detail}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{new Date(item.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {accountUtility === 'help' && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950 md:col-span-2">
                    <label className="block text-sm font-semibold text-slate-950 dark:text-white">
                      Create a local support ticket
                      <textarea
                        value={supportMessage}
                        onChange={(event) => setSupportMessage(event.target.value)}
                        placeholder="Describe the login, module, assessment, grade, or accessibility concern..."
                        className="mt-2 min-h-28 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </label>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={submitSupportTicket}
                        className="clickable-button inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
                      >
                        <Send className="h-4 w-4" />
                        Save support ticket
                      </button>
                      {supportStatus && <span className="text-sm text-slate-600 dark:text-slate-300">{supportStatus}</span>}
                    </div>
                  </div>
                  {[
                    ['NSTP coordinator', 'nstp.coordinator@bipsu.edu.ph', 'Program requirements, component concerns, and schedules.'],
                    ['Technical support', 'support@nstp.edu', 'Login, device, accessibility, and portal issue assistance.'],
                    ['Registrar support', 'registrar@bipsu.edu.ph', 'Student records, enrollment verification, and official standing.'],
                    ['Facilitator support', 'facilitator.support@nstp.edu', 'Lecture uploads, answer keys, and assessment publishing.'],
                  ].map(([title, email, detail]) => (
                    <a
                      key={title}
                      href={`mailto:${email}?subject=NSTP Portal Support&body=${encodeURIComponent(`Name: ${user.name}\nRole: ${user.role}\nConcern:\n`)}`}
                      onClick={() => recordAccountActivity('Support contact opened', title)}
                      className="clickable-button rounded-2xl border border-slate-200 bg-white p-4 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-800"
                    >
                      <p className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white"><Mail className="h-4 w-4" />{title}</p>
                      <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">{email}</p>
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{detail}</p>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {showLogoutModal && renderLogoutModal()}
      {isBootSplashVisible && <AuthSplash mode="boot" userName={user?.name} />}
      {authSplash.visible && <AuthSplash mode={authSplash.mode} userName={authSplash.userName} />}
    </>
  );
}
