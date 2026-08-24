import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, Bell, BookOpen, Check, ChevronDown, ClipboardList, Download, FileText, LayoutDashboard, Loader2, Menu, Plus, Save, Search, Settings, ShieldAlert, Trash2, Upload, UserCog, Users, X,
} from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import CollapsibleRoleSidebar from '../../../components/layout/CollapsibleRoleSidebar';
import {
  BILIRAN_MUNICIPALITIES, createEmptyModule, NstpAccount, NstpModule, NstpStudent,
} from '../../../data/nstpData';
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
  type CoordinatorView = 'dashboard' | 'modules' | 'facilitators' | 'students' | 'classes' | 'reports';

  const [view, setView] = useState<CoordinatorView>('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [modules, setModules] = useState<NstpModule[]>([]);
  const [facilitators, setFacilitators] = useState<NstpAccount[]>([]);
  const [students, setStudents] = useState<NstpStudent[]>([]);
  const [classes, setClasses] = useState<CoordinatorClass[]>([]);
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

    const loadModulesAndRoster = async () => {
      let moduleRecords: NstpModule[] = [];
      try {
        moduleRecords = await fetchManagedModules('coordinator');
        if (cancelled) return;
        setModules(moduleRecords);
        setModuleError(null);
      } catch (error) {
        if (cancelled) return;
        setModuleError(error instanceof Error ? error.message : 'Unable to load modules.');
      }

      // Progress is measured against the published modules in this scope so the
      // percentage is derived from real records instead of a placeholder.
      const publishedTarget = moduleRecords.filter((module) => (module.status || 'DRAFT') === 'PUBLISHED').length;

      try {
        const roster = await fetchCoordinatorStudents(publishedTarget);
        if (cancelled) return;
        setStudents(roster);
        setStudentError(null);
      } catch (error) {
        if (cancelled) return;
        setStudents([]);
        setStudentError(error instanceof Error ? error.message : 'Unable to load the component student roster.');
      } finally {
        if (!cancelled) setRosterLoading(false);
      }
    };

    loadModulesAndRoster();

    fetchCoordinatorClasses()
      .then((records) => { if (!cancelled) { setClasses(records); setClassError(null); } })
      .catch((error) => {
        if (cancelled) return;
        setClasses([]);
        setClassError(error instanceof Error ? error.message : 'Unable to load component classes.');
      });

    fetchManagedAssessments('coordinator')
      .then((records) => { if (!cancelled) setAssessmentCount(records.length); })
      .catch((error) => { if (!cancelled) setModuleError(error instanceof Error ? error.message : 'Unable to load assessments.'); });

    fetchMyFacilitators()
      .then((records) => { if (!cancelled) { setFacilitators(records.map(facilitatorRecordToAccount)); setFacilitatorError(null); } })
      .catch((error) => { if (!cancelled) setFacilitatorError(error instanceof Error ? error.message : 'Unable to load facilitators.'); });

    return () => { cancelled = true; };
  }, [coordinatorScope]);

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
    if (studentError || classError) {
      return (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          {studentError || classError}
        </div>
      );
    }
    return null;
  };

  const renderDashboard = () => (
    <div className="space-y-5">
      {renderDataNotice()}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {[
          { label: 'Modules', value: scopedModules.length, detail: `For ${userComponent}`, icon: BookOpen, tone: 'bg-blue-50 text-blue-700' },
          { label: 'Facilitators', value: scopedFacilitators.filter((facilitator) => facilitator.accountStatus !== 'SUSPENDED').length, detail: 'Active facilitators', icon: Users, tone: 'bg-emerald-50 text-emerald-700' },
          { label: 'Students', value: scopedStudents.length, detail: `Enrolled in ${userComponent}`, icon: UserCog, tone: 'bg-violet-50 text-violet-700' },
          { label: 'Classes', value: scopedClasses.length, detail: `Sections in ${userComponent}`, icon: ClipboardList, tone: 'bg-sky-50 text-sky-700' },
          { label: 'Assessments', value: assessmentCount, detail: 'In the library', icon: ClipboardList, tone: 'bg-amber-50 text-amber-700' },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center gap-4">
                <span className={`grid h-14 w-14 place-items-center rounded-2xl ${stat.tone}`}><Icon className="h-6 w-6" /></span>
                <div>
                  <p className="text-2xl font-semibold text-slate-950 dark:text-white">{stat.value}</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{stat.label}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{stat.detail}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Quick Actions</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button onClick={() => setView('modules')} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-left text-sm font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
              <BookOpen className="mb-1 h-5 w-5" />
              Manage Modules
            </button>
            <button onClick={() => setView('facilitators')} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
              <Users className="mb-1 h-5 w-5" />
              Manage Facilitators
            </button>
            <button onClick={() => setView('students')} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-left text-sm font-semibold text-violet-800 hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">
              <UserCog className="mb-1 h-5 w-5" />
              View Students
            </button>
            <button onClick={() => setView('classes')} className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-left text-sm font-semibold text-sky-800 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
              <ClipboardList className="mb-1 h-5 w-5" />
              View Classes
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Student Distribution</p>
          <div className="mt-4 h-48">
            {scopedStudents.length === 0 ? (
              <div className="grid h-full place-items-center text-center text-sm text-slate-500 dark:text-slate-400">
                {rosterLoading
                  ? 'Loading component roster…'
                  : studentError
                    ? 'Distribution unavailable until the roster loads.'
                    : `No students are enrolled in ${userComponent} yet.`}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={componentData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {componentData.map((_, i) => <Cell key={i} fill={componentColors[i % componentColors.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderModulesView = () => (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Module Library</p>
          <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">Manage Modules</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Create and manage modules for {userComponent}.</p>
        </div>
        <button onClick={handleNewModule} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800">
          <Plus className="h-4 w-4" /> New Module
        </button>
      </div>

      {moduleError && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{moduleError}</div>}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="overflow-x-auto">
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
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Facilitator Management</p>
          <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">Manage Facilitators</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Assign facilitators to {allowedComponents.join(' or ')} with one to three municipalities.</p>
        </div>
        <button onClick={handleNewFacilitator} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800">
          <Plus className="h-4 w-4" /> New Facilitator
        </button>
      </div>

      {facilitatorError && !facilitatorEditorOpen && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">{facilitatorError}</div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="overflow-x-auto">
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
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Component Roster</p>
        <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">{userComponent} Students</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Served by the coordinator roster endpoint, already restricted to your component by the server.</p>
      </div>

      {renderDataNotice()}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="overflow-x-auto">
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
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Class Sections</p>
        <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">{userComponent} Classes</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{scopedClasses.length} section{scopedClasses.length === 1 ? '' : 's'} with {scopedClasses.reduce((sum, item) => sum + item.studentCount, 0)} enrolled student{scopedClasses.reduce((sum, item) => sum + item.studentCount, 0) === 1 ? '' : 's'}.</p>
      </div>

      {classError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">{classError}</div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="overflow-x-auto">
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

        <main className={`min-w-0 overflow-auto rounded-[2rem] border border-slate-200 bg-white/90 shadow-xl shadow-slate-200/50 backdrop-blur transition-all duration-300 dark:border-slate-800 dark:bg-slate-900/85 dark:shadow-none ${embedded ? '' : 'm-3 lg:ml-[76px]'}`}>
          {!embedded && (
            <div className="sticky top-0 z-20 flex flex-col gap-4 border-b border-slate-200 bg-white/90 px-5 py-5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                  <button type="button" onClick={() => setMobileSidebarOpen(true)} aria-label="Open coordinator navigation" className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm lg:hidden dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                    <Menu className="h-5 w-5" />
                  </button>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Coordinator Portal — {userComponent}</p>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">{pageTitle}</h1>
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end">
                  <label className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-950 sm:min-w-[16rem] xl:w-[24rem]">
                    <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search modules, facilitators, students or classes..." aria-label="Search modules, facilitators, students or classes" className="w-full bg-transparent text-slate-900 outline-none placeholder:text-slate-400 focus:border-transparent focus:shadow-none dark:text-slate-100" />
                  </label>
                  {onNavigate && (
                    <button type="button" onClick={() => onNavigate('announcements')} aria-label="View announcements" className="grid h-12 w-12 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                      <Bell className="h-5 w-5" />
                    </button>
                  )}
                  <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-700 text-sm font-semibold text-white">{initials(user.name)}</span>
                    <span className="hidden max-w-40 truncate text-sm font-medium text-slate-800 dark:text-slate-100 sm:block">{user.name}</span>
                  </div>
                </div>
            </div>
          )}

          <div className="min-w-0 p-5">
            {renderContent()}
          </div>
        </main>
      </div>

      {editorOpen && editingModule && (
        <div className="fixed inset-0 z-50 grid items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
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
        <div className="fixed inset-0 z-50 grid items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
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
