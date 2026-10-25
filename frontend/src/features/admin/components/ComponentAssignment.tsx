import { useState, useEffect } from 'react';
import { Users, TrendingUp, Award, Settings, CheckCircle, AlertCircle, ArrowRight, RefreshCw, Pencil } from 'lucide-react';
import {
  COMPONENT_APPLICATION_STATE_KEY,
  DEFAULT_COMPONENT_APPLICATION_STATE,
  NSTP_COMPONENTS,
  CANONICAL_COMPONENTS,
  COMPONENT_DISPLAY_NAMES,
  loadComponentApplicationState,
  loadQualifyingExamResults,
  saveComponentApplicationState,
  saveQualifyingExamResults,
  syncStudentAccessFromQualifyingResults,
  toCanonicalComponentType,
  CanonicalComponentType,
  NstpComponent,
  QualifyingExamResult,
} from '../../../data/nstpData';

const COMPONENTS = NSTP_COMPONENTS;

export default function ComponentAssignment() {
  const [examResults, setExamResults] = useState<any[]>([]);
  const [slotLimits, setSlotLimits] = useState<Record<CanonicalComponentType, number>>(DEFAULT_COMPONENT_APPLICATION_STATE.slotLimits);
  const [assignments, setAssignments] = useState<Record<string, any>>({});
  const [selectedComponent, setSelectedComponent] = useState('all');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [qualifyingScore, setQualifyingScore] = useState(70);
  const [applicationClosed, setApplicationClosed] = useState(false);
  const [editingApplicantId, setEditingApplicantId] = useState<string | null>(null);
  const [manualComponent, setManualComponent] = useState('none');
  const [manualStatus, setManualStatus] = useState<'manual-approved' | 'waitlisted'>('manual-approved');

  useEffect(() => {
    const savedState = loadComponentApplicationState();
    setSlotLimits(savedState.slotLimits);
    setQualifyingScore(savedState.qualifyingScore);
    setApplicationClosed(savedState.applicationClosed);

    loadResults();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'qualifyingExamResults') {
        loadResults();
      }
    };

    window.addEventListener('storage', handleStorage);

    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    saveComponentApplicationState({
      slotLimits,
      qualifyingScore,
      applicationClosed,
      updatedAt: new Date().toISOString(),
    });
  }, [slotLimits, qualifyingScore, applicationClosed]);

  const loadResults = () => {
    const results = loadQualifyingExamResults();
    setExamResults(results);
    const hydratedAssignments = results.reduce((acc: Record<string, any>, result: any) => {
      if (result.assignedComponent || result.status) {
        acc[result.userId] = {
          ...result,
          assignedComponent: result.assignedComponent || null,
          status: result.status || (result.assignedComponent ? 'assigned-preferred' : 'waitlisted'),
          adminOverride: Boolean(result.adminOverride),
        };
      }
      return acc;
    }, {});
    setAssignments(hydratedAssignments);
    setLastUpdated(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  };

  const refreshResults = () => {
    loadResults();
  };

  const handleSlotChange = (component: string, value: string) => {
    const canonical = toCanonicalComponentType(component);
    if (!canonical) return;
    setSlotLimits(prev => ({
      ...prev,
      [canonical]: Math.max(0, parseInt(value, 10) || 0)
    }));
  };

  const assignComponents = (options?: { forceClosed?: boolean }) => {
    const latestResults = loadQualifyingExamResults();
    setExamResults(latestResults);
    const shouldFillRemaining = options?.forceClosed ?? applicationClosed;

    if (latestResults.length === 0) {
      setAssignments({});
      return;
    }

    // Sort all students by score (highest first)
    const sortedResults = [...latestResults].sort((a: any, b: any) => b.score - a.score);
    const manualOverrides = sortedResults.filter((result: any) => result.adminOverride);
    const qualifiedResults = sortedResults.filter((result: any) => result.score >= qualifyingScore && !result.adminOverride);
    const nonQualifiedResults = sortedResults.filter((result: any) => result.score < qualifyingScore && !result.adminOverride);

    // Track slots filled per canonical component
    const slotsUsed: Record<CanonicalComponentType, number> = {
      CWTS: 0,
      CWTS_COAST_GUARD: 0,
      LTS: 0,
      MTS_ARMY: 0,
      MTS_NAVY: 0
    };

    const newAssignments: Record<string, any> = {};
    const unassignedQualified: any[] = [];
    const unassignedNonQualified: any[] = [];

    const tryAssign = (result: any, component: string | null, status: string) => {
      if (!component) return false;
      const canonical = toCanonicalComponentType(component);
      if (!canonical) return false;
      if (slotsUsed[canonical] >= (slotLimits[canonical] || 0)) return false;

      newAssignments[result.userId] = {
        ...result,
        assignedComponent: component,
        rank: slotsUsed[canonical] + 1,
        status,
      };
      slotsUsed[canonical]++;
      return true;
    };

    manualOverrides.forEach((result: any) => {
      const manualComponentSelection = result.assignedComponent || null;
      const canonicalManual = manualComponentSelection ? toCanonicalComponentType(manualComponentSelection) : null;
      if (manualComponentSelection && canonicalManual && result.status !== 'waitlisted') {
        newAssignments[result.userId] = {
          ...result,
          assignedComponent: manualComponentSelection,
          rank: slotsUsed[canonicalManual] + 1,
          status: result.status || 'manual-approved',
        };
        slotsUsed[canonicalManual]++;
      } else {
        newAssignments[result.userId] = {
          ...result,
          assignedComponent: null,
          status: 'waitlisted',
        };
      }
    });

    // First pass: qualified students get preferred component if capacity is available
    qualifiedResults.forEach((result: any) => {
      const preferred = result.preferredComponent;
      const canonical = toCanonicalComponentType(preferred);

      if (canonical && slotsUsed[canonical] < (slotLimits[canonical] || 0)) {
        newAssignments[result.userId] = {
          ...result,
          assignedComponent: preferred,
          rank: slotsUsed[canonical] + 1,
          status: 'assigned-preferred'
        };
        slotsUsed[canonical]++;
      } else {
        unassignedQualified.push(result);
      }
    });

    // Second pass: remaining qualified students are reassigned to any component with vacancy
    unassignedQualified.forEach((result: any) => {
      const availableComponent = COMPONENTS.find(comp => {
        const canonical = toCanonicalComponentType(comp);
        return canonical ? slotsUsed[canonical] < (slotLimits[canonical] || 0) : false;
      });

      if (availableComponent) {
        const canonicalAvail = toCanonicalComponentType(availableComponent)!;
        newAssignments[result.userId] = {
          ...result,
          assignedComponent: availableComponent,
          rank: slotsUsed[canonicalAvail] + 1,
          status: 'assigned-alternative'
        };
        slotsUsed[canonicalAvail]++;
      } else {
        newAssignments[result.userId] = {
          ...result,
          assignedComponent: null,
          status: 'waitlisted'
        };
      }
    });

    nonQualifiedResults.forEach((result: any) => {
      if (shouldFillRemaining) {
        if (!tryAssign(result, result.preferredComponent, 'filled-preferred')) {
          unassignedNonQualified.push(result);
        }
        return;
      }

      newAssignments[result.userId] = {
        ...result,
        assignedComponent: null,
        status: 'not-qualified',
      };
    });

    if (shouldFillRemaining) {
      unassignedNonQualified.forEach((result: any) => {
        const availableComponent = COMPONENTS.find(comp => {
          const canonical = toCanonicalComponentType(comp);
          return canonical ? slotsUsed[canonical] < (slotLimits[canonical] || 0) : false;
        });

        if (availableComponent) {
          const canonicalAvail = toCanonicalComponentType(availableComponent)!;
          newAssignments[result.userId] = {
            ...result,
            assignedComponent: availableComponent,
            rank: slotsUsed[canonicalAvail] + 1,
            status: availableComponent === result.preferredComponent ? 'filled-preferred' : 'filled-alternative',
          };
          slotsUsed[canonicalAvail]++;
        } else {
          newAssignments[result.userId] = {
            ...result,
            assignedComponent: null,
            status: 'waitlisted',
          };
        }
      });
    }

    setAssignments(newAssignments);

    // Save assignments back to localStorage
    const updatedResults = latestResults.map((result: QualifyingExamResult) => ({
      ...result,
      assignedComponent: newAssignments[result.userId]?.assignedComponent,
      rank: newAssignments[result.userId]?.rank,
      status: newAssignments[result.userId]?.status,
    }));
    saveQualifyingExamResults(updatedResults);
    syncStudentAccessFromQualifyingResults(updatedResults);
    setLastUpdated(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  };

  const closeApplicationsAndFillSlots = () => {
    const shouldClose = window.confirm('Close application period and auto-fill remaining slots with non-qualified applicants?');
    if (!shouldClose) return;

    setApplicationClosed(true);
    assignComponents({ forceClosed: true });
  };

  const reopenApplications = () => {
    setApplicationClosed(false);
  };

  const startApplicantEdit = (result: any) => {
    const current = assignments[result.userId];
    setEditingApplicantId(result.userId);
    setManualComponent(current?.assignedComponent || 'none');
    setManualStatus(current?.assignedComponent ? 'manual-approved' : 'waitlisted');
  };

  const saveApplicantOverride = (result: any) => {
    const allResults = loadQualifyingExamResults();
    const updatedResults = allResults.map((row: any) => {
      if (row.userId !== result.userId) return row;

      return {
        ...row,
        assignedComponent: manualComponent === 'none' ? null : manualComponent,
        status: manualComponent === 'none' || manualStatus === 'waitlisted' ? 'waitlisted' : 'manual-approved',
        adminOverride: true,
      };
    });

    saveQualifyingExamResults(updatedResults);
    setEditingApplicantId(null);
    assignComponents();
  };

  const clearApplicantOverride = (result: any) => {
    const allResults = loadQualifyingExamResults();
    const updatedResults = allResults.map((row: any) => {
      if (row.userId !== result.userId) return row;
      const { adminOverride, ...rest } = row;
      return {
        ...rest,
        status: undefined,
        assignedComponent: null,
        rank: undefined,
      };
    });

    saveQualifyingExamResults(updatedResults);
    setEditingApplicantId(null);
    assignComponents();
  };

  const getComponentStats = (component: string) => {
    const canonical = toCanonicalComponentType(component);
    const preferred = examResults.filter((r: any) => toCanonicalComponentType(r.preferredComponent) === canonical);
    const assigned = Object.values(assignments).filter((a: any) => toCanonicalComponentType(a.assignedComponent) === canonical);
    const limit = canonical ? (slotLimits[canonical] ?? 0) : 0;

    return {
      preferred: preferred.length,
      assigned: assigned.length,
      limit,
      available: Math.max(0, limit - assigned.length),
      avgScore: assigned.length > 0
        ? Math.round((assigned as any[]).reduce((sum: number, a: any) => sum + a.score, 0) / assigned.length)
        : 0
    };
  };

  const filteredResults = selectedComponent === 'all'
    ? examResults
    : examResults.filter((r: any) => r.preferredComponent === selectedComponent);

  const sortedFiltered = [...filteredResults].sort((a: any, b: any) => b.score - a.score);
  const totalSlots = CANONICAL_COMPONENTS.reduce((sum, canonical) => sum + (slotLimits[canonical] || 0), 0);
  const assignedCount = Object.values(assignments).filter((assignment: any) => assignment.assignedComponent).length;
  const qualifiedCount = examResults.filter((result: any) => result.score >= qualifyingScore).length;
  const waitlistedCount = Object.values(assignments).filter((assignment: any) => assignment.status === 'waitlisted' || !assignment.assignedComponent).length;
  const assignmentHealth = [
    { label: 'Assigned', value: assignedCount, color: 'bg-blue-700' },
    { label: 'Qualified', value: qualifiedCount, color: 'bg-emerald-500' },
    { label: 'Waitlisted', value: waitlistedCount, color: 'bg-amber-500' },
    { label: 'Open Slots', value: Math.max(0, totalSlots - assignedCount), color: 'bg-cyan-500' },
  ];

  return (
    <div className="size-full bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.08)_0%,_rgba(14,165,233,0.08)_28%,_#f4f8fd_68%)] text-slate-900 dark:bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.18)_0%,_rgba(14,165,233,0.12)_28%,_#08101f_68%)] dark:text-slate-100">
      <div className="mx-auto max-w-none p-4 md:p-6">
        <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Component Assignment & Ranking</h2>
            <p className="text-sm text-slate-600 mt-1 dark:text-slate-300">
              Latest sync: {lastUpdated || 'waiting for results'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={refreshResults}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 hover:-translate-y-0.5 transition-all shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={() => assignComponents()}
              className="bg-blue-700 text-white px-6 py-3 rounded-xl hover:bg-blue-800 hover:-translate-y-0.5 transition-all font-medium flex items-center gap-2 shadow-sm shadow-blue-900/20 cursor-pointer"
            >
              <CheckCircle className="w-5 h-5" />
              Assign Components
            </button>
            {!applicationClosed ? (
              <button
                onClick={() => closeApplicationsAndFillSlots()}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-emerald-300 bg-emerald-50 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 hover:-translate-y-0.5 transition-all dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100 dark:hover:bg-emerald-500/20 cursor-pointer"
              >
                Close Application and Fill Slots
              </button>
            ) : (
              <button
                onClick={reopenApplications}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:-translate-y-0.5 transition-all dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Reopen Application
              </button>
            )}
          </div>
        </div>

        {examResults.length === 0 && (
          <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50/80 p-5 text-blue-900 shadow-sm dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-100">
            No qualifying exam results are available yet. Refresh after students submit their exams.
          </div>
        )}

        {/* Slot Configuration */}
        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Assignment Controls</h3>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-300">Qualifying Score</label>
              <input
                type="number"
                min="0"
                max="100"
                value={qualifyingScore}
                onChange={(e) => setQualifyingScore(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
            {CANONICAL_COMPONENTS.map(canonical => (
              <div key={canonical}>
                <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-300">
                  {COMPONENT_DISPLAY_NAMES[canonical]}
                </label>
                <input
                  type="number"
                  value={slotLimits[canonical] ?? 0}
                  onChange={(e) => handleSlotChange(canonical, e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                  min="0"
                />
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
            Application status: <strong>{applicationClosed ? 'Closed (auto-fill enabled)' : 'Open (qualified ranking only)'}</strong>
          </div>
        </div>

        {/* Component Statistics */}
        <div className="mb-5 grid gap-4 2xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {COMPONENTS.map((component: string) => {
              const stats = getComponentStats(component);
              return (
                <div key={component} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  <h3 className="mb-3 font-semibold text-slate-900 dark:text-slate-100">{component}</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-300">Preferred:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{stats.preferred}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-300">Assigned:</span>
                      <span className="font-semibold text-blue-700 dark:text-blue-300">{stats.assigned}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-300">Limit:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{stats.limit}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-300">Available:</span>
                      <span className={`font-semibold ${stats.available > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {stats.available}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
                      <span className="text-slate-600 dark:text-slate-300">Avg Score:</span>
                      <span className="font-semibold text-purple-600 dark:text-purple-300">{stats.avgScore}%</span>
                    </div>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-100 dark:bg-slate-700">
                    <div
                      className={`h-2 rounded-full ${stats.assigned > stats.limit ? 'bg-red-600' : 'bg-gradient-to-r from-blue-700 to-cyan-500'}`}
                      style={{ width: `${Math.min(stats.limit ? (stats.assigned / stats.limit) * 100 : 0, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <aside className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-1">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Assignment Health</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Capacity and ranking status.</p>
                </div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">{assignedCount}/{totalSlots}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
                {assignmentHealth.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{item.label}</p>
                      <p className="text-lg font-semibold text-slate-950 dark:text-white">{item.value}</p>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <div className={`h-full rounded-full ${item.color}`} style={{ width: `${Math.min(100, totalSlots ? (item.value / totalSlots) * 100 : 0)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Component Slot Mix</h3>
              <div className="mt-4 space-y-3">
                {COMPONENTS.map((component) => {
                  const stats = getComponentStats(component);
                  const width = Math.min(100, stats.limit ? (stats.assigned / stats.limit) * 100 : 0);
                  return (
                    <div key={component}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700 dark:text-slate-200">{component}</span>
                        <span className="text-slate-500 dark:text-slate-400">{stats.assigned}/{stats.limit}</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-full rounded-full bg-gradient-to-r from-blue-700 to-cyan-500" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </aside>
        </div>

        <div className="hidden">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">Assignment Health</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Capacity and ranking status across all components.</p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">{assignedCount}/{totalSlots} used</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              {assignmentHealth.map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">{item.value}</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div className={`h-full rounded-full ${item.color}`} style={{ width: `${Math.min(100, totalSlots ? (item.value / totalSlots) * 100 : 0)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Component Slot Mix</h3>
            <div className="mt-4 space-y-3">
              {COMPONENTS.map((component) => {
                const stats = getComponentStats(component);
                const width = Math.min(100, stats.limit ? (stats.assigned / stats.limit) * 100 : 0);
                return (
                  <div key={component}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{component}</span>
                      <span className="text-slate-500 dark:text-slate-400">{stats.assigned}/{stats.limit}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-700 to-cyan-500" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Student Rankings */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm transition-all hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Student Rankings & Assignments</h3>
            <select
              value={selectedComponent}
              onChange={(e) => setSelectedComponent(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="all">All Components</option>
              {COMPONENTS.map((comp: string) => (
                <option key={comp} value={comp}>{comp}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Rank</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Student</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Score</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Preferred</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Assigned</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Admin Edit</th>
                </tr>
              </thead>
              <tbody>
                {sortedFiltered.map((result: any, idx: number) => {
                  const assignment = (assignments as Record<string, any>)[result.userId];
                  const canonicalPref = toCanonicalComponentType(result.preferredComponent);
                  const isPriority = canonicalPref ? idx < (slotLimits[canonicalPref] ?? 0) : false;

                  return (
                    <tr key={result.userId} className="border-b border-slate-100 hover:bg-blue-50/70 transition-colors dark:border-slate-800 dark:hover:bg-slate-800/40">
                      <td className="py-4 px-4">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">#{idx + 1}</span>
                      </td>
                      <td className="py-4 px-4">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-slate-100">{result.userName}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-300">{result.userEmail}</p>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <Award className="w-4 h-4 text-purple-600" />
                          <span className="font-semibold text-slate-900 dark:text-slate-100">{result.score}%</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="inline-flex px-3 py-1 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium dark:bg-blue-500/15 dark:text-blue-100">
                          {result.preferredComponent}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        {assignment?.assignedComponent ? (
                          <div className="flex items-center gap-2">
                            {assignment.assignedComponent !== result.preferredComponent && (
                              <ArrowRight className="w-4 h-4 text-blue-600 dark:text-blue-300" />
                            )}
                            <span className={`inline-flex px-3 py-1 rounded-lg text-sm font-medium ${
                              assignment.assignedComponent === result.preferredComponent
                                ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-100'
                                : 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-100'
                            }`}>
                              {assignment.assignedComponent}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400 dark:text-slate-500">Not assigned</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        {assignment ? (
                          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium ${
                            assignment.status === 'assigned-preferred'
                              ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-100'
                              : assignment.status === 'assigned-alternative'
                              ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-100'
                            : assignment.status === 'manual-approved'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-100'
                            : assignment.status === 'not-qualified'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-100'
                            : assignment.status === 'filled-preferred' || assignment.status === 'filled-alternative'
                              ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-100'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                          }`}>
                            {assignment.status === 'assigned-preferred' && <CheckCircle className="w-4 h-4" />}
                            {assignment.status === 'assigned-alternative' && <AlertCircle className="w-4 h-4" />}
                            {assignment.status === 'manual-approved' && <Pencil className="w-4 h-4" />}
                            {assignment.status === 'assigned-preferred' ? 'Preferred' :
                             assignment.status === 'assigned-alternative' ? 'Reassigned' :
                             assignment.status === 'manual-approved' ? 'Manual Override' :
                             assignment.status === 'not-qualified' ? 'Not Qualified' :
                             assignment.status === 'filled-preferred' ? 'Filled Slot (Preferred)' :
                             assignment.status === 'filled-alternative' ? 'Filled Slot (Alternative)' :
                             'Waitlisted'}
                          </span>
                        ) : isPriority ? (
                          <span className="text-sm text-green-600 font-medium dark:text-green-300">Priority</span>
                        ) : (
                          <span className="text-sm text-slate-500 dark:text-slate-400">Pending</span>
                        )}
                      </td>
                      <td className="py-4 px-4 align-top">
                        {editingApplicantId === result.userId ? (
                          <div className="space-y-2 min-w-52">
                            <select
                              value={manualComponent}
                              onChange={(e) => setManualComponent(e.target.value)}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            >
                              <option value="none">No component (waitlist)</option>
                              {COMPONENTS.map((comp: string) => (
                                <option key={comp} value={comp}>{comp}</option>
                              ))}
                            </select>
                            <select
                              value={manualStatus}
                              onChange={(e) => setManualStatus(e.target.value as 'manual-approved' | 'waitlisted')}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            >
                              <option value="manual-approved">Manual approve</option>
                              <option value="waitlisted">Waitlist</option>
                            </select>
                            <div className="flex gap-2">
                              <button
                                onClick={() => saveApplicantOverride(result)}
                                className="px-3 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingApplicantId(null)}
                                className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => clearApplicantOverride(result)}
                                className="px-3 py-2 rounded-lg border border-rose-300 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => startApplicantEdit(result)}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit Applicant
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {sortedFiltered.length === 0 && (
            <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
              No results match the selected component filter yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
