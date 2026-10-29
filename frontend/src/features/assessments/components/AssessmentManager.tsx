import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Save, Eye, EyeOff, UserPlus, BookOpen, Clock3, MessageSquareText, ChevronUp, ChevronDown, LayoutPanelLeft, Sparkles } from 'lucide-react';
import { createEmptyAssessment, type AssessmentOwner, NstpAccount, NstpAssessment, NstpModule, NstpQuestion } from '../../../data/nstpData';
import { fetchManagedModules } from '../../../services/modules';
import { fetchAccounts } from '../../../services/api';
import {
  createManagedAssessment, fetchAssessmentAttempts, fetchManagedAssessments,
  overrideAssessmentAttempt, removeManagedAssessment, updateManagedAssessment,
  type AssessmentAttemptRow,
} from '../../../services/assessments';

type Props = {
  /**
   * The signed-in author of new drafts — id, name and role, nothing more. It was
   * `NstpAccount`, which no session object can satisfy (that type requires
   * `password`), so callers cast their session to it and lost all checking on the
   * fields this screen actually touches.
   */
  user: AssessmentOwner;
  role: 'admin' | 'coordinator' | 'facilitator';
};

const emptyQuestion = (): NstpQuestion => ({
  id: `q-${Math.random().toString(36).slice(2, 9)}`,
  prompt: 'New question prompt',
  options: ['Option A', 'Option B', 'Option C', 'Option D'],
  correctIndex: 0,
});

const emptyForm = (user: AssessmentOwner): NstpAssessment => createEmptyAssessment(user);

type AttemptStatus = 'passed' | 'failed' | 'review';

type AttemptRow = {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  assessmentId: string;
  assessmentTitle: string;
  score: number;
  passed: boolean;
  manualStatus?: AttemptStatus;
  submittedAt: string;
};

