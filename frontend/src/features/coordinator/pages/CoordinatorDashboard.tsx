import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, Bell, BookOpen, CalendarCheck, Check, ChevronDown, ClipboardList, Download, FileText, LayoutDashboard, Loader2, Menu, Plus, Save, Search, Settings, ShieldAlert, Trash2, Upload, UserCog, Users, X,
} from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import CollapsibleRoleSidebar from '../../../components/layout/CollapsibleRoleSidebar';
import {
  BILIRAN_MUNICIPALITIES, createEmptyModule, NstpAccount, NstpAttendanceRecord, NstpAttendanceSession, NstpModule, NstpStudent,
} from '../../../data/nstpData';
import { fetchAttendanceRecords, fetchAttendanceSessions } from '../../../services/api';
import { createManagedModule, fetchManagedModules, removeManagedModule, updateManagedModule } from '../../../services/modules';
import { fetchManagedAssessments } from '../../../services/assessments';
import { COMPONENT_TYPE_LABELS, createMyFacilitator, facilitatorRecordToAccount, fetchMyFacilitators, setMyFacilitatorStatus, updateMyFacilitator } from '../../../services/staff';
import { fetchCoordinatorClasses, fetchCoordinatorStudents, type CoordinatorClass } from '../../../services/coordinator';
import { useCoordinatorScope } from '../../../hooks/useCoordinatorScope';
import type { CoordinatorUser } from '../../../services/authUser';

const CoordinatorReports = React.lazy(() => import('../../../pages/ReportsPage'));

const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'C';

