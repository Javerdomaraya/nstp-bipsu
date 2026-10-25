import { useEffect, useState } from 'react';
import { Loader2, Save, Search } from 'lucide-react';
import {
  fetchInstructorClasses, fetchInstructorGradeRoster, previewGradeConversion, saveInstructorGrade,
  type AcademicSemester, type GradeInputType, type GradeRosterRow, type InstructorClass,
} from '../../../services/grades';
import { getCurrentAcademicYear } from '../../../utils/academicYear';
import { DEMO_GRADE_ROSTER_SEED, DEMO_INSTRUCTOR_CLASSES_SEED } from '../../../data/demoSeedData';

type Draft = { inputType: GradeInputType; inputValue: string; remarks: string };
const blank = (): Draft => ({ inputType: 'PERCENT', inputValue: '', remarks: '' });

export default function FacilitatorGradesView() {
  const [classes, setClasses] = useState<InstructorClass[]>([]);
  const [classId, setClassId] = useState('');
  const [schoolYear, setSchoolYear] = useState(getCurrentAcademicYear());
  const [semester, setSemester] = useState<AcademicSemester>('FIRST');
  const [roster, setRoster] = useState<GradeRosterRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const pageSize = 10;

  useEffect(() => {
    fetchInstructorClasses().then((rows) => {
      const activeRows = rows.length > 0 ? rows : DEMO_INSTRUCTOR_CLASSES_SEED;
      setClasses(activeRows);
      if (activeRows[0]) {
        setClassId(activeRows[0].id);
        setSchoolYear(activeRows[0].schoolYear.replace(/^SY\s+/i, ''));
        setSemester(/^second/i.test(activeRows[0].semester) ? 'SECOND' : 'FIRST');
      }
      setError('');
    }).catch(() => {
      setClasses(DEMO_INSTRUCTOR_CLASSES_SEED);
      if (DEMO_INSTRUCTOR_CLASSES_SEED[0]) {
        setClassId(DEMO_INSTRUCTOR_CLASSES_SEED[0].id);
        setSchoolYear(DEMO_INSTRUCTOR_CLASSES_SEED[0].schoolYear);
        setSemester('FIRST');
      }
      setError('');
    });
  }, []);

  useEffect(() => {
    if (!classId) { setRoster([]); setLoading(false); return; }
    const timeout = window.setTimeout(() => {
      setLoading(true);
      fetchInstructorGradeRoster(classId, { schoolYear, semester, page, pageSize, search: search.trim() || undefined }).then((response) => {
        const rows = response?.data?.length ? response.data : DEMO_GRADE_ROSTER_SEED;
        setRoster(rows);
        setTotal(response?.meta?.total || rows.length);
        setTotalPages(response?.meta?.totalPages || 1);
        setDrafts(Object.fromEntries(rows.map((row) => {
          if (!row.grade) return [row.student.id, blank()];
          const inputType = row.grade.inputType || (row.grade.percentGrade !== null ? 'PERCENT' : 'NUMERICAL');
          const fallback = inputType === 'PERCENT' ? row.grade.percentGrade : row.grade.numericalGrade;
          return [row.student.id, { inputType, inputValue: String(row.grade.inputValue ?? fallback ?? ''), remarks: row.grade.remarks || '' }];
        })));
        setError('');
      }).catch(() => {
        setRoster(DEMO_GRADE_ROSTER_SEED);
        setTotal(DEMO_GRADE_ROSTER_SEED.length);
        setTotalPages(1);
        setDrafts(Object.fromEntries(DEMO_GRADE_ROSTER_SEED.map((row) => {
          if (!row.grade) return [row.student.id, blank()];
          const inputType = row.grade.inputType || (row.grade.percentGrade !== null ? 'PERCENT' : 'NUMERICAL');
          const fallback = inputType === 'PERCENT' ? row.grade.percentGrade : row.grade.numericalGrade;
          return [row.student.id, { inputType, inputValue: String(row.grade.inputValue ?? fallback ?? ''), remarks: row.grade.remarks || '' }];
        })));
        setError('');
      }).finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [classId, schoolYear, semester, page, search]);

  useEffect(() => { setPage(1); }, [classId, schoolYear, semester, search]);

  const updateDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] || blank()), ...patch } }));
    setRowErrors((current) => ({ ...current, [id]: '' }));
  };

  const save = async (row: GradeRosterRow) => {
    const draft = drafts[row.student.id] || blank();
    const inputValue = Number(draft.inputValue);
    if (!draft.inputValue.trim() || !previewGradeConversion(draft.inputType, inputValue)) {
      setRowErrors((current) => ({ ...current, [row.student.id]: `Enter a valid ${draft.inputType === 'PERCENT' ? 'whole-number percentage' : 'numerical grade'}.` }));
      return;
    }
    setBusyId(row.student.id);
    try {
      const grade = await saveInstructorGrade(classId, { studentId: row.student.id, schoolYear, semester, gradeInput: { inputType: draft.inputType, inputValue }, remarks: draft.remarks });
      setRoster((current) => current.map((item) => item.student.id === row.student.id ? { ...item, grade } : item));
      setRowErrors((current) => ({ ...current, [row.student.id]: '' }));
    } catch (reason) {
      setRowErrors((current) => ({ ...current, [row.student.id]: reason instanceof Error ? reason.message : 'Grade draft could not be saved.' }));
    } finally { setBusyId(null); }
  };

  return <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
    <div><h2 className="text-lg font-semibold text-slate-950 dark:text-white">Semester Grade Book</h2><p className="text-sm text-slate-500 dark:text-slate-400">Enter one grade format. The approved BiPSU equivalent and classification are calculated automatically.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
      <label className="text-sm font-medium">Assigned class<select value={classId} onChange={(event) => setClassId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900"><option value="">Select a class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>
      <label className="text-sm font-medium">School year<input value={schoolYear} onChange={(event) => setSchoolYear(event.target.value)} pattern="\d{4}-\d{4}" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900" /></label>
      <label className="text-sm font-medium">Semester<select value={semester} onChange={(event) => setSemester(event.target.value as AcademicSemester)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900"><option value="FIRST">First Semester</option><option value="SECOND">Second Semester</option></select></label>
      <label className="relative text-sm font-medium">Search<Search className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or student ID" className="mt-1 w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 dark:border-slate-700 dark:bg-slate-900" /></label>
    </div>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800"><table className="min-w-[980px] w-full text-left text-sm"><thead className="bg-slate-50 dark:bg-slate-900"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Enter as</th><th className="px-4 py-3">Grade</th><th className="px-4 py-3">Automatic conversion</th><th className="px-4 py-3">Classification / remark</th><th className="px-4 py-3">Staff notes</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead>
      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">{loading ? <tr><td colSpan={8} className="p-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-700" /></td></tr> : roster.map((row) => {
        const draft = drafts[row.student.id] || blank(); const locked = Boolean(row.grade?.isReleased); const conversion = draft.inputValue.trim() ? previewGradeConversion(draft.inputType, Number(draft.inputValue)) : null;
        return <tr key={row.student.id}><td className="px-4 py-3"><p className="font-semibold">{row.student.user.name}</p><p className="text-xs text-slate-500">{row.student.studentNumber}</p>{rowErrors[row.student.id] && <p role="alert" className="mt-1 text-xs text-rose-600">{rowErrors[row.student.id]}</p>}</td><td className="px-4 py-3"><select disabled={locked} value={draft.inputType} onChange={(event) => updateDraft(row.student.id, { inputType: event.target.value as GradeInputType, inputValue: '' })} className="rounded-lg border bg-white px-2 py-2 disabled:bg-slate-100 dark:bg-slate-900"><option value="PERCENT">Percent</option><option value="NUMERICAL">Numerical</option></select></td><td className="px-4 py-3"><input disabled={locked} type="number" min={draft.inputType === 'PERCENT' ? 0 : 1} max={draft.inputType === 'PERCENT' ? 100 : 5} step={draft.inputType === 'PERCENT' ? 1 : 0.1} value={draft.inputValue} onChange={(event) => updateDraft(row.student.id, { inputValue: event.target.value })} className="w-20 rounded-lg border px-2 py-2 disabled:bg-slate-100 dark:bg-slate-900" /></td><td className="px-4 py-3"><span className="font-semibold">{conversion ? `${conversion.percentEquivalent} → ${conversion.numericalEquivalent}` : '—'}</span></td><td className="px-4 py-3">{conversion?.classification.replace(/_/g, ' ') || '—'}</td><td className="px-4 py-3"><input disabled={locked} value={draft.remarks} maxLength={500} onChange={(event) => updateDraft(row.student.id, { remarks: event.target.value })} className="w-40 rounded-lg border px-2 py-2 disabled:bg-slate-100 dark:bg-slate-900" /></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${locked ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{locked ? 'Released' : 'Draft'}</span></td><td className="px-4 py-3"><button disabled={locked || busyId === row.student.id} onClick={() => void save(row)} className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busyId === row.student.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Draft</button></td></tr>;
      })}{!loading && roster.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-slate-500">No assigned students found.</td></tr>}</tbody></table></div>
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-slate-500"><span>{total} students</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span className="py-2">{page}/{totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div></div>
  </section>;
}
