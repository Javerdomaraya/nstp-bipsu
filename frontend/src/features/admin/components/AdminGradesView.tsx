import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, LockKeyhole, Save, Search } from 'lucide-react';
import { ApiRequestError } from '../../../services/apiClient';
import {
  createAdminGrade, fetchAdminGradeRoster, previewGradeConversion, setAdminGradeRelease,
  updateAdminGrade, type AcademicSemester, type GradeInputType, type GradeRosterRow, type SemesterGrade,
} from '../../../services/grades';
import { getCurrentAcademicYear } from '../../../utils/academicYear';

type Draft = { inputType: GradeInputType; inputValue: string; remarks: string };

const emptyDraft = (): Draft => ({ inputType: 'PERCENT', inputValue: '', remarks: '' });
const draftFromGrade = (grade: SemesterGrade): Draft => {
  const inputType = grade.inputType || (grade.percentGrade !== null ? 'PERCENT' : 'NUMERICAL');
  const fallbackValue = inputType === 'PERCENT' ? grade.percentGrade : grade.numericalGrade;
  return { inputType, inputValue: String(grade.inputValue ?? fallbackValue ?? ''), remarks: grade.remarks || '' };
};
const classificationLabel = (value: string | null) => value ? value.replace(/_/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase()) : '—';