export default function CoordinatorDashboard({
  user, onLogout, onNavigate, embedded = false,
}: {
  /**
   * The signed-in coordinator. Typed as the coordinator variant of the session
   * union, which is what lets `useCoordinatorScope(user)` below be trusted to be
   * asking about a coordinator at all. Scope itself still comes from the server.
   */
  user: CoordinatorUser; onLogout?: () => void; onNavigate?: (target: string) => void; embedded?: boolean;
}) {
  type CoordinatorView = 'dashboard' | 'modules' | 'facilitators' | 'students' | 'classes' | 'attendance' | 'reports';

  const [view, setView] = useState<CoordinatorView>('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [modules, setModules] = useState<NstpModule[]>([]);
  const [facilitators, setFacilitators] = useState<NstpAccount[]>([]);
  const [students, setStudents] = useState<NstpStudent[]>([]);
  const [classes, setClasses] = useState<CoordinatorClass[]>([]);
  const [attendanceSessions, setAttendanceSessions] = useState<NstpAttendanceSession[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<NstpAttendanceRecord[]>([]);
  const [assessmentCount, setAssessmentCount] = useState(0);
  const [search, setSearch] = useState('');

  const [rosterLoading, setRosterLoading] = useState(true);
  const [studentError, setStudentError] = useState<string | null>(null);
  const [classError, setClassError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<NstpModule | null>(null);
  const [moduleError, setModuleError] = useState<string | null>(null);
  const [moduleSaving, setModuleSaving] = useState(false);

  const [facilitatorEditorOpen, setFacilitatorEditorOpen] = useState(false);
  const [editingFacilitator, setEditingFacilitator] = useState<NstpAccount | null>(null);
  const [facilitatorError, setFacilitatorError] = useState<string | null>(null);
  const [facilitatorSaving, setFacilitatorSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Coordinator scope resolution lives in one shared hook so that this
  // dashboard and the reports screen cannot drift apart on where the scope is
  // stored or what to do when it is missing.
  const { state: scopeState, scope: coordinatorScope, allowedComponentTypes, allowedComponents, label: userComponent } = useCoordinatorScope(user);

  // Everything below is loaded from coordinator-scoped endpoints only, and only
  // once the scope is known.
  //
  // Nothing is read from the client-side snapshot store, and — just as
  // importantly — nothing is written to it. That store lives under shared keys
  // (`nstp-module-library`, `nstp-assessment-library`) that the admin screens,
  // the app shell counters and RoleDashboardHome read as if they held the whole
  // programme. Publishing this coordinator's component-scoped subset into those
  // keys meant the next session on the same tab — another coordinator, or an
  // administrator — could render one component's records as the global picture
  // until its own fetch resolved. Logout now clears sensitive storage as well
  // (App.tsx `confirmLogout` -> `cleanupSensitiveStorage`), but that is defence
  // in depth: the real fix is that coordinator data never leaves this
  // component's own state.
  useEffect(() => {
    if (!coordinatorScope) return;
    let cancelled = false;

    setRosterLoading(true);
    setStudentError(null);
    setClassError(null);
    setModuleError(null);
    setFacilitatorError(null);

    const fetchModulesAndRoster = async () => {
      let moduleRecords: NstpModule[] = [];
      try {
        moduleRecords = await fetchManagedModules('coordinator');
        if (cancelled) return;
        setModules(moduleRecords);
        setModuleError(null);
      } catch (err) {
        if (cancelled) return;
        moduleRecords = [];
        setModules([]);
        setModuleError(err instanceof Error ? err.message : 'Unable to load coordinator modules.');
      }

      // Progress is measured against the published modules in this scope so the
      // percentage is derived from real records instead of a placeholder.
      const publishedTarget = moduleRecords.filter((module) => (module.status || 'DRAFT') === 'PUBLISHED').length;

      try {
        const roster = await fetchCoordinatorStudents(publishedTarget);
        if (cancelled) return;
        setStudents(roster);
        setStudentError(null);
      } catch (err) {
        if (cancelled) return;
        setStudents([]);
        setStudentError(err instanceof Error ? err.message : 'Unable to load coordinator student roster.');
      } finally {
        if (!cancelled) setRosterLoading(false);
      }
    };

    fetchModulesAndRoster();

    fetchCoordinatorClasses()
      .then((records) => {
        if (!cancelled) {
          setClasses(records);
          setClassError(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setClasses([]);
        setClassError(err instanceof Error ? err.message : 'Unable to load component classes.');
      });

    fetchManagedAssessments('coordinator')
      .then((records) => { if (!cancelled) setAssessmentCount(records.length); })
      .catch(() => { if (!cancelled) setAssessmentCount(0); });

    fetchMyFacilitators()
      .then((records) => {
        if (!cancelled) {
          setFacilitators(records.map(facilitatorRecordToAccount));
          setFacilitatorError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFacilitators([]);
          setFacilitatorError(err instanceof Error ? err.message : 'Unable to load assigned facilitators.');
        }
      });

    fetchAttendanceSessions().then((res) => { if (!cancelled) setAttendanceSessions(res); }).catch(() => {});
    fetchAttendanceRecords().then((res) => { if (!cancelled) setAttendanceRecords(res); }).catch(() => {});

    return () => { cancelled = true; };
  }, [coordinatorScope, reloadKey]);

  // The API already restricted these collections to this coordinator's
  // components, so no second client-side scope filter is applied. Re-filtering
  // here by display label would only hide legitimate rows whenever the stored
  // component name and the UI label disagree.
  const scopedModules = modules;
  const scopedStudents = students;
  const scopedClasses = classes;

  const scopedFacilitators = useMemo(
    () => facilitators,
    [facilitators],
  );

  const query = search.trim().toLowerCase();

  const filteredModules = scopedModules.filter((m) =>
    !query || [m.title, m.description].some((v) => v?.toLowerCase().includes(query))
  );

  const filteredFacilitators = scopedFacilitators.filter((f) =>
    !query || [f.name, f.email, ...(f.municipalities || [])].some((v) => v?.toLowerCase().includes(query))
  );

  const filteredStudents = scopedStudents.filter((s) =>
    !query || [s.name, s.email, s.studentId, s.component, s.programSection].some((v) => v?.toLowerCase().includes(query))
  );

  const filteredClasses = scopedClasses.filter((c) =>
    !query || [c.code, c.name, c.component, c.facilitatorName].some((v) => v?.toLowerCase().includes(query))
  );

  const componentColors = ['#10b981', '#2563eb', '#f59e0b', '#8b5cf6', '#06b6d4'];

  const componentData = allowedComponents.map((c) => ({
    name: c, value: scopedStudents.filter((s) => s.component === c).length,
  }));

  const sideNavItems = [
    { id: 'dashboard' as CoordinatorView, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'modules' as CoordinatorView, label: 'Module Library', icon: BookOpen },
    { id: 'facilitators' as CoordinatorView, label: 'Facilitators', icon: Users },
    { id: 'students' as CoordinatorView, label: 'Students', icon: UserCog },
    { id: 'classes' as CoordinatorView, label: 'Classes', icon: ClipboardList },
    { id: 'attendance' as CoordinatorView, label: 'Attendance Audit', icon: CalendarCheck },
    { id: 'reports' as CoordinatorView, label: 'Reports', icon: BarChart3 },
  ];

  const handleNewModule = () => {
    setEditingModule({ ...createEmptyModule(), component: allowedComponents[0], status: 'DRAFT' });
    setModuleError(null);
    setEditorOpen(true);
  };

  const handleEditModule = (mod: NstpModule) => {
    setEditingModule({ ...mod });
    setEditorOpen(true);
  };

  const handleSaveModule = async () => {
    if (!editingModule) return;
    if (!editingModule.title.trim() || !editingModule.description.trim() || editingModule.hours < 1) {
      setModuleError('Enter a title, description, and valid duration before saving.');
      return;
    }
    setModuleSaving(true);
    setModuleError(null);
    try {
      const exists = modules.some((module) => module.id === editingModule.id);
      const payload = { ...editingModule, component: editingModule.component || allowedComponents[0], status: editingModule.status || 'DRAFT' };
      const saved = exists ? await updateManagedModule('coordinator', payload) : await createManagedModule('coordinator', payload);
      const updated = exists ? modules.map((module) => module.id === saved.id ? saved : module) : [saved, ...modules];
      setModules(updated);
      setEditorOpen(false);
      setEditingModule(null);
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : 'Unable to save the module.');
    } finally {
      setModuleSaving(false);
    }
  };

  const handleDeleteModule = async (id: string) => {
    const target = modules.find((module) => module.id === id);
    if (!target || !window.confirm(`Delete "${target.title}"? Referenced modules will be archived.`)) return;
    setModuleSaving(true);
    try {
      await removeManagedModule('coordinator', id);
      const updated = await fetchManagedModules('coordinator');
      setModules(updated);
      setModuleError(null);
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : 'Unable to remove the module.');
    } finally {
      setModuleSaving(false);
    }
  };

  const handleNewFacilitator = () => {
    setFacilitatorError(null);
    setEditingFacilitator({
      id: 'new-facilitator',
      name: '', email: '', password: '', role: 'facilitator',
      employeeNumber: `FAC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      municipalities: [],
      title: '', component: allowedComponents[0],
    } as NstpAccount);
    setFacilitatorEditorOpen(true);
  };

  const handleEditFacilitator = (f: NstpAccount) => {
    setFacilitatorError(null);
    setEditingFacilitator({ ...f });
    setFacilitatorEditorOpen(true);
  };

  const handleSaveFacilitator = async () => {
    if (!editingFacilitator) return;
    const municipalities = editingFacilitator.municipalities || [];
    if (municipalities.length < 1 || municipalities.length > 3) {
      setFacilitatorError('Select between 1 and 3 municipalities for this facilitator.');
      return;
    }
    if (!editingFacilitator.name.trim() || !editingFacilitator.email.trim() || !editingFacilitator.employeeNumber?.trim() || !editingFacilitator.component) {
      setFacilitatorError('Name, email, employee number, and component are required.'); return;
    }
    const creating = editingFacilitator.id === 'new-facilitator';
    if (creating && editingFacilitator.password.length < 8) { setFacilitatorError('Enter a provisioning password of at least 8 characters.'); return; }
    const componentType = allowedComponentTypes.find((type) => COMPONENT_TYPE_LABELS[type] === editingFacilitator.component);
    if (!componentType) { setFacilitatorError('The selected component is outside your coordinator program.'); return; }
    setFacilitatorSaving(true);
    try {
      const payload = {
        name: editingFacilitator.name.trim(), email: editingFacilitator.email.trim().toLowerCase(), employeeNumber: editingFacilitator.employeeNumber.trim(),
        title: editingFacilitator.title?.trim() || '', contactNumber: editingFacilitator.contactNumber?.trim() || '',
        component: componentType, municipalities: municipalities as any,
        ...(editingFacilitator.password ? { password: editingFacilitator.password } : {}),
      };
      if (creating) await createMyFacilitator(payload as typeof payload & { password: string });
      else await updateMyFacilitator(editingFacilitator.id, payload);
      const records = await fetchMyFacilitators();
      setFacilitators(records.map(facilitatorRecordToAccount));
      setFacilitatorEditorOpen(false); setEditingFacilitator(null); setFacilitatorError(null);
    } catch (error) {
      setFacilitatorError(error instanceof Error ? error.message : 'Unable to save facilitator.');
    } finally { setFacilitatorSaving(false); }
  };

  const handleFacilitatorStatus = async (facilitator: NstpAccount) => {
    const nextStatus = facilitator.accountStatus === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    if (!window.confirm(`${nextStatus === 'ACTIVE' ? 'Reactivate' : 'Suspend'} ${facilitator.name}?`)) return;
    try {
      await setMyFacilitatorStatus(facilitator.id, nextStatus);
      const records = await fetchMyFacilitators(); setFacilitators(records.map(facilitatorRecordToAccount));
    } catch (error) { setFacilitatorError(error instanceof Error ? error.message : 'Unable to update facilitator status.'); }
  };

  const renderDataNotice = () => {
    if (rosterLoading) {
      return (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading {userComponent} component records…
        </div>
      );
    }
    const activeError = studentError || classError || moduleError || facilitatorError;
    if (activeError) {
      return (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          <span>{activeError}</span>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="ml-3 rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-600 dark:bg-slate-900 dark:text-rose-200"
          >
            Retry
          </button>
        </div>
      );
    }
    return null;
  };

  const renderDashboard = () => (
    <div className="space-y-4 sm:space-y-5">
      {renderDataNotice()}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
        {[
          { label: 'Modules', value: scopedModules.length, detail: `For ${userComponent}`, icon: BookOpen, tone: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200' },
          { label: 'Facilitators', value: scopedFacilitators.filter((facilitator) => facilitator.accountStatus !== 'SUSPENDED').length, detail: 'Active facilitators', icon: Users, tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200' },
          { label: 'Students', value: scopedStudents.length, detail: `Enrolled in ${userComponent}`, icon: UserCog, tone: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-200' },
          { label: 'Classes', value: scopedClasses.length, detail: `Sections in ${userComponent}`, icon: ClipboardList, tone: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-200' },
          { label: 'Assessments', value: assessmentCount, detail: 'In the library', icon: ClipboardList, tone: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200' },
        ].map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className={`rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 ${idx === 4 ? 'col-span-2 md:col-span-1' : ''}`}>
              <div className="flex items-center gap-2.5 sm:gap-4">
                <span className={`grid h-10 w-10 sm:h-11 sm:w-11 shrink-0 place-items-center rounded-xl sm:rounded-2xl ${stat.tone}`}>
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xl sm:text-2xl font-bold text-slate-950 dark:text-white">{stat.value}</p>
                  <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 break-words leading-tight">{stat.label}</p>
                  <p className="mt-0.5 hidden text-xs text-slate-500 dark:text-slate-400 sm:block">{stat.detail}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Quick Actions</p>
          <div className="mt-3.5 grid grid-cols-2 gap-2 sm:gap-3">
            <button onClick={() => setView('modules')} className="flex flex-col items-start rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-left text-xs sm:text-sm font-semibold text-blue-800 hover:bg-blue-100 active:scale-[0.98] dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
              <BookOpen className="mb-1.5 h-4 w-4 sm:h-5 sm:w-5" />
              Manage Modules
            </button>
            <button onClick={() => setView('facilitators')} className="flex flex-col items-start rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-left text-xs sm:text-sm font-semibold text-emerald-800 hover:bg-emerald-100 active:scale-[0.98] dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
              <Users className="mb-1.5 h-4 w-4 sm:h-5 sm:w-5" />
              Manage Facilitators
            </button>
            <button onClick={() => setView('students')} className="flex flex-col items-start rounded-xl border border-violet-200 bg-violet-50/70 p-3 text-left text-xs sm:text-sm font-semibold text-violet-800 hover:bg-violet-100 active:scale-[0.98] dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">
              <UserCog className="mb-1.5 h-4 w-4 sm:h-5 sm:w-5" />
              View Students
            </button>
            <button onClick={() => setView('classes')} className="flex flex-col items-start rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-left text-xs sm:text-sm font-semibold text-sky-800 hover:bg-sky-100 active:scale-[0.98] dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
              <ClipboardList className="mb-1.5 h-4 w-4 sm:h-5 sm:w-5" />
              View Classes
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Student Distribution</p>
          <div className="mt-3.5">
            {scopedStudents.length === 0 ? (
              <div className="grid h-44 place-items-center text-center text-sm text-slate-500 dark:text-slate-400">
                {rosterLoading
                  ? 'Loading component roster…'
                  : studentError
                    ? 'Distribution unavailable until the roster loads.'
                    : `No students are enrolled in ${userComponent} yet.`}
              </div>
            ) : (
              <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-2">
                <div className="relative h-44 sm:h-48 min-w-0">
                  <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <PieChart>
                      <Pie data={componentData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={46} outerRadius={72} paddingAngle={2}>
                        {componentData.map((_, i) => <Cell key={i} fill={componentColors[i % componentColors.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <span>
                      <span className="block text-2xl font-bold text-slate-950 dark:text-white">{scopedStudents.length}</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">Total</span>
                    </span>
                  </div>
                </div>
                <div className="flex flex-col justify-center gap-2">
                  {componentData.map((item, i) => {
                    const percent = scopedStudents.length > 0 ? Math.round((item.value / scopedStudents.length) * 100) : 0;
                    return (
                      <div key={item.name} className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                        <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: componentColors[i % componentColors.length] }} />
                          <span className="truncate">{item.name}</span>
                        </span>
                        <div className="flex items-center gap-2 font-semibold">
                          <span className="text-slate-900 dark:text-white">{item.value}</span>
                          <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">({percent}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderModulesView = () => (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Module Library</p>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-950 dark:text-white">Manage Modules</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Create and manage modules for {userComponent}.</p>
        </div>
        <button onClick={handleNewModule} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 sm:py-3 text-sm font-semibold text-white hover:bg-blue-800">
          <Plus className="h-4 w-4" /> New Module
        </button>
      </div>

      {moduleError && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{moduleError}</div>}

      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        {/* Mobile card list (< 768px) */}
        <div className="space-y-3 md:hidden">
          {filteredModules.map((mod) => (
            <div key={mod.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{mod.title}</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {mod.status || 'DRAFT'}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <span className="rounded-md bg-blue-50 px-2 py-0.5 font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{mod.hours}h</span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">{mod.difficulty}</span>
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">{mod.component || 'Common'}</span>
              </div>
              <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-200/80 pt-2.5 dark:border-slate-700/80">
                <button onClick={() => handleEditModule(mod)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  <FileText className="h-3.5 w-3.5" />
                  <span>Edit</span>
                </button>
                <button onClick={() => handleDeleteModule(mod.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 shadow-sm hover:bg-rose-50 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-300">
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          ))}
          {filteredModules.length === 0 && (
            <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">No modules found. Create your first module.</p>
          )}
        </div>

        {/* Desktop Table (md and up) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3">Difficulty</th>
                <th className="px-4 py-3">Component</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredModules.map((mod) => (
                <tr key={mod.id} className="border-t border-slate-100 hover:bg-blue-50/60 dark:border-slate-800 dark:hover:bg-slate-900">
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{mod.title}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{mod.hours}h</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{mod.difficulty}</span></td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{mod.component || 'Common'}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{mod.status || 'DRAFT'}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => handleEditModule(mod)} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-700 hover:bg-blue-50 dark:border-slate-700 dark:text-slate-100"><FileText className="h-4 w-4" /></button>
                      <button onClick={() => handleDeleteModule(mod.id)} className="grid h-9 w-9 place-items-center rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-200"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredModules.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">No modules found. Create your first module.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderFacilitatorsView = () => (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Facilitator Management</p>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-950 dark:text-white">Manage Facilitators</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Assign facilitators to {allowedComponents.join(' or ')} with one to three municipalities.</p>
        </div>
        <button onClick={handleNewFacilitator} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 sm:py-3 text-sm font-semibold text-white hover:bg-blue-800">
          <Plus className="h-4 w-4" /> New Facilitator
        </button>
      </div>

      {facilitatorError && !facilitatorEditorOpen && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">{facilitatorError}</div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        {/* Mobile card list (< 768px) */}
        <div className="space-y-3 md:hidden">
          {filteredFacilitators.map((fac) => (
            <div key={fac.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200">{initials(fac.name)}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{fac.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{fac.email}</p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${fac.accountStatus === 'SUSPENDED' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>
                  {fac.accountStatus === 'SUSPENDED' ? 'Suspended' : 'Active'}
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">{fac.component}</span>
                {(fac.municipalities || []).map((m) => (
                  <span key={m} className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">{m}</span>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-200/80 pt-2.5 dark:border-slate-700/80">
                <button onClick={() => handleEditFacilitator(fac)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  <FileText className="h-3.5 w-3.5" />
                  <span>Edit</span>
                </button>
                <button onClick={() => handleFacilitatorStatus(fac)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  {fac.accountStatus === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                </button>
              </div>
            </div>
          ))}
          {filteredFacilitators.length === 0 && (
            <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">No facilitators found. Create your first facilitator.</p>
          )}
        </div>

        {/* Desktop Table (md and up) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Facilitator</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Component</th>
                <th className="px-4 py-3">Municipalities</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredFacilitators.map((fac) => (
                <tr key={fac.id} className="border-t border-slate-100 hover:bg-blue-50/60 dark:border-slate-800 dark:hover:bg-slate-900">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200">{initials(fac.name)}</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{fac.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fac.email}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{fac.component}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(fac.municipalities || []).slice(0, 3).map((m) => <span key={m} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">{m}</span>)}
                      {(fac.municipalities || []).length > 3 && <span className="text-xs text-slate-500">+{(fac.municipalities || []).length - 3}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${fac.accountStatus === 'SUSPENDED' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>{fac.accountStatus === 'SUSPENDED' ? 'Suspended' : 'Active'}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => handleEditFacilitator(fac)} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-700 hover:bg-blue-50 dark:border-slate-700 dark:text-slate-100"><FileText className="h-4 w-4" /></button>
                      <button onClick={() => handleFacilitatorStatus(fac)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">{fac.accountStatus === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredFacilitators.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">No facilitators found. Create your first facilitator.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderStudentsView = () => (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Component Roster</p>
        <h2 className="text-xl sm:text-2xl font-semibold text-slate-950 dark:text-white">{userComponent} Students</h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Served by the coordinator roster endpoint, already restricted to your component by the server.</p>
      </div>

      {renderDataNotice()}

      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        {/* Mobile card list (< 768px) */}
        <div className="space-y-3 md:hidden">
          {filteredStudents.map((student) => (
            <div key={student.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{student.name || '—'}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{student.studentId || student.email || '—'}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {student.status}
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">{student.component || 'Unassigned'}</span>
                {student.programSection && <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">{student.programSection}</span>}
                {student.yearLevel && <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">{student.yearLevel}</span>}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs border-t border-slate-200/80 pt-2 dark:border-slate-700/80">
                <span className="text-slate-500 dark:text-slate-400">Progress</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{student.progress}%</span>
              </div>
            </div>
          ))}
          {filteredStudents.length === 0 && (
            <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              {rosterLoading ? 'Loading students…' : studentError ? 'The roster could not be loaded.' : query ? 'No students match your search.' : `No students are enrolled in ${userComponent} yet.`}
            </p>
          )}
        </div>

        {/* Desktop Table (md and up) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Student No.</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Component</th>
                <th className="px-4 py-3">Section</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student) => (
                <tr key={student.id} className="border-t border-slate-100 hover:bg-blue-50/60 dark:border-slate-800 dark:hover:bg-slate-900">
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{student.name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{student.studentId || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{student.email || '—'}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200">{student.component || 'Unassigned'}</span></td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{student.programSection || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{student.yearLevel || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{student.progress}%</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-200">{student.status}</span></td>
                </tr>
              ))}
              {filteredStudents.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  {rosterLoading ? 'Loading students…' : studentError ? 'The roster could not be loaded.' : query ? 'No students match your search.' : `No students are enrolled in ${userComponent} yet.`}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderClassesView = () => (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Class Sections</p>
        <h2 className="text-xl sm:text-2xl font-semibold text-slate-950 dark:text-white">{userComponent} Classes</h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">{scopedClasses.length} section{scopedClasses.length === 1 ? '' : 's'} with {scopedClasses.reduce((sum, item) => sum + item.studentCount, 0)} enrolled student{scopedClasses.reduce((sum, item) => sum + item.studentCount, 0) === 1 ? '' : 's'}.</p>
      </div>

      {classError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">{classError}</div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        {/* Mobile card list (< 768px) */}
        <div className="space-y-3 md:hidden">
          {filteredClasses.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.name}</p>
                  <p className="text-xs font-mono text-blue-700 dark:text-blue-300 mt-0.5">{item.code}</p>
                </div>
                <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-500/20 dark:text-blue-300">
                  {item.studentCount} students
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">{item.component || 'Unassigned'}</span>
                <span className="text-slate-400">•</span>
                <span className="text-slate-600 dark:text-slate-300">{item.facilitatorName}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200/80 pt-2 dark:border-slate-700/80">
                <span>SY: {item.schoolYear}</span>
                <span>{item.semester}</span>
              </div>
            </div>
          ))}
          {filteredClasses.length === 0 && (
            <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              {classError ? 'Classes could not be loaded.' : query ? 'No classes match your search.' : `No classes have been created for ${userComponent} yet.`}
            </p>
          )}
        </div>

        {/* Desktop Table (md and up) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Component</th>
                <th className="px-4 py-3">Facilitator</th>
                <th className="px-4 py-3">School Year</th>
                <th className="px-4 py-3">Semester</th>
                <th className="px-4 py-3">Students</th>
              </tr>
            </thead>
            <tbody>
              {filteredClasses.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 hover:bg-blue-50/60 dark:border-slate-800 dark:hover:bg-slate-900">
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{item.code}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.name}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200">{item.component || 'Unassigned'}</span></td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.facilitatorName}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.schoolYear}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.semester}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.studentCount}</td>
                </tr>
              ))}
              {filteredClasses.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  {classError ? 'Classes could not be loaded.' : query ? 'No classes match your search.' : `No classes have been created for ${userComponent} yet.`}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderAttendanceView = () => {
    const facilitatorMap = new Map(facilitators.map((f) => [f.id, f.name]));
    const filteredSessions = attendanceSessions.filter((s) => {
      if (!query) return true;
      const facName = facilitatorMap.get(s.facilitatorId) || '';
      return [s.title, s.date, facName].some((v) => v.toLowerCase().includes(query));
    });

    return (
      <div className="space-y-4 sm:space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Field Sessions Audit</p>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-950 dark:text-white">Attendance Audit</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Review attendance sessions and learner turnout conducted by {userComponent} facilitators.</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          {/* Mobile card list (< 768px) */}
          <div className="space-y-3 md:hidden">
            {filteredSessions.map((session) => {
              const records = attendanceRecords.filter((r) => r.sessionId === session.id);
              const present = records.filter((r) => r.status === 'present').length;
              const late = records.filter((r) => r.status === 'late').length;
              const absent = records.filter((r) => r.status === 'absent').length;
              const excused = records.filter((r) => r.status === 'excused').length;
              const facName = facilitatorMap.get(session.facilitatorId) || 'Assigned Facilitator';

              return (
                <div key={session.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{session.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{session.date}</p>
                    </div>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-500/20 dark:text-blue-300">
                      {records.length} logged
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-medium">Facilitator:</span> {facName}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{present} Present</span>
                    <span className="rounded-md bg-amber-50 px-2 py-0.5 font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{late} Late</span>
                    <span className="rounded-md bg-rose-50 px-2 py-0.5 font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{absent} Absent</span>
                    {excused > 0 && <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{excused} Excused</span>}
                  </div>
                </div>
              );
            })}
            {filteredSessions.length === 0 && (
              <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">No attendance sessions recorded yet.</p>
            )}
          </div>

          {/* Desktop Table (md and up) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Session Date</th>
                  <th className="px-4 py-3">Title / Topic</th>
                  <th className="px-4 py-3">Facilitator</th>
                  <th className="px-4 py-3">Present</th>
                  <th className="px-4 py-3">Late</th>
                  <th className="px-4 py-3">Absent</th>
                  <th className="px-4 py-3">Turnout</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((session) => {
                  const records = attendanceRecords.filter((r) => r.sessionId === session.id);
                  const present = records.filter((r) => r.status === 'present').length;
                  const late = records.filter((r) => r.status === 'late').length;
                  const absent = records.filter((r) => r.status === 'absent').length;
                  const turnout = records.length ? Math.round(((present + late) / records.length) * 100) : 0;
                  const facName = facilitatorMap.get(session.facilitatorId) || 'Assigned Facilitator';

                  return (
                    <tr key={session.id} className="border-t border-slate-100 hover:bg-blue-50/60 dark:border-slate-800 dark:hover:bg-slate-900">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{session.date}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{session.title}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{facName}</td>
                      <td className="px-4 py-3 text-emerald-600 font-semibold">{present}</td>
                      <td className="px-4 py-3 text-amber-600 font-semibold">{late}</td>
                      <td className="px-4 py-3 text-rose-600 font-semibold">{absent}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                          {turnout}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filteredSessions.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">No attendance sessions recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Use the full coordinator report surface here. App returns coordinators into
  // this standalone dashboard before its generic shell router, so keeping a
  // second summary-only implementation made ReportsPage—and therefore scoped
  // grades and training groups—unreachable in real navigation.
  const renderReportsView = () => (
    <React.Suspense fallback={<div role="status" className="p-8 text-center text-sm text-slate-500">Loading reports…</div>}>
      <CoordinatorReports user={user} />
    </React.Suspense>
  );

  const renderContent = () => {
    switch (view) {
      case 'modules': return renderModulesView();
      case 'facilitators': return renderFacilitatorsView();
      case 'students': return renderStudentsView();
      case 'classes': return renderClassesView();
      case 'attendance': return renderAttendanceView();
      case 'reports': return renderReportsView();
      default: return renderDashboard();
    }
  };

  const pageTitle = view === 'dashboard'
    ? 'Dashboard'
    : view === 'modules'
      ? 'Module Library'
      : view === 'facilitators'
        ? 'Facilitator Management'
        : view === 'students'
          ? 'Component Students'
          : view === 'classes'
            ? 'Component Classes'
            : view === 'attendance'
              ? 'Attendance Audit'
              : 'Reports';

  // No component-specific screen or action is reachable until the API has
  // confirmed which program this coordinator owns.
  if (scopeState.status !== 'ready') {
    return (
      <div className={`${embedded ? 'min-h-0 bg-transparent' : 'min-h-dvh bg-[#f4f8fd]'} grid place-items-center p-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100`}>
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950">
          {scopeState.status === 'resolving' ? (
            <div role="status" className="space-y-3">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-700" aria-hidden="true" />
              <p className="text-base font-semibold text-slate-900 dark:text-white">Confirming your coordinator program…</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Component records stay hidden until the server confirms your assigned NSTP program.</p>
            </div>
          ) : (
            <div role="alert" className="space-y-3">
              <ShieldAlert className="mx-auto h-8 w-8 text-rose-600" aria-hidden="true" />
              <p className="text-base font-semibold text-slate-900 dark:text-white">Coordinator program unavailable</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">{scopeState.message}</p>
              {onLogout && (
                <button onClick={onLogout} className="mt-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Sign out</button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${embedded ? 'min-h-0 bg-transparent' : 'min-h-dvh overflow-x-hidden bg-[#f4f8fd]'} text-slate-900 dark:bg-slate-950 dark:text-slate-100`}>
      <div className={embedded ? 'min-h-0' : 'min-h-dvh'}>
        <CollapsibleRoleSidebar
          open={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
          portalLabel="Coordinator Portal"
          closeLabel="Close coordinator navigation"
          groups={[
            {
              label: 'Navigation',
              items: sideNavItems.map((item) => ({
                label: item.label,
                icon: item.icon,
                active: view === item.id,
                onClick: () => { setView(item.id); setMobileSidebarOpen(false); },
              })),
            },
          ]}
          avatarLabel={initials(user.name)}
          accountLabel="Coordinator"
          accountTitle={user.name}
          accountSubtitle={user.email}
          accountMeta={<div className="flex items-center gap-2 text-xs text-white/75"><span>{userComponent}</span></div>}
          onLogout={onLogout || (() => {})}
        />

        <main className={`min-w-0 overflow-auto rounded-[2rem] border border-slate-200 bg-white/90 shadow-xl shadow-slate-200/50 backdrop-blur transition-all duration-300 dark:border-slate-800 dark:bg-slate-900/85 dark:shadow-none ${embedded ? '' : 'm-2 sm:m-3 lg:ml-[76px]'}`}>
          {!embedded && (
            <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-3.5 py-2.5 sm:px-5 sm:py-3.5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
              <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                    <button type="button" onClick={() => setMobileSidebarOpen(true)} aria-label="Open coordinator navigation" className="inline-flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm lg:hidden dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                      <Menu className="h-5 w-5" />
                    </button>
                    <div className="min-w-0">
                      <p className="truncate text-[10px] sm:text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">Coordinator Portal — {userComponent}</p>
                      <h1 className="truncate text-lg sm:text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{pageTitle}</h1>
                    </div>
                  </div>

                  {/* Mobile header controls toolbar (visible under lg) */}
                  <div className="flex items-center gap-2 lg:hidden shrink-0">
                    {onNavigate && (
                      <button type="button" onClick={() => onNavigate('announcements')} aria-label="View announcements" className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                        <Bell className="h-4 w-4" />
                      </button>
                    )}
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-blue-700 text-xs font-semibold text-white shadow-sm" title={user.name}>
                      {initials(user.name)}
                    </div>
                  </div>
                </div>

                <div className="flex min-w-0 items-center gap-2.5 sm:gap-3 lg:justify-end">
                  <label className="flex h-9 sm:h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 sm:px-4 text-xs sm:text-sm shadow-sm dark:border-slate-700 dark:bg-slate-950 lg:w-64 xl:w-72">
                    <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search modules, facilitators, students or classes..." aria-label="Search modules, facilitators, students or classes" className="w-full min-w-0 bg-transparent text-slate-900 outline-none placeholder:text-slate-400 focus:border-transparent focus:shadow-none dark:text-slate-100" />
                  </label>
                  {/* Desktop header controls toolbar (visible on lg and up) */}
                  <div className="hidden lg:flex shrink-0 items-center gap-2.5 sm:gap-3">
                    {onNavigate && (
                      <button type="button" onClick={() => onNavigate('announcements')} aria-label="View announcements" className="grid h-10 w-10 sm:h-11 sm:w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                        <Bell className="h-5 w-5" />
                      </button>
                    )}
                    <div className="flex h-10 sm:h-11 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                      <span className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-full bg-blue-700 text-xs sm:text-sm font-semibold text-white">{initials(user.name)}</span>
                      <span className="hidden max-w-40 truncate text-sm font-medium text-slate-800 dark:text-slate-100 sm:block">{user.name}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="min-w-0 p-3.5 sm:p-5">
            {renderContent()}
          </div>
        </main>
      </div>

      {editorOpen && editingModule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3 sm:p-4">
          <div className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl sm:rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">{editingModule.id.startsWith('module-') ? 'Create' : 'Edit'} Module</p>
                <h3 className="text-xl font-semibold text-slate-950 dark:text-white">Module Details</h3>
              </div>
              <button onClick={() => { setEditorOpen(false); setEditingModule(null); }} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-500"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-1.5 md:col-span-2">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Title</span>
                <input value={editingModule.title} onChange={(e) => setEditingModule({ ...editingModule, title: e.target.value })} className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </label>
              <label className="block space-y-1.5 md:col-span-2">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Description</span>
                <textarea value={editingModule.description} onChange={(e) => setEditingModule({ ...editingModule, description: e.target.value })} rows={3} className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Hours</span>
                <input type="number" value={editingModule.hours} onChange={(e) => setEditingModule({ ...editingModule, hours: Number(e.target.value) })} className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Difficulty</span>
                <select value={editingModule.difficulty} onChange={(e) => setEditingModule({ ...editingModule, difficulty: e.target.value as any })} className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
              </label>
              <label className="block space-y-1.5 md:col-span-2">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Component</span>
                <select value={editingModule.component || allowedComponents[0]} onChange={(event) => setEditingModule({ ...editingModule, component: event.target.value as NstpModule['component'] })} className="w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  {allowedComponents.map((component) => <option key={component} value={component}>{component}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => { setEditorOpen(false); setEditingModule(null); }} className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Cancel</button>
              <button disabled={moduleSaving} onClick={handleSaveModule} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"><Save className="h-4 w-4" /> {moduleSaving ? 'Saving…' : 'Save Draft'}</button>
            </div>
          </div>
        </div>
      )}

      {facilitatorEditorOpen && editingFacilitator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3 sm:p-4">
          <div className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl sm:rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">{editingFacilitator.id === 'new-facilitator' ? 'Create' : 'Edit'} Facilitator</p>
                <h3 className="text-xl font-semibold text-slate-950 dark:text-white">Facilitator Details</h3>
              </div>
              <button onClick={() => { setFacilitatorEditorOpen(false); setEditingFacilitator(null); }} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-500"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Name</span>
                <input value={editingFacilitator.name} onChange={(e) => setEditingFacilitator({ ...editingFacilitator, name: e.target.value })} className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Email</span>
                <input value={editingFacilitator.email} onChange={(e) => setEditingFacilitator({ ...editingFacilitator, email: e.target.value })} className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Employee Number</span>
                <input value={editingFacilitator.employeeNumber || ''} onChange={(e) => setEditingFacilitator({ ...editingFacilitator, employeeNumber: e.target.value })} className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">NSTP Component</span>
                <select value={editingFacilitator.component || allowedComponents[0]} onChange={(event) => setEditingFacilitator({ ...editingFacilitator, component: event.target.value as NstpAccount['component'] })} className="w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                  {allowedComponents.map((component) => <option key={component} value={component}>{component}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{editingFacilitator.id === 'new-facilitator' ? 'Provisioning Password' : 'New Password (optional)'}</span>
                <input type="password" value={editingFacilitator.password} onChange={(e) => setEditingFacilitator({ ...editingFacilitator, password: e.target.value })} placeholder={editingFacilitator.id === 'new-facilitator' ? 'At least 8 characters' : 'Leave blank to keep current password'} className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Contact Number</span>
                <input value={editingFacilitator.contactNumber || ''} onChange={(e) => setEditingFacilitator({ ...editingFacilitator, contactNumber: e.target.value })} className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </label>
              <div className="space-y-1.5 md:col-span-2">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Assigned Municipalities (select 1–3)</span>
                <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                  {BILIRAN_MUNICIPALITIES.map((item) => {
                    const selected = editingFacilitator.municipalities?.includes(item) || false;
                    const unavailable = !selected && (editingFacilitator.municipalities?.length || 0) >= 3;
                    return (
                      <label key={item} className={`inline-flex items-center gap-2 px-1 py-1 text-sm font-semibold ${unavailable ? 'cursor-not-allowed text-slate-400 dark:text-slate-600' : 'cursor-pointer'} ${selected ? 'text-blue-800 dark:text-blue-200' : 'text-slate-600 dark:text-slate-300'}`}>
                        <input type="checkbox" checked={selected} onChange={(e) => {
                          const current = editingFacilitator.municipalities || [];
                          setEditingFacilitator({ ...editingFacilitator, municipalities: e.target.checked ? [...current, item] : current.filter((m) => m !== item) });
                        }} disabled={unavailable} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" />
                        {item}
                      </label>
                    );
                  })}
                </div>
                {facilitatorError && <p className="mt-2 text-sm font-medium text-rose-600 dark:text-rose-300">{facilitatorError}</p>}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => { setFacilitatorEditorOpen(false); setEditingFacilitator(null); }} className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Cancel</button>
              <button disabled={facilitatorSaving} onClick={handleSaveFacilitator} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"><Save className="h-4 w-4" /> {facilitatorSaving ? 'Saving…' : 'Save Facilitator'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
