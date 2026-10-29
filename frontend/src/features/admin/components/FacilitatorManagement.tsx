import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Building2, Download, Eye, EyeOff, Filter, KeyRound, LockKeyhole, Mail, MoreVertical, Pencil, Plus, Save, Search, Trash2, Users, X } from 'lucide-react';
import { BILIRAN_MUNICIPALITIES, BIPSU_PROGRAMS, INDUSTRIAL_TECHNOLOGY_MAJORS, INDUSTRIAL_TECHNOLOGY_PROGRAM, NstpAccount, NSTP_COMPONENTS, SECONDARY_EDUCATION_MAJORS, SECONDARY_EDUCATION_PROGRAM } from '../../../data/nstpData';
import { useAccounts, useStudents, useUpsertAccount, useDeleteAccount } from '../../../hooks/index';
import { toast } from 'sonner';

type Props = {
  admin: NstpAccount;
};

const emptyFacilitator = (): NstpAccount => ({
  id: `facilitator-${Math.random().toString(36).slice(2, 9)}`,
  name: '',
  email: '',
  password: '',
  role: 'facilitator',
  employeeNumber: `FAC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
  title: '',
  bio: '',
  municipalities: [],
  school: '',
  department: '',
  degreeProgram: '',
  major: '',
});

const initials = (name: string) => name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();

export default function FacilitatorManagement({ admin }: Props) {
  const { data: allAccounts = [] } = useAccounts();
  const { data: students = [] } = useStudents();
  const upsertAccountMutation = useUpsertAccount();
  const deleteAccountMutation = useDeleteAccount();

  const facilitators = useMemo(() => allAccounts.filter((account) => account.role === 'facilitator'), [allAccounts]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<NstpAccount | null>(null);
  const [query, setQuery] = useState('');
  const [municipalityFilter, setMunicipalityFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && facilitators.length > 0) {
      setSelectedId(facilitators[0]?.id ?? null);
    }
  }, [facilitators, selectedId]);

  useEffect(() => {
    if (editingId) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && editingId) {
        setEditingId(null);
        setForm(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [editingId]);

  const coveredMunicipalities = useMemo(() => new Set(facilitators.flatMap((facilitator) => facilitator.municipalities || [])).size, [facilitators]);
  const unassignedMunicipalities = Math.max(0, BILIRAN_MUNICIPALITIES.length - coveredMunicipalities);

  const assignedStudentsFor = (facilitator: NstpAccount) => students.filter((student) => {
    const studentMun = student.assignedMunicipality || student.municipality || '';
    return student.facilitatorId === facilitator.id || Boolean(studentMun && facilitator.municipalities?.includes(studentMun));
  });

  const filteredFacilitators = facilitators.filter((facilitator) => {
    const haystack = `${facilitator.name} ${facilitator.email} ${(facilitator.municipalities || []).join(' ')}`.toLowerCase();
    const matchesQuery = haystack.includes(query.toLowerCase());
    const matchesMunicipality = municipalityFilter === 'all' || facilitator.municipalities?.includes(municipalityFilter);
    return matchesQuery && matchesMunicipality;
  });

  const selectedFacilitator = facilitators.find((facilitator) => facilitator.id === selectedId) || filteredFacilitators[0] || facilitators[0] || null;
  const selectedStudents = selectedFacilitator ? assignedStudentsFor(selectedFacilitator) : [];

  const startNew = () => {
    setFormError(null);
    setEditingId('new');
    setForm(emptyFacilitator());
  };

  const startEdit = (facilitator: NstpAccount) => {
    setFormError(null);
    setEditingId(facilitator.id);
    setForm({ ...facilitator });
    setSelectedId(facilitator.id);
  };

  const removeFacilitator = async (facilitatorId: string) => {
    try {
      await deleteAccountMutation.mutateAsync(facilitatorId);
      toast.success('Facilitator removed.');
      if (selectedId === facilitatorId) {
        setSelectedId(null);
      }
    } catch {
      toast.error('Unable to remove facilitator.');
    }
  };

  const saveFacilitator = async () => {
    if (!form) return;
    const municipalities = form.municipalities || [];
    if (municipalities.length < 1 || municipalities.length > 3) {
      setFormError('Select between 1 and 3 municipalities for this facilitator.');
      return;
    }
    setFormError(null);
    const nextFacilitator = {
      ...form,
      role: 'facilitator' as const,
      municipalities,
    };
    try {
      await upsertAccountMutation.mutateAsync(nextFacilitator);
      setSelectedId(nextFacilitator.id);
      setEditingId(null);
      setForm(null);
      toast.success('Facilitator saved.');
    } catch (err: any) {
      setFormError(err?.message || 'Unable to save facilitator.');
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Facilitator Module</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">Facilitator Management</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Create and manage facilitator accounts. Assign department, courses, and municipalities.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:w-96">
            <Search className="h-4 w-4 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search facilitator name, email, or municipality..." className="w-full bg-transparent outline-none dark:text-slate-100" />
          </label>
          <select value={municipalityFilter} onChange={(event) => setMunicipalityFilter(event.target.value)} className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
            <option value="all">All municipalities</option>
            {BILIRAN_MUNICIPALITIES.map((municipality) => <option key={municipality} value={municipality}>{municipality}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Total Facilitators', value: facilitators.length, detail: `${facilitators.length} active`, icon: Users, tone: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200' },
          { label: 'Active Facilitators', value: facilitators.length, detail: 'All listed accounts active', icon: BadgeCheck, tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200' },
          { label: 'Municipalities Covered', value: coveredMunicipalities, detail: 'Assigned coverage', icon: Building2, tone: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-200' },
          { label: 'Unassigned Municipalities', value: unassignedMunicipalities, detail: 'Needs assignment', icon: Users, tone: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200' },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <article key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center gap-4">
                <span className={`grid h-14 w-14 place-items-center rounded-2xl ${stat.tone}`}><Icon className="h-6 w-6" /></span>
                <div>
                  <p className="text-2xl font-semibold text-slate-950 dark:text-white">{stat.value}</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{stat.label}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{stat.detail}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-3">
              <button onClick={startNew} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800">
                <Plus className="h-4 w-4" />
                Create Facilitator
              </button>
              <button className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-blue-50 dark:border-slate-800 dark:text-slate-100">
                <Filter className="h-4 w-4" />
                Bulk Actions
              </button>
            </div>
            <button className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-blue-50 dark:border-slate-800 dark:text-slate-100">
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" /></th>
                  <th className="px-4 py-3">Facilitator</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Courses Handled</th>
                  <th className="px-4 py-3">Municipalities</th>
                  <th className="px-4 py-3">Students</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFacilitators.map((facilitator, index) => {
                  const assignedStudents = assignedStudentsFor(facilitator);
                  const selected = selectedFacilitator?.id === facilitator.id;
                  return (
                    <tr key={facilitator.id} onClick={() => setSelectedId(facilitator.id)} className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50/60 dark:border-slate-800 dark:hover:bg-slate-900 ${selected ? 'bg-blue-50/70 dark:bg-blue-500/10' : ''}`}>
                      <td className="px-4 py-3"><input onClick={(event) => event.stopPropagation()} type="checkbox" className="h-4 w-4 rounded border-slate-300" /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="grid h-11 w-11 place-items-center rounded-full bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200">{initials(facilitator.name)}</span>
                          <div>
                            <p className="font-semibold text-slate-950 dark:text-white">{facilitator.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{facilitator.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-200">{facilitator.department || 'Unassigned'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-200">{facilitator.degreeProgram || 'None'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {(facilitator.municipalities || []).slice(0, 2).map((municipality) => <span key={municipality} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">{municipality}</span>)}
                          {(facilitator.municipalities || []).length > 2 && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">+{(facilitator.municipalities || []).length - 2}</span>}
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{facilitator.municipalities?.length || 0} municipalit{facilitator.municipalities?.length === 1 ? 'y' : 'ies'}</p>
                      </td>
                      <td className="px-4 py-3"><p className="font-semibold text-slate-900 dark:text-slate-100">{assignedStudents.length}</p><p className="text-xs text-slate-500 dark:text-slate-400">students</p></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={(event) => { event.stopPropagation(); startEdit(facilitator); }} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-700 hover:bg-blue-50 dark:border-slate-800 dark:text-slate-100"><Pencil className="h-4 w-4" /></button>
                          <button onClick={(event) => event.stopPropagation()} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-700 hover:bg-blue-50 dark:border-slate-800 dark:text-slate-100"><MoreVertical className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredFacilitators.length === 0 && <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">No facilitators match the current filters.</div>}
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
            <span>Showing 1 to {filteredFacilitators.length} of {facilitators.length} facilitators</span>
            <div className="flex gap-2"><button className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-400 dark:border-slate-800">‹</button><button className="grid h-9 w-9 place-items-center rounded-xl bg-blue-700 text-white">1</button><button className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-200">2</button><button className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-400 dark:border-slate-800">›</button></div>
          </div>
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-5 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Facilitator Details</p>
            <button onClick={() => setSelectedId(null)} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300"><X className="h-4 w-4" /></button>
          </div>
          {selectedFacilitator ? (
              <div className="space-y-5">
                <div className="text-center">
                  <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-indigo-50 text-2xl font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200">{initials(selectedFacilitator.name)}</span>
                  <h3 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">{selectedFacilitator.name}</h3>
                  <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">Active</span>
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{selectedFacilitator.email}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Facilitator since May 15, 2023</p>
                </div>
                <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:border-slate-800 dark:text-blue-200"><LockKeyhole className="h-4 w-4" /> Reset Password</button>
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Department</p>
                  <span className="rounded-full bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-200">{selectedFacilitator.department || 'Not assigned'}</span>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Degree Program</p>
                  <span className="rounded-full bg-cyan-50 px-3 py-1.5 text-sm font-semibold text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-200">{selectedFacilitator.degreeProgram || 'Not assigned'}</span>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Assigned Municipalities ({selectedFacilitator.municipalities?.length || 0})</p>
                  <div className="space-y-2">
                    {(selectedFacilitator.municipalities || []).map((municipality) => (
                      <div key={municipality} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
                        <span className="font-medium text-slate-900 dark:text-white">{municipality}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{students.filter((student) => student.municipality === municipality).length} students</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Load Summary</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Total Students</span><span className="font-semibold text-slate-900 dark:text-white">{selectedStudents.length}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Municipalities</span><span className="font-semibold text-slate-900 dark:text-white">{selectedFacilitator.municipalities?.length || 0}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Average per Municipality</span><span className="font-semibold text-slate-900 dark:text-white">{Math.round(selectedStudents.length / Math.max(1, selectedFacilitator.municipalities?.length || 1))}</span></div>
                  </div>
                  <span className="mt-4 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">Balanced Load</span>
                </div>
              </div>
          ) : <p className="text-sm text-slate-500 dark:text-slate-400">Select a facilitator to view details.</p>}
        </aside>
      </div>

      {editingId && form && (
        <div className="fixed inset-0 z-50 grid items-start justify-center overflow-y-auto bg-slate-950/50 px-4 pb-10 pt-10 md:pt-16">
          <div className="max-h-[90dvh] w-full max-w-4xl overflow-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-6 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">{editingId === 'new' ? 'Create Account' : 'Edit Account'}</p>
                <h3 className="text-2xl font-semibold text-slate-950 dark:text-white">{editingId === 'new' ? 'Create Facilitator' : 'Edit Facilitator'}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Define login credentials, department, courses handled, and municipality coverage.</p>
              </div>
              <button onClick={() => { setEditingId(null); setForm(null); }} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="flex items-center gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">Name <span className="text-rose-600 dark:text-rose-300">*</span></span>
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Enter your name" className="w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </label>
              <label className="block space-y-1.5">
                <span className="flex items-center gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">Email <span className="text-rose-600 dark:text-rose-300">*</span></span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="Enter your email" className="w-full rounded-xl border border-blue-200 bg-white px-4 py-3 pl-9 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="flex items-center gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">Password <span className="text-rose-600 dark:text-rose-300">*</span></span>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Enter your password" className="w-full rounded-xl border border-blue-200 bg-white px-4 py-3 pl-9 pr-12 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <button type="button" onClick={() => setShowPassword((prev) => !prev)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" tabIndex={-1}>
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="flex items-center gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">Employee Number <span className="text-rose-600 dark:text-rose-300">*</span></span>
                <div className="relative">
                  <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={form.employeeNumber || ''} onChange={(event) => setForm({ ...form, employeeNumber: event.target.value })} placeholder="FAC-001" className="w-full rounded-xl border border-blue-200 bg-white px-4 py-3 pl-9 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="flex items-center gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">NSTP Component <span className="text-rose-600 dark:text-rose-300">*</span></span>
                <select value={form.title || ''} onChange={(event) => setForm({ ...form, title: event.target.value })} className="w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  <option value="">Select component</option>
                  {NSTP_COMPONENTS.map((component) => <option key={component} value={component}>{component}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="flex items-center gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">School / College / Department <span className="text-rose-600 dark:text-rose-300">*</span></span>
                <select value={form.department || ''} onChange={(event) => { setForm({ ...form, school: event.target.value, department: event.target.value, degreeProgram: '', major: '' }); }} className="w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-950">
                  <option value="">Select your school</option>
                  {BIPSU_PROGRAMS.map((entry) => <option key={entry.school} value={entry.school}>{entry.school}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="flex items-center gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">Degree Program <span className="text-rose-600 dark:text-rose-300">*</span></span>
                <select value={form.degreeProgram || ''} onChange={(event) => { const value = event.target.value; setForm({ ...form, degreeProgram: value, ...(value !== INDUSTRIAL_TECHNOLOGY_PROGRAM && value !== SECONDARY_EDUCATION_PROGRAM ? { major: '' } : {}) }); }} disabled={!form.department} className="w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-950">
                  <option value="">{form.department ? 'Select your degree program' : 'Select a school first'}</option>
                  {form.department && (BIPSU_PROGRAMS.find((s) => s.school === form.department)?.programs || []).map((prog) => <option key={prog} value={prog}>{prog}</option>)}
                </select>
              </label>
              {(form.degreeProgram === INDUSTRIAL_TECHNOLOGY_PROGRAM || form.degreeProgram === SECONDARY_EDUCATION_PROGRAM) && (
              <label className="block space-y-1.5">
                <span className="flex items-center gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">Major <span className="text-rose-600 dark:text-rose-300">*</span></span>
                <select value={form.major || ''} onChange={(event) => setForm({ ...form, major: event.target.value })} className="w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  <option value="">Select major</option>
                  {(form.degreeProgram === INDUSTRIAL_TECHNOLOGY_PROGRAM ? INDUSTRIAL_TECHNOLOGY_MAJORS : SECONDARY_EDUCATION_MAJORS).map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              )}
              <label className="block space-y-1.5 md:col-span-2">
                <span className="flex items-center gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">Bio</span>
                <textarea value={form.bio || ''} onChange={(event) => setForm({ ...form, bio: event.target.value })} rows={2} placeholder="Enter a short bio (optional)" className="w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </label>
              <div className="space-y-1.5 md:col-span-2">
                <span className="flex items-center gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">Assigned Municipalities (select 1–3) <span className="text-rose-600 dark:text-rose-300">*</span></span>
                <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                  {BILIRAN_MUNICIPALITIES.map((item) => {
                    const selected = form.municipalities?.includes(item) || false;
                    const unavailable = !selected && (form.municipalities?.length || 0) >= 3;
                    return (
                      <label key={item} className={`inline-flex items-center gap-2 px-1 py-1 text-sm font-semibold ${unavailable ? 'cursor-not-allowed text-slate-400 dark:text-slate-600' : 'cursor-pointer'} ${selected ? 'text-blue-800 dark:text-blue-200' : 'text-slate-600 dark:text-slate-300'}`}>
                        <input type="checkbox" checked={selected} onChange={(event) => {
                          const current = form.municipalities || [];
                          setForm({ ...form, municipalities: event.target.checked ? [...current, item] : current.filter((municipality) => municipality !== item) });
                        }} disabled={unavailable} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-0 focus:outline-none" />
                        {item}
                      </label>
                    );
                  })}
                </div>
                {formError && <p className="mt-2 text-sm font-medium text-rose-600 dark:text-rose-300">{formError}</p>}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              {editingId !== 'new' && <button onClick={() => form && removeFacilitator(form.id)} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-5 py-3 font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-200"><Trash2 className="h-4 w-4" /> Delete</button>}
              <button onClick={() => { setEditingId(null); setForm(null); }} className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200">Cancel</button>
              <button onClick={saveFacilitator} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800"><Save className="h-4 w-4" /> Save Facilitator</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
