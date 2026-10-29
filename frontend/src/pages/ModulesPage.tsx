import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Clock, CheckCircle, Search, Sparkles, Gauge, ChevronRight, Plus, Trash2, Save, ArrowLeft, ArrowUp, ArrowDown, Copy, Wrench, Video, ExternalLink } from 'lucide-react';
import { createEmptyModule, type NstpAssessment, type NstpModule, type NstpRole } from '../data/nstpData';
import { toSafeEmbedUrl, toSafeExternalUrl } from '../utils/moduleUrls';
import { apiGet, apiPost } from '../services/apiClient';
import { createManagedModule, fetchManagedModules, removeManagedModule, updateManagedModule } from '../services/modules';
import { fetchManagedAssessments, fetchStudentAssessments } from '../services/assessments';
import { useCoordinatorScope } from '../hooks/useCoordinatorScope';
import type { AuthenticatedUser } from '../services/authUser';

export default function ModulesPage({ user, role = 'student', onBack }: { user: AuthenticatedUser; role?: NstpRole; onBack?: () => void }) {
  const [modules, setModules] = useState<NstpModule[]>([]);
  const [assessments, setAssessments] = useState<NstpAssessment[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [editorDraft, setEditorDraft] = useState<NstpModule | null>(null);
  const [moduleError, setModuleError] = useState<string | null>(null);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [moduleSaving, setModuleSaving] = useState(false);
  const effectiveRole = (role === 'student' && user.role === 'facilitator' ? 'facilitator' : role) as NstpRole;

  // A coordinator's module and assessment lists are component-scoped by the API,
  // so they are not a picture of the whole library. They stay in this component's
  // state and never touch the shared `nstp-module-library` /
  // `nstp-assessment-library` snapshot, which the admin screens, the shell
  // counters and RoleDashboardHome read as if it were global. Admin, facilitator
  // and student sessions keep using the snapshot: for them it is populated from
  // the endpoints their own role is entitled to.
  const isComponentScoped = effectiveRole === 'coordinator';

  // Display metadata only, and requested only for the role that has a scope:
  // passing `null` for everyone else keeps `useCoordinatorScope` from probing
  // /auth/me for an answer that is known in advance (see ReportsPage, which does
  // the same). The list decides which component options this editor may *offer*;
  // whether a write is allowed is re-derived from the database by
  // backend/src/modules/nstp/nstp.service.js#resolveModuleComponent on every
  // request, and a component outside the coordinator's program is refused there
  // regardless of what this select contains.
  const coordinatorScope = useCoordinatorScope(isComponentScoped ? user : null);
  const allowedComponents = coordinatorScope.allowedComponents;

  /** Applies a module list to local state, keeping the selection and editor valid. */
  const applyModuleList = useCallback((nextModules: NstpModule[]) => {
    setModules(nextModules);
    setSelectedModuleId((current) => current && nextModules.some((module) => module.id === current)
      ? current
      : nextModules[0]?.id || null);
    setEditorDraft((current) => current && nextModules.some((module) => module.id === current.id)
      ? nextModules.find((module) => module.id === current.id) || null
      : nextModules[0] || null);
  }, []);

  const applyModules = useCallback((nextModules: NstpModule[]) => {
    applyModuleList(nextModules);
  }, [applyModuleList]);

  useEffect(() => {
    let active = true;
    setModulesLoading(true);
    fetchManagedModules(effectiveRole)
      .then((records) => {
        if (!active) return;
        applyModules(records);
        setModuleError(null);
      })
      .catch((error) => {
        if (active) setModuleError(error instanceof Error ? error.message : 'Unable to load modules.');
      })
      .finally(() => {
        if (active) setModulesLoading(false);
      });
    return () => { active = false; };
  }, [applyModules, effectiveRole]);

  useEffect(() => {
    const request = effectiveRole === 'student'
      ? fetchStudentAssessments()
      : fetchManagedAssessments(effectiveRole as 'admin' | 'coordinator' | 'facilitator');
    request.then((records) => {
      setAssessments(records);
    }).catch((error) => setModuleError(error instanceof Error ? error.message : 'Unable to load linked assessments.'));
  }, [effectiveRole, isComponentScoped]);

  useEffect(() => {
    if (effectiveRole !== 'student') return;
    apiGet<{ success: boolean; data: { progress: Array<{ moduleId: string; completedAt: string | null }> } }>('/nstp/students/me/progress')
      .then(({ data }) => setProgress(Object.fromEntries(data.progress.map((entry) => [entry.moduleId, Boolean(entry.completedAt)]))))
      .catch(() => { /* displayed state remains unconfirmed; local storage is never used as completion evidence */ });
  }, [user.id, effectiveRole]);

  const selectedModule = useMemo(() => modules.find((module) => module.id === selectedModuleId) || null, [modules, selectedModuleId]);
  const isAdmin = role === 'admin' || role === 'coordinator';
  const editorRole = role === 'coordinator' ? 'coordinator' : 'admin';

  useEffect(() => {
    if (selectedModule) {
      setEditorDraft(selectedModule);
    }
  }, [selectedModule]);

  const toggleModuleComplete = async (moduleId: string) => {
    if (progress[moduleId]) return;
    try {
      const response = await apiPost<{ success: boolean; data: { moduleId: string; completedAt: string | null } }>(`/nstp/students/me/modules/${moduleId}/complete`, {});
      setProgress((current) => ({ ...current, [response.data.moduleId]: Boolean(response.data.completedAt) }));
    } catch { /* optimistic state is not applied until the server confirms completion */ }
  };

  const getModuleProgress = (module: NstpModule) => {
    return progress[module.id] ? 100 : 0;
  };

  const isModuleUnlocked = (moduleList: NstpModule[], moduleIndex: number) => {
    if (moduleIndex === 0) return true;
    const previousModule = moduleList[moduleIndex - 1];
    return previousModule ? getModuleProgress(previousModule) === 100 : true;
  };

  const commonModules = modules.filter((module) => (module.component || 'Common') === 'Common');
  const totalHours = commonModules.reduce((accumulator, module) => accumulator + (getModuleProgress(module) === 100 ? module.hours : 0), 0);
  const plannedCommonHours = commonModules.reduce((accumulator, module) => accumulator + module.hours, 0);
  const publishedAssessments = assessments.filter((assessment) => assessment.status === 'published');
  const modulesWithPublishedTests = commonModules.filter((module) =>
    publishedAssessments.some((assessment) => assessment.moduleId === module.id && assessment.type !== 'exam')
  ).length;
  const hasMajorExam = publishedAssessments.some((assessment) => assessment.type === 'exam');
  const complianceReady = plannedCommonHours >= 25 && modulesWithPublishedTests >= commonModules.length && hasMajorExam;
  const completedModulesCount = commonModules.filter((module) => getModuleProgress(module) === 100).length;
  const overallProgress = commonModules.length > 0 ? Math.round((totalHours / Math.max(1, plannedCommonHours)) * 100) : 0;
  const publishedModules = modules.filter((module) => module.status === 'PUBLISHED');
  const draftModules = modules.filter((module) => (module.status || 'DRAFT') === 'DRAFT');
  const archivedModules = modules.filter((module) => module.status === 'ARCHIVED');

  // The preferred component is a student-only field: it exists while the exam
  // result is pending and is what decides which component modules are offered.
  // Staff sessions have no preference to fall back on, so they read as 'Common'.
  const preferredComponent = user.role === 'student' ? user.preferredComponent : undefined;
  const studentComponent = user.component || preferredComponent || 'Common';
  const studentVisibleModules = isAdmin
    ? modules
    : modules.filter((module) => {
      const published = module.status === 'PUBLISHED';
      const moduleComponent = module.component || 'Common';
      return published && (moduleComponent === 'Common' || moduleComponent === studentComponent);
    });
  const nextRecommendedModule = studentVisibleModules.find((module, index) => isModuleUnlocked(studentVisibleModules, index) && getModuleProgress(module) < 100) || studentVisibleModules[0] || null;

  useEffect(() => {
    if (isAdmin) return;
    if (studentVisibleModules.length === 0) {
      setSelectedModuleId(null);
      return;
    }
    if (!selectedModuleId || !studentVisibleModules.some((module) => module.id === selectedModuleId)) {
      setSelectedModuleId(studentVisibleModules[0].id);
    }
  }, [isAdmin, selectedModuleId, studentVisibleModules]);

  const visibleModules = studentVisibleModules.filter((module) => {
    const text = `${module.title} ${module.description}`.toLowerCase();
    const matchesSearch = text.includes(search.toLowerCase());
    const matchesDifficulty = difficultyFilter === 'all' || module.difficulty === difficultyFilter;
    return matchesSearch && matchesDifficulty;
  });

  useEffect(() => {
    const hasUnsavedDraft = Boolean(editorDraft && !modules.some((module) => module.id === editorDraft.id));
    if (isAdmin && hasUnsavedDraft) return;
    if (visibleModules.length === 0) {
      setSelectedModuleId(null);
      if (isAdmin) setEditorDraft(null);
      return;
    }

    if (!selectedModuleId || !visibleModules.some((module) => module.id === selectedModuleId)) {
      setSelectedModuleId(visibleModules[0].id);
      if (isAdmin) {
        setEditorDraft(visibleModules[0]);
      }
    }
  }, [visibleModules, selectedModuleId, isAdmin, editorDraft, modules]);

  const getDifficultyClass = (difficulty: string) => {
    if (difficulty === 'Beginner') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (difficulty === 'Intermediate') return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-rose-100 text-rose-700 border-rose-200';
  };

  const updateDraft = (patch: Partial<NstpModule>) => {
    if (!editorDraft) return;
    setEditorDraft({ ...editorDraft, ...patch, updatedAt: new Date().toISOString() });
  };

  const saveDraft = async () => {
    if (!editorDraft) return;
    if (!editorDraft.title.trim() || !editorDraft.description.trim() || editorDraft.hours < 1) {
      setModuleError('Enter a title, description, and valid duration before saving.');
      return;
    }
    // Pre-flight guidance, not an authorization decision: the server refuses a
    // component-less or out-of-scope coordinator write on its own
    // (nstp.service.js#resolveModuleComponent). Saying so here turns an opaque
    // 403 into an instruction, and never widens anything — the request is still
    // sent for every value the picker can produce.
    if (isComponentScoped && (!editorDraft.component || editorDraft.component === 'Common')) {
      setModuleError(allowedComponents.length > 0
        ? 'Choose the NSTP component this module belongs to. Coordinators cannot create shared "Common" modules.'
        : coordinatorScope.state.status === 'unavailable'
          ? coordinatorScope.state.message
          : 'Confirming your component program — try again in a moment.');
      return;
    }
    setModuleSaving(true);
    setModuleError(null);
    try {
      const exists = modules.some((module) => module.id === editorDraft.id);
      const saved = exists
        ? await updateManagedModule(editorRole, editorDraft)
        : await createManagedModule(editorRole, { ...editorDraft, status: 'DRAFT' });
      const nextModules = exists
        ? modules.map((module) => (module.id === saved.id ? saved : module))
        : [saved, ...modules];
      applyModules(nextModules);
      setSelectedModuleId(saved.id);
      setEditorDraft(saved);
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : 'Unable to save the module.');
    } finally {
      setModuleSaving(false);
    }
  };

  const deleteModule = async () => {
    if (!editorDraft) return;
    const exists = modules.some((module) => module.id === editorDraft.id);
    if (!exists) {
      setSelectedModuleId(null);
      setEditorDraft(null);
      return;
    }
    if (!window.confirm(`Delete "${editorDraft.title}"? Modules with academic records will be archived instead.`)) return;
    setModuleSaving(true);
    setModuleError(null);
    try {
      const result = await removeManagedModule(editorRole, editorDraft.id);
      const refreshed = await fetchManagedModules(effectiveRole);
      applyModules(refreshed);
      const next = refreshed.find((module) => module.id === editorDraft.id) || refreshed[0] || null;
      setSelectedModuleId(next?.id || null);
      setEditorDraft(next);
      if (result.archived) setModuleError('This module has academic records, so it was archived instead of permanently deleted.');
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : 'Unable to remove the module.');
    } finally {
      setModuleSaving(false);
    }
  };

  const createModule = () => {
    // A coordinator may only attach a module to a component inside its own
    // program, and the API refuses a component-less ('Common') module for any
    // narrowed actor. `createEmptyModule()` produces 'Common', so a coordinator
    // creating a module here used to be a guaranteed 403 with no way to correct
    // it — there was no component field on the form. The draft now starts on the
    // coordinator's first allowed component (matching CoordinatorDashboard) and
    // the editor exposes the picker below.
    const nextModule = createEmptyModule();
    const seeded = isComponentScoped && allowedComponents[0]
      ? { ...nextModule, component: allowedComponents[0] }
      : nextModule;
    setSelectedModuleId(seeded.id);
    setEditorDraft(seeded);
    setModuleError(null);
  };

  const togglePublishModule = async (moduleId: string) => {
    const target = modules.find((module) => module.id === moduleId);
    if (!target) return;
    const nextStatus = target.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    setModuleSaving(true);
    setModuleError(null);
    try {
      const saved = await updateManagedModule(editorRole, { ...target, status: nextStatus });
      applyModules(modules.map((module) => module.id === saved.id ? saved : module));
      setEditorDraft(saved);
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : 'Unable to change module status.');
    } finally {
      setModuleSaving(false);
    }
  };

  const bulkSetPublishState = async (publish: boolean) => {
    setModuleSaving(true);
    setModuleError(null);
    try {
      const targets = modules.filter((module) => module.status !== 'ARCHIVED');
      const updated = await Promise.all(targets.map((module) => updateManagedModule(editorRole, {
        ...module,
        status: publish ? 'PUBLISHED' : 'DRAFT',
      })));
      const byId = new Map(updated.map((module) => [module.id, module]));
      applyModules(modules.map((module) => byId.get(module.id) || module));
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : 'Unable to update all modules.');
      const refreshed = await fetchManagedModules(effectiveRole).catch(() => null);
      if (refreshed) applyModules(refreshed);
    } finally {
      setModuleSaving(false);
    }
  };

  const moveModule = async (direction: 'up' | 'down') => {
    if (!editorDraft) return;
    const index = modules.findIndex((module) => module.id === editorDraft.id);
    if (index < 0) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= modules.length) return;
    const reordered = [...modules];
    const [item] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, item);
    const ordered = reordered.map((module, order) => ({ ...module, order }));
    setModuleSaving(true);
    setModuleError(null);
    try {
      const changed = await Promise.all([ordered[index], ordered[targetIndex]].map((module) => updateManagedModule(editorRole, module)));
      const byId = new Map(changed.map((module) => [module.id, module]));
      applyModules(ordered.map((module) => byId.get(module.id) || module));
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : 'Unable to reorder modules.');
    } finally {
      setModuleSaving(false);
    }
  };

  const cloneModule = () => {
    if (!editorDraft) return;
    const cloned: NstpModule = {
      ...editorDraft,
      id: `module-${Math.random().toString(36).slice(2, 10)}`,
      title: `${editorDraft.title} (Copy)`,
      status: 'DRAFT',
      isPublished: false,
      updatedAt: new Date().toISOString(),
    };
    setSelectedModuleId(cloned.id);
    setEditorDraft(cloned);
    setModuleError(null);
  };

  if (!selectedModule && !isAdmin) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="font-semibold text-slate-900 mb-2">{modulesLoading ? 'Loading modules…' : 'No modules available yet.'}</p>
        <p className="text-sm text-slate-600">{moduleError || 'Check back after the coordinator publishes the module library.'}</p>
      </div>
    );
  }

  const detailModule = editorDraft && isAdmin ? editorDraft : selectedModule;
  const videoEmbedUrl = toSafeEmbedUrl(detailModule?.videoUrl);
  const videoUrl = toSafeExternalUrl(detailModule?.videoUrl);
  const meetingUrl = toSafeExternalUrl(detailModule?.meetingLink);
  const documentUrl = toSafeExternalUrl(detailModule?.documentLink);
  const navigationModules = visibleModules;
  const detailModuleIndex = detailModule ? navigationModules.findIndex((module) => module.id === detailModule.id) : -1;
  const previousModule = detailModuleIndex > 0 ? navigationModules[detailModuleIndex - 1] : null;
  const nextModule = detailModuleIndex >= 0 && detailModuleIndex < navigationModules.length - 1 ? navigationModules[detailModuleIndex + 1] : null;

  const openModule = (moduleId: string) => {
    const target = modules.find((module) => module.id === moduleId);
    if (!target) return;
    setSelectedModuleId(moduleId);
    if (isAdmin) {
      setEditorDraft(target);
    }
  };

  return (
    <div className="bento-screen grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <div className="bento-panel p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] font-semibold text-blue-700">Module Library</p>
              <h2 className="text-xl font-bold text-slate-900">{isAdmin ? 'Manage modules' : 'Your learning path'}</h2>
            </div>
            {isAdmin && (
              <button
                onClick={createModule}
                className="module-btn-primary clickable-button px-3 py-2"
              >
                <Plus className="w-4 h-4" />
                New
              </button>
            )}
          </div>

          {moduleError && (
            <div role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {moduleError}
            </div>
          )}

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search modules"
              className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
          </div>

          <div className="grid gap-3">
            <select
              value={difficultyFilter}
              onChange={(event) => setDifficultyFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            >
              <option value="all">All difficulty</option>
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </select>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Module selection</p>
              <select
                value={detailModule?.id || ''}
                onChange={(event) => openModule(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                disabled={visibleModules.length === 0}
              >
                {visibleModules.length === 0 && <option value="">No modules match current filters</option>}
                {visibleModules.map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.title} • {getModuleProgress(module)}%
                  </option>
                ))}
              </select>
            </div>

            {detailModule && (
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900 line-clamp-1">{detailModule.title}</p>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getDifficultyClass(detailModule.difficulty)}`}>
                    {detailModule.difficulty}
                  </span>
                </div>
                <p className="line-clamp-2 text-xs text-slate-600">{detailModule.description}</p>
                <div className="mt-3 rounded-full bg-slate-100 h-2 overflow-hidden">
                  <div className="h-2 rounded-full bg-gradient-to-r from-blue-700 to-yellow-500" style={{ width: `${getModuleProgress(detailModule)}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>{detailModule.hours} hrs</span>
                  <span>{getModuleProgress(detailModule)}% complete</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <div className="bento-panel p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Compliance</p>
            <p className={`mt-1 text-2xl font-bold ${complianceReady ? 'text-emerald-600' : 'text-amber-600'}`}>
              {complianceReady ? 'Ready' : 'Review'}
            </p>
            <p className="mt-1 text-xs text-slate-600">{plannedCommonHours}/25 common hours, {modulesWithPublishedTests}/{commonModules.length} post-tests, {hasMajorExam ? 'major exam set' : 'major exam missing'}</p>
          </div>
          <div className="bento-panel p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Visible modules</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{visibleModules.length}</p>
          </div>
          <div className="bento-panel p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Completed modules</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{completedModulesCount}</p>
          </div>
          <div className="bento-panel p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Overall progress</p>
            <p className="mt-1 text-2xl font-bold text-blue-700">{overallProgress}%</p>
            {nextRecommendedModule && (
              <p className="mt-1 text-xs text-slate-600 line-clamp-1">Next: {nextRecommendedModule.title}</p>
            )}
          </div>
          {isAdmin && (
            <div className="bento-panel p-4 sm:col-span-3 xl:col-span-1">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Library Map</p>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">{publishedModules.length} live</span>
              </div>
              <div className="max-h-[34rem] space-y-2 overflow-auto pr-1">
                {visibleModules.map((module) => (
                  <button
                    key={module.id}
                    onClick={() => openModule(module.id)}
                    className={`w-full rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                      detailModule?.id === module.id ? 'border-blue-300 bg-blue-50 text-blue-950' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{module.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${module.status === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-700' : module.status === 'ARCHIVED' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
                        {module.status === 'PUBLISHED' ? 'Live' : module.status === 'ARCHIVED' ? 'Archived' : 'Draft'}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <span>{module.hours} hrs</span>
                      <span>{module.component || 'Common'}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      <section className="bento-scroll space-y-4">
        {!detailModule ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <p className="text-lg font-semibold text-slate-900 mb-2">Select a module</p>
            <p className="text-sm text-slate-600">Open any module card to start learning or editing.</p>
          </div>
        ) : isAdmin ? (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-blue-700" />
                  <p className="text-xs uppercase tracking-[0.14em] font-semibold text-blue-700">Module Operations</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-xs text-slate-500">Published</p>
                    <p className="text-xl font-bold text-slate-900">{publishedModules.length}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-xs text-slate-500">Draft</p>
                    <p className="text-xl font-bold text-slate-900">{draftModules.length}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-xs text-slate-500">Confirmed completions</p>
                    <p className="text-xl font-bold text-slate-900">{selectedModule?.completedStudents || 0}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-xs text-slate-500">Archived</p>
                    <p className="text-xl font-bold text-slate-900">{archivedModules.length}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => togglePublishModule(detailModule.id)}
                    disabled={moduleSaving || detailModule.status === 'ARCHIVED' || !modules.some((module) => module.id === detailModule.id)}
                    className="module-btn clickable-button px-3 py-2"
                  >
                    {detailModule.status === 'PUBLISHED' ? 'Unpublish module' : 'Publish module'}
                  </button>
                  <button
                    onClick={() => bulkSetPublishState(true)}
                    disabled={moduleSaving}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    Publish all
                  </button>
                  <button
                    onClick={() => bulkSetPublishState(false)}
                    disabled={moduleSaving}
                    className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100"
                  >
                    Set all to draft
                  </button>
                  <button
                    onClick={cloneModule}
                    className="module-btn clickable-button px-3 py-2"
                  >
                    <Copy className="w-4 h-4" />
                    Clone module
                  </button>
                  <button
                    onClick={() => moveModule('up')}
                    className="module-btn clickable-button px-3 py-2"
                  >
                    <ArrowUp className="w-4 h-4" />
                    Move up
                  </button>
                  <button
                    onClick={() => moveModule('down')}
                    className="module-btn clickable-button px-3 py-2"
                  >
                    <ArrowDown className="w-4 h-4" />
                    Move down
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] font-semibold text-blue-700">Module Editor</p>
                  <h2 className="text-2xl font-bold text-slate-900">Edit module content</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveDraft}
                    disabled={moduleSaving || detailModule.status === 'ARCHIVED'}
                    className="module-btn-primary clickable-button"
                  >
                    <Save className="w-4 h-4" />
                    {moduleSaving ? 'Saving…' : modules.some((module) => module.id === detailModule.id) ? 'Save changes' : 'Save draft'}
                  </button>
                  <button
                    onClick={deleteModule}
                    disabled={moduleSaving}
                    className="module-btn clickable-button border-rose-300 text-rose-700 hover:bg-rose-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Title</label>
                  <input
                    value={detailModule.title}
                    onChange={(event) => updateDraft({ title: event.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Hours</label>
                  <input
                    type="number"
                    value={detailModule.hours}
                    onChange={(event) => updateDraft({ hours: Number(event.target.value) || 0 })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
                  <textarea
                    value={detailModule.description}
                    onChange={(event) => updateDraft({ description: event.target.value })}
                    className="w-full min-h-28 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                {isComponentScoped && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">NSTP Component</label>
                    <select
                      value={detailModule.component && detailModule.component !== 'Common' ? detailModule.component : ''}
                      onChange={(event) => updateDraft({ component: (event.target.value || undefined) as NstpModule['component'] })}
                      disabled={allowedComponents.length === 0}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:bg-slate-100"
                    >
                      <option value="">Select a component…</option>
                      {allowedComponents.map((component) => (
                        <option key={component} value={component}>{component}</option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-slate-500">
                      {allowedComponents.length > 0
                        ? `Your ${coordinatorScope.label} program covers ${allowedComponents.join(' and ')}. The server confirms this scope on every save.`
                        : coordinatorScope.state.status === 'unavailable'
                          ? coordinatorScope.state.message
                          : 'Confirming your component program…'}
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Difficulty</label>
                  <select
                    value={detailModule.difficulty}
                    onChange={(event) => updateDraft({ difficulty: event.target.value as NstpModule['difficulty'] })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Video Link</label>
                  <input
                    value={detailModule.videoUrl || ''}
                    onChange={(event) => updateDraft({ videoUrl: event.target.value })}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Meeting Link</label>
                  <input
                    value={detailModule.meetingLink || ''}
                    onChange={(event) => updateDraft({ meetingLink: event.target.value })}
                    placeholder="https://meet.google.com/... or https://zoom.us/j/..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Document Link</label>
                  <input
                    value={detailModule.documentLink || ''}
                    onChange={(event) => updateDraft({ documentLink: event.target.value })}
                    placeholder="https://drive.google.com/... or .pdf / .docx URL"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                <div className="md:col-span-2 border-t border-slate-200 pt-4 mt-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 mb-3">Seminar / Speaker Info</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Speaker Name</label>
                  <input
                    value={detailModule.speaker || ''}
                    onChange={(event) => updateDraft({ speaker: event.target.value })}
                    placeholder="Dr. Reynold Garcia Bustillo"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Speaker Position</label>
                  <input
                    value={detailModule.speakerPosition || ''}
                    onChange={(event) => updateDraft({ speakerPosition: event.target.value })}
                    placeholder="NSTP Program Director"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Scheduled Date</label>
                  <input
                    type="date"
                    value={detailModule.scheduledDate || ''}
                    onChange={(event) => updateDraft({ scheduledDate: event.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Scheduled Time</label>
                  <input
                    value={detailModule.scheduledTime || ''}
                    onChange={(event) => updateDraft({ scheduledTime: event.target.value })}
                    placeholder="9:00 AM - 12:00 PM"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {!isAdmin && draftModules.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                {draftModules.length} module(s) are currently in draft and hidden by the administrator.
              </div>
            )}
            <div className="rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700">
                  {detailModule.component || 'Common'}
                </span>
                {detailModule.courseCode && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-cyan-200 bg-cyan-50 text-xs font-semibold text-cyan-700">
                    {detailModule.courseCode}
                  </span>
                )}
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold ${getDifficultyClass(detailModule.difficulty)}`}>
                  <Gauge className="w-3 h-3 mr-1" />
                  {detailModule.difficulty}
                </span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700">
                  <Sparkles className="w-3 h-3 mr-1" />
                  NSTP Learning Track
                </span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">{detailModule.title}</h1>
              <p className="text-slate-600 mb-4">{detailModule.description}</p>
              {(detailModule.speaker || detailModule.scheduledDate || detailModule.scheduledTime) && (
                <div className="mb-4 grid gap-2 rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-sm text-amber-950 sm:grid-cols-3">
                  {detailModule.speaker && <span><strong>Speaker:</strong> {detailModule.speaker}{detailModule.speakerPosition ? ` (${detailModule.speakerPosition})` : ''}</span>}
                  {detailModule.scheduledDate && <span><strong>Date:</strong> {detailModule.scheduledDate}</span>}
                  {detailModule.scheduledTime && <span><strong>Time:</strong> {detailModule.scheduledTime}</span>}
                </div>
              )}
              {(detailModule.schoolYear || detailModule.semester || detailModule.sourceDocument) && (
                <div className="mb-4 grid gap-2 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-950 sm:grid-cols-3">
                  <span><strong>School year:</strong> {detailModule.schoolYear || 'Unspecified'}</span>
                  <span><strong>Semester:</strong> {detailModule.semester || 'Unspecified'}</span>
                  <span><strong>Source:</strong> {detailModule.sourceDocument || 'System module'}</span>
                </div>
              )}
              {detailModule.outcomes && detailModule.outcomes.length > 0 && (
                <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">Official course outcomes</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {detailModule.outcomes.map((outcome) => (
                      <div key={outcome} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{outcome}</div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {detailModule.hours} hours
                  </span>
                  <span>{getModuleProgress(detailModule)}% complete</span>
                  <span>
                    {publishedAssessments.some((assessment) => assessment.moduleId === detailModule.id && assessment.type !== 'exam') ? 'Post-test available' : 'Post-test not published'}
                  </span>
                </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => previousModule && openModule(previousModule.id)}
                  disabled={!previousModule}
                  className="module-btn clickable-button py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Previous Module
                </button>
                <button
                  onClick={() => nextModule && openModule(nextModule.id)}
                  disabled={!nextModule}
                  className="module-btn clickable-button py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next Module
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {videoEmbedUrl && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <Video className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-slate-900">Module Video</h3>
                  </div>
                  <div className="aspect-video rounded-lg overflow-hidden mb-4 bg-slate-100">
                    <iframe
                      src={videoEmbedUrl}
                      className="w-full h-full"
                      sandbox="allow-scripts allow-same-origin allow-presentation"
                      referrerPolicy="no-referrer"
                      allow="autoplay; encrypted-media; picture-in-picture"
                      allowFullScreen
                      title={`${detailModule.title} video`}
                    />
                  </div>
                  <a
                    href={videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                    className="inline-flex items-center gap-2 text-sm text-blue-700 hover:text-blue-800 font-medium"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open external video
                  </a>
                </div>
              )}
              {meetingUrl && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <ExternalLink className="w-5 h-5 text-amber-600" />
                    <h3 className="font-semibold text-slate-900">Live Session</h3>
                  </div>
                  <p className="text-sm text-slate-600 mb-4">
                    Join the live session for this module through the meeting link below.
                  </p>
                  <a
                    href={meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-600 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Join External Meeting
                  </a>
                </div>
              )}
              {documentUrl && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <ExternalLink className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-slate-900">Reference Document</h3>
                  </div>
                  <p className="text-sm text-slate-600 mb-4">
                    Download or view the reference document for this module.
                  </p>
                  <a
                    href={documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open External Document
                  </a>
                </div>
              )}
              {!videoEmbedUrl && !meetingUrl && !documentUrl && (
                <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm text-center">
                  <p className="text-slate-500">No content added yet for this module.</p>
                </div>
              )}
            </div>

            {getModuleProgress(detailModule) < 100 && (
              <div className="flex justify-center">
                <button
                  onClick={() => toggleModuleComplete(detailModule.id)}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-yellow-500 px-8 py-4 text-sm font-semibold text-white shadow-sm hover:opacity-95 transition-opacity"
                >
                  <CheckCircle className="w-5 h-5" />
                  Mark Module as Complete
                </button>
              </div>
            )}
            {getModuleProgress(detailModule) === 100 && (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700 font-semibold">
                <CheckCircle className="w-5 h-5" />
                Module Completed
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