export default function AdminGradesView() {
  const [schoolYear, setSchoolYear] = useState(getCurrentAcademicYear());
  const [semester, setSemester] = useState<AcademicSemester>('FIRST');
  const [roster, setRoster] = useState<GradeRosterRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 10;

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetchAdminGradeRoster({ schoolYear, semester, page, pageSize, search: search.trim() || undefined });
      setRoster(response.data);
      setTotal(response.meta?.total || 0);
      setTotalPages(response.meta?.totalPages || 1);
      setDrafts(Object.fromEntries(response.data.map((row) => [row.student.id, row.grade ? draftFromGrade(row.grade) : emptyDraft()])));
      setErrors({});
    } catch (error) {
      setErrors({ page: error instanceof Error ? error.message : 'Unable to load semester grades.' });
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => { void load(); }, 250);
    return () => window.clearTimeout(timeout);
  }, [schoolYear, semester, page, search]);
  useEffect(() => { setPage(1); }, [search, semester, schoolYear]);

  const changeDraft = (studentId: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({ ...current, [studentId]: { ...(current[studentId] || emptyDraft()), ...patch } }));
    setErrors((current) => ({ ...current, [studentId]: '' }));
  };

  const save = async (student: GradeRosterRow['student'], existing: SemesterGrade | null) => {
    const draft = drafts[student.id] || emptyDraft();
    const inputValue = Number(draft.inputValue);
    const conversion = draft.inputValue.trim() ? previewGradeConversion(draft.inputType, inputValue) : null;
    if (!student.componentId) return setErrors((current) => ({ ...current, [student.id]: 'Assign this student to an NSTP component first.' }));
    if (!conversion) return setErrors((current) => ({ ...current, [student.id]: `Enter a valid ${draft.inputType === 'PERCENT' ? 'whole-number percentage from 0 to 100' : 'numerical grade from 1.0–4.0 or 5.0'}.` }));
    setBusyId(student.id);
    try {
      const saved = existing
        ? await updateAdminGrade(existing.id, { gradeInput: { inputType: draft.inputType, inputValue }, remarks: draft.remarks })
        : await createAdminGrade({ studentId: student.id, componentId: student.componentId, schoolYear, semester, gradeInput: { inputType: draft.inputType, inputValue }, remarks: draft.remarks });
      setRoster((current) => current.map((row) => row.student.id === student.id ? { ...row, grade: saved } : row));
      setErrors((current) => ({ ...current, [student.id]: '' }));
    } catch (error) {
      const message = error instanceof ApiRequestError && error.status === 409 ? error.message : error instanceof Error ? error.message : 'Grade could not be saved.';
      setErrors((current) => ({ ...current, [student.id]: message }));
    } finally { setBusyId(null); }
  };

  const toggleRelease = async (student: GradeRosterRow['student'], record: SemesterGrade) => {
    if (record.isReleased && !window.confirm('Return this released grade to hold?')) return;
    if (!record.isReleased && !window.confirm('Release this official semester grade to the student?')) return;
    setBusyId(student.id);
    try {
      const updated = await setAdminGradeRelease(record.id, !record.isReleased);
      setRoster((current) => current.map((row) => row.student.id === student.id ? { ...row, grade: updated } : row));
      setErrors((current) => ({ ...current, [student.id]: '' }));
    } catch (error) {
      setErrors((current) => ({ ...current, [student.id]: error instanceof Error ? error.message : 'Release status could not be changed.' }));
    } finally { setBusyId(null); }
  };

  return (
    <section className="space-y-4 sm:space-y-5 p-3.5 sm:p-5">
      <div className="flex flex-col gap-3 sm:gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Official Grades</p>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-950 dark:text-white">Semester Grade Center</h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">Save drafts first, then release verified grades to students.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200">
            <span>School year</span>
            <input value={schoolYear} onChange={(event) => setSchoolYear(event.target.value)} pattern="\d{4}-\d{4}" className="ml-2 w-28 sm:w-32 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <div className="flex gap-1.5 sm:gap-2">
            {(['FIRST', 'SECOND'] as const).map((value) => <button key={value} type="button" onClick={() => setSemester(value)} className={`rounded-xl px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold ${semester === value ? 'bg-blue-700 text-white' : 'border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>{value === 'FIRST' ? 'First Semester' : 'Second Semester'}</button>)}
          </div>
        </div>
      </div>

      <label className="relative block max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student name or ID" aria-label="Search grade roster" className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 dark:border-slate-700 dark:bg-slate-900" />
      </label>
      {errors.page && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{errors.page}</p>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-950 dark:text-slate-300"><tr>
            <th className="px-4 py-3">Student</th><th className="px-4 py-3">Component</th><th className="px-4 py-3">Enter as</th><th className="px-4 py-3">Grade</th><th className="px-4 py-3">Automatic conversion</th><th className="px-4 py-3">Classification / remark</th><th className="px-4 py-3">Staff notes</th><th className="px-4 py-3">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {loading ? <tr><td colSpan={8} className="px-4 py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-700" /><span className="sr-only">Loading grades</span></td></tr> : roster.map(({ student, grade: record }) => {
              const draft = drafts[student.id] || emptyDraft();
              const conversion = draft.inputValue.trim() ? previewGradeConversion(draft.inputType, Number(draft.inputValue)) : null;
              const busy = busyId === student.id;
              return <tr key={student.id} className="align-top">
                <td className="px-4 py-4"><p className="font-semibold text-slate-900 dark:text-white">{student.user.name}</p><p className="text-xs text-slate-500">{student.studentNumber || 'No student number'}</p>{errors[student.id] && <p role="alert" className="mt-2 max-w-xs text-xs font-medium text-rose-600">{errors[student.id]}</p>}</td>
                <td className="px-4 py-4">{student.component?.name || 'Not assigned'}</td>
                <td className="px-4 py-4"><select disabled={record?.isReleased} value={draft.inputType} onChange={(event) => changeDraft(student.id, { inputType: event.target.value as GradeInputType, inputValue: '' })} aria-label={`${student.user.name} grade input type`} className="rounded-lg border border-slate-300 bg-white px-2 py-2 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900"><option value="PERCENT">Percent</option><option value="NUMERICAL">Numerical</option></select></td>
                <td className="px-4 py-4"><input type="number" min={draft.inputType === 'PERCENT' ? 0 : 1} max={draft.inputType === 'PERCENT' ? 100 : 5} step={draft.inputType === 'PERCENT' ? 1 : 0.1} disabled={record?.isReleased} value={draft.inputValue} onChange={(event) => changeDraft(student.id, { inputValue: event.target.value })} aria-label={`${student.user.name} ${draft.inputType === 'PERCENT' ? 'percent' : 'numerical'} grade`} className="w-24 rounded-lg border border-slate-300 px-2 py-2 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900" /></td>
                <td className="px-4 py-4"><p className="font-semibold text-slate-900 dark:text-white">{conversion ? `${conversion.percentEquivalent} → ${conversion.numericalEquivalent}` : '—'}</p><p className="mt-1 text-xs text-slate-500">Percent → Numerical</p></td>
                <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${conversion ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{classificationLabel(conversion?.classification || null)}</span></td>
                <td className="px-4 py-4"><input disabled={record?.isReleased} value={draft.remarks} maxLength={500} onChange={(event) => changeDraft(student.id, { remarks: event.target.value })} aria-label={`${student.user.name} grade remarks`} className="w-40 rounded-lg border border-slate-300 px-2 py-2 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900" /></td>
                <td className="px-4 py-4"><div className="flex gap-2">
                  <button type="button" disabled={busy || record?.isReleased} onClick={() => void save(student, record)} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Draft</button>
                  {record && <button type="button" disabled={busy} onClick={() => void toggleRelease(student, record)} className={`inline-flex min-h-10 items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 ${record.isReleased ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{record.isReleased ? <LockKeyhole className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{record.isReleased ? 'Hold' : 'Release'}</button>}
                </div></td>
              </tr>;
            })}
            {!loading && roster.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">No students match this search.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300"><span>{total} students</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span>Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div></div>
    </section>
  );
}