export default function AssessmentManager({ user, role }: Props) {
  const [assessments, setAssessments] = useState<NstpAssessment[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<NstpAssessment | null>(null);
  const [accounts, setAccounts] = useState<NstpAccount[]>([]);
  const [modules, setModules] = useState<NstpModule[]>([]);
  const [attempts, setAttempts] = useState<AssessmentAttemptRow[]>([]);
  const [globalPassingScore, setGlobalPassingScore] = useState(70);
  const [selectedAttemptStudent, setSelectedAttemptStudent] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // A coordinator's assessment list is restricted to their own components by the
  // API, so it must not be written into the shared `nstp-assessment-library`
  // snapshot that the admin screens and shell counters read as the whole
  // programme. It lives in this component's state instead. (The facilitator list
  // is also a subset; that path writes its own snapshot in FacilitatorDashboard
  // and is tracked separately.)
  const isComponentScoped = role === 'coordinator';

  useEffect(() => {
    // The accounts snapshot is admin-populated and is only used by the
    // administrator's "Assign Facilitator Owner" picker below, so no other role
    // reads it.
    if (role === 'admin') fetchAccounts().then(setAccounts).catch(() => setAccounts([]));
    else setAccounts([]);
    Promise.all([fetchManagedAssessments(role), fetchManagedModules(role)])
      .then(([items, moduleRows]) => {
        setAssessments(items);
        setModules(moduleRows.filter((module) => module.status !== 'ARCHIVED'));
        if (items.length > 0) setGlobalPassingScore(items[0].passingScore);
        setError(null);
      })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : 'Unable to load assessment data.'));
    if (role === 'admin') {
      fetchAssessmentAttempts().then(setAttempts).catch((requestError) => setError(requestError instanceof Error ? requestError.message : 'Unable to load assessment attempts.'));
    }
  }, [isComponentScoped, role]);

  const ownedAssessments = useMemo(() => assessments, [assessments]);

  const upsertAssessment = async (nextAssessment: NstpAssessment) => {
    setSaving(true);
    try {
      const saved = editingId === 'new'
        ? await createManagedAssessment(role, nextAssessment)
        : await updateManagedAssessment(role, nextAssessment);
      const nextList = assessments.some((item) => item.id === saved.id)
        ? assessments.map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...assessments];
      setAssessments(nextList);
      setEditingId(null);
      setForm(null);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save assessment.');
    } finally {
      setSaving(false);
    }
  };

  const startNew = () => {
    setEditingId('new');
    setForm(emptyForm(user));
  };

  const startEdit = (assessment: NstpAssessment) => {
    setEditingId(assessment.id);
    setForm(JSON.parse(JSON.stringify(assessment)));
  };

  const removeAssessment = async (assessmentId: string) => {
    setSaving(true);
    try {
      const result = await removeManagedAssessment(role, assessmentId);
      const nextList = result.archived
        ? assessments.map((item) => item.id === assessmentId ? { ...item, status: 'archived' as const } : item)
        : assessments.filter((item) => item.id !== assessmentId);
      setAssessments(nextList);
      if (editingId === assessmentId) { setEditingId(null); setForm(null); }
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to remove assessment.');
    } finally {
      setSaving(false);
    }
  };

  const updateQuestion = (questionId: string, patch: Partial<NstpQuestion>) => {
    if (!form) return;
    setForm({
      ...form,
      questions: form.questions.map((question) => (question.id === questionId ? { ...question, ...patch } : question)),
    });
  };

  const addQuestion = () => {
    if (!form) return;
    setForm({ ...form, questions: [...form.questions, emptyQuestion()] });
  };

  const moveQuestion = (questionId: string, direction: 'up' | 'down') => {
    if (!form) return;
    const index = form.questions.findIndex((question) => question.id === questionId);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= form.questions.length) return;

    const nextQuestions = [...form.questions];
    [nextQuestions[index], nextQuestions[targetIndex]] = [nextQuestions[targetIndex], nextQuestions[index]];
    setForm({ ...form, questions: nextQuestions });
  };

  const removeQuestion = (questionId: string) => {
    if (!form) return;
    const nextQuestions = form.questions.filter((question) => question.id !== questionId);
    setForm({ ...form, questions: nextQuestions.length > 0 ? nextQuestions : [emptyQuestion()] });
  };

  const togglePublished = async (assessment: NstpAssessment) => {
    const nextStatus = assessment.status === 'published' ? 'draft' : 'published';
    await upsertAssessment({ ...assessment, status: nextStatus });
  };

  const facilitatorOptions = accounts.filter((account) => account.role === 'facilitator');

  const attemptRows = useMemo<AttemptRow[]>(() => attempts
    .filter((attempt) => selectedAttemptStudent === 'all' || attempt.studentId === selectedAttemptStudent)
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()), [attempts, selectedAttemptStudent]);

  const applyPassingScoreToAllAssessments = async () => {
    const nextAssessments = assessments.map((assessment) => ({
      ...assessment,
      passingScore: globalPassingScore,
      updatedAt: new Date().toISOString(),
    }));

    setSaving(true);
    try {
      const editableAssessments = nextAssessments.filter((assessment) => assessment.status !== 'archived');
      const savedEditable = await Promise.all(editableAssessments.map((assessment) => updateManagedAssessment(role, assessment)));
      const saved = nextAssessments.map((assessment) => savedEditable.find((item) => item.id === assessment.id) || assessment);
      setAssessments(saved);
      setAttempts((current) => current.map((attempt) => {
        const assessment = saved.find((item) => item.id === attempt.assessmentId);
        return assessment && !attempt.manualStatus ? { ...attempt, passed: attempt.score >= assessment.passingScore } : attempt;
      }));
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to apply the passing score.');
    } finally {
      setSaving(false);
    }
  };

  const overrideAttemptStatus = async (row: AttemptRow, status: AttemptStatus) => {
    const reason = window.prompt('Enter the required reason for this result override:')?.trim();
    if (!reason) return;
    try {
      await overrideAssessmentAttempt(row.id, status, reason);
      setAttempts((current) => current.map((attempt) => attempt.id === row.id ? { ...attempt, manualStatus: status } : attempt));
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to override this attempt.');
    }
  };

  return (
    <div className="min-h-full overflow-visible bg-[#f4f8fd] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-7xl p-2 md:p-4">
        <div className="mb-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 p-5 dark:border-blue-500/20 dark:from-blue-500/10 dark:to-cyan-500/10">
            <p className="text-xs uppercase tracking-[0.16em] font-semibold text-blue-700 mb-2 dark:text-blue-300">Assessment Studio</p>
            <h3 className="text-lg font-bold text-slate-900 mb-1">{ownedAssessments.length} managed assessments</h3>
            <p className="text-sm text-slate-600">Create, edit, and publish quizzes or exams with full question-level control.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2 text-slate-900 font-semibold">
              <UserPlus className="w-4 h-4 text-blue-600" />
              Assessment Ownership
            </div>
            <p className="text-sm text-slate-600">
              {role === 'admin'
                ? 'Administrators can publish university-wide assessments and assign them to any facilitator.'
                : 'Facilitators can create and edit only their own assessments.'}
            </p>
          </div>
        </div>

        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Assessment & Question Manager</h2>
          <button
            onClick={startNew}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-medium text-white shadow-sm shadow-blue-900/20 transition hover:bg-blue-800 sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            New Assessment
          </button>
        </div>

        {error && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

        {editingId && form && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm md:p-8">
            <div className="mx-auto max-w-6xl rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900 md:p-6">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{editingId === 'new' ? 'Create Assessment' : 'Edit Assessment'}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">Use this form to build the assessment and its questions.</p>
              </div>
              <button
                onClick={() => { setEditingId(null); setForm(null); }}
                className="text-sm text-slate-500 hover:text-slate-900"
              >
                Close
              </button>
            </div>

            <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
              <div className="min-w-0">
                <div className="grid md:grid-cols-2 gap-4 mb-5">
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    <span>Title</span>
                    <input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    <span>Type</span>
                    <select
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value as NstpAssessment['type'] })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    >
                      <option value="quiz">Quiz</option>
                      <option value="exam">Exam</option>
                      <option value="seminar">Seminar Assessment</option>
                    </select>
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                    <span>Description</span>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    <span>Connected Module</span>
                    <select
                      value={form.moduleId || ''}
                      onChange={(e) => setForm({ ...form, moduleId: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                      required
                    >
                      <option value="">Select a module</option>
                      {modules.map((module) => (
                        <option key={module.id} value={module.id} disabled={module.status === 'ARCHIVED'}>
                          {module.title} — {module.component || 'Common'} — {module.status || 'DRAFT'}
                        </option>
                      ))}
                    </select>
                    {modules.length === 0 && <span className="block text-xs text-amber-700">No assigned modules are available. Create or assign a module first.</span>}
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    <span>Passing Score</span>
                    <input
                      type="number"
                      value={form.passingScore}
                      onChange={(e) => setForm({ ...form, passingScore: Number(e.target.value) })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    <span>Time Limit (minutes)</span>
                    <input
                      type="number"
                      value={form.timeLimit}
                      onChange={(e) => setForm({ ...form, timeLimit: Number(e.target.value) })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    <span>Questions to Show (0 = all)</span>
                    <input
                      type="number"
                      min={0}
                      value={form.questionsToShow}
                      onChange={(e) => setForm({ ...form, questionsToShow: Math.max(0, Number(e.target.value)) })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    />
                  </label>
                  {role === 'admin' && (
                    <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                      <span>Assign Facilitator Owner</span>
                      <select
                        value={form.ownerId}
                        onChange={(e) => {
                          const account = accounts.find((item) => item.id === e.target.value);
                          if (!account) return;
                          setForm({
                            ...form,
                            ownerId: account.id,
                            ownerName: account.name,
                            ownerRole: 'facilitator',
                          });
                        }}
                        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                      >
                        <option value={user.id}>{user.name} (Admin)</option>
                        {facilitatorOptions.map((facilitator) => (
                          <option key={facilitator.id} value={facilitator.id}>{facilitator.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                <div className="space-y-4 mb-5">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-slate-900">Questions</h4>
                    <button onClick={addQuestion} className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800">
                      <Plus className="w-4 h-4" /> Add Question
                    </button>
                  </div>

                  {form.questions.map((question, index) => (
                    <div key={question.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/40">
                      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="font-semibold text-slate-900">Question {index + 1}</p>
                        <div className="flex items-center gap-2">
                          <button onClick={() => moveQuestion(question.id, 'up')} className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50" aria-label="Move question up">
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button onClick={() => moveQuestion(question.id, 'down')} className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50" aria-label="Move question down">
                            <ChevronDown className="w-4 h-4" />
                          </button>
                          <button onClick={() => removeQuestion(question.id)} className="text-rose-600 hover:text-rose-700 text-sm inline-flex items-center gap-1">
                            <Trash2 className="w-4 h-4" /> Remove
                          </button>
                        </div>
                      </div>
                      <label className="space-y-2 text-sm font-medium text-slate-700 block mb-3">
                        <span>Prompt</span>
                        <textarea
                          value={question.prompt}
                          onChange={(e) => updateQuestion(question.id, { prompt: e.target.value })}
                          rows={2}
                          className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                        />
                      </label>
                      <div className="grid md:grid-cols-2 gap-3 mb-3">
                        {question.options.map((option, optionIndex) => (
                          <label key={`${question.id}-${optionIndex}`} className="space-y-2 text-sm font-medium text-slate-700 block">
                            <span>Option {optionIndex + 1}</span>
                            <input
                              value={option}
                              onChange={(e) => {
                                const nextOptions = [...question.options];
                                nextOptions[optionIndex] = e.target.value;
                                updateQuestion(question.id, { options: nextOptions });
                              }}
                              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                            />
                          </label>
                        ))}
                      </div>
                      <label className="space-y-2 text-sm font-medium text-slate-700 inline-block">
                        <span>Correct Answer</span>
                        <select
                          value={question.correctIndex}
                          onChange={(e) => updateQuestion(question.id, { correctIndex: Number(e.target.value) })}
                          className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                        >
                          {question.options.map((_, optionIndex) => (
                            <option key={optionIndex} value={optionIndex}>Option {optionIndex + 1}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="min-w-0 space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 xl:sticky xl:top-4">
                  <div className="flex items-center gap-2 mb-3 font-semibold text-slate-900">
                    <LayoutPanelLeft className="w-4 h-4 text-blue-600" />
                    Live Preview
                  </div>
                  <div className="space-y-3 text-sm text-slate-600 mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold">{form.type.toUpperCase()}</span>
                      <span className="inline-flex px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">{form.status.toUpperCase()}</span>
                    </div>
                    <p className="font-semibold text-slate-900">{form.title || 'Untitled Assessment'}</p>
                    <p>{form.description || 'No description yet.'}</p>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="inline-flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" /> {form.timeLimit} mins</span>
                      <span className="inline-flex items-center gap-1"><MessageSquareText className="w-3.5 h-3.5" /> {form.questions.length} questions{form.questionsToShow > 0 ? ` (show ${Math.min(form.questionsToShow, form.questions.length)})` : ''}</span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] font-semibold text-slate-500 mb-2">Question Sample</p>
                    <p className="font-medium text-slate-900 mb-3">{form.questions[0]?.prompt || 'Add at least one question to preview.'}</p>
                    <div className="space-y-2">
                      {(form.questions[0]?.options || []).map((option, index) => (
                        <div key={index} className={`rounded-xl border px-3 py-2 text-sm ${index === form.questions[0]?.correctIndex ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-700'}`}>
                          {option}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    This preview mirrors the student assessment screen.
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-end gap-3 sm:flex-row sm:flex-wrap">
              <button
                onClick={() => { setEditingId(null); setForm(null); }}
                className="rounded-xl border border-slate-300 px-5 py-3 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!form) return;
                  upsertAssessment({ ...form, updatedAt: new Date().toISOString() });
                }}
                disabled={saving || !form.moduleId}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 hover:bg-blue-800 px-5 py-3 text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving…' : 'Save Assessment'}
              </button>
            </div>
            </div>
          </div>
        )}

        <div className="grid gap-4">
          {ownedAssessments.map((assessment) => {
            const editable = true;
            return (
              <div key={assessment.id} className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-6">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold">
                        <BookOpen className="w-3.5 h-3.5" />
                        {assessment.type.toUpperCase()}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${assessment.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                        {assessment.status === 'published' ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        {assessment.status}
                      </span>
                    </div>
                    <h3 className="mb-2 break-words text-lg font-semibold text-slate-900 dark:text-slate-100">{assessment.title}</h3>
                    <p className="mb-4 break-words text-sm text-slate-600 dark:text-slate-300">{assessment.description}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1"><Clock3 className="w-4 h-4" /> {assessment.timeLimit} mins</span>
                      <span className="inline-flex items-center gap-1"><MessageSquareText className="w-4 h-4" /> {assessment.questions.length} questions</span>
                      <span>Passing score: {assessment.passingScore}%</span>
                      <span>Owner: {assessment.ownerName}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
                    {assessment.status !== 'archived' && <button
                      onClick={() => togglePublished(assessment)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {assessment.status === 'published' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      {assessment.status === 'published' ? 'Unpublish' : 'Publish'}
                    </button>}
                    {editable && (
                      <button
                        onClick={() => startEdit(assessment)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-white hover:bg-blue-800"
                      >
                        <Pencil className="w-4 h-4" />
                        Edit
                      </button>
                    )}
                    {editable && (
                      <button
                        onClick={() => removeAssessment(assessment.id)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {role === 'admin' && (
          <div className="mt-8 space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Assessment Governance</h3>
                  <p className="text-sm text-slate-600">Update passing requirements and synchronize pass/fail evaluation across existing student attempts.</p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={globalPassingScore}
                    onChange={(e) => setGlobalPassingScore(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                    className="w-32 px-4 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                  <button
                    onClick={applyPassingScoreToAllAssessments}
                    className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-5 py-2.5 rounded-xl hover:opacity-95 transition-opacity"
                  >
                    <Save className="w-4 h-4" />
                    Apply Passing Grade
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <label className="text-sm font-medium text-slate-700">Student Filter</label>
                <select
                  value={selectedAttemptStudent}
                  onChange={(e) => setSelectedAttemptStudent(e.target.value)}
                  className="px-4 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                >
                  <option value="all">All Student Accounts</option>
                  {[...new Map(attempts.map((attempt) => [attempt.studentId, attempt])).values()].map((attempt) => (
                    <option key={attempt.studentId} value={attempt.studentId}>{attempt.studentName}</option>
                  ))}
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Student</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Assessment</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Score</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Computed</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Admin Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attemptRows.map((row) => (
                      <tr key={`${row.studentId}-${row.assessmentId}`} className="border-b border-slate-100">
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900">{row.studentName}</p>
                          <p className="text-xs text-slate-500">{row.studentEmail}</p>
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-700">{row.assessmentTitle}</td>
                        <td className="py-3 px-4 text-sm font-semibold text-slate-900">{row.score}%</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-3 py-1 rounded-lg text-xs font-semibold ${row.passed ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}>
                            {row.passed ? 'Passed' : 'Failed'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={row.manualStatus || (row.passed ? 'passed' : 'failed')}
                            onChange={(e) => overrideAttemptStatus(row, e.target.value as AttemptStatus)}
                            className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
                          >
                            <option value="passed">Passed</option>
                            <option value="failed">Failed</option>
                            <option value="review">Under Review</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {attemptRows.length === 0 && (
                <div className="mt-4 text-center text-sm text-slate-500">No recorded student attempts yet.</div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
