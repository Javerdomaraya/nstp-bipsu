import { useState, useEffect, useRef } from 'react';
import { FileText, CheckCircle, Clock, Award, TrendingUp, History, AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import { replaceAssessmentsSnapshot, NstpAssessment } from '../data/nstpData';
import { apiGet, apiPost } from '../services/apiClient';
import { fetchStudentAssessments } from '../services/assessments';
import type { AuthenticatedUser } from '../services/authUser';
import { toast } from 'sonner';

export default function AssessmentsPage({ user, onBack }: { user: AuthenticatedUser; onBack?: () => void }) {
  const [library, setLibrary] = useState<NstpAssessment[]>([]);
  const [results, setResults] = useState<Record<string, any>>({});
  const [activeAssessment, setActiveAssessment] = useState<NstpAssessment | null>(null);
  const [shuffledQuestions, setShuffledQuestions] = useState<NstpAssessment['questions']>([]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [attemptHistory, setAttemptHistory] = useState<Record<string, any[]>>({});
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const answersRef = useRef(answers);
  const shuffledQuestionsRef = useRef(shuffledQuestions);
  const activeAssessmentRef = useRef(activeAssessment);
  const resultsRef = useRef(results);
  const attemptHistoryRef = useRef(attemptHistory);

  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { shuffledQuestionsRef.current = shuffledQuestions; }, [shuffledQuestions]);
  useEffect(() => { activeAssessmentRef.current = activeAssessment; }, [activeAssessment]);
  useEffect(() => { resultsRef.current = results; }, [results]);
  useEffect(() => { attemptHistoryRef.current = attemptHistory; }, [attemptHistory]);

  useEffect(() => {
    fetchStudentAssessments()
      .then((items) => {
        setLibrary(items);
        replaceAssessmentsSnapshot(items);
        setLibraryError(null);
      })
      .catch((error) => setLibraryError(error instanceof Error ? error.message : 'Unable to load assessments.'));
  }, [user.id]);

  useEffect(() => {
    apiGet<{ success: boolean; data: { attempts: any[] } }>('/nstp/students/me/progress')
      .then(({ data }) => {
        const history = data.attempts.reduce<Record<string, any[]>>((all, attempt) => {
          if (!attempt.quizId) return all;
          const row = { score: attempt.score, date: attempt.submittedAt, passed: Boolean(attempt.passed), manualStatus: attempt.manualStatus };
          all[attempt.quizId] = [...(all[attempt.quizId] || []), row];
          return all;
        }, {});
        setAttemptHistory(history);
        setResults(Object.fromEntries(Object.entries(history).map(([id, attempts]) => [id, attempts[0]])));
      })
      .catch(() => { /* server error is surfaced by apiClient; never read browser storage as official data */ });
  }, [user.id]);

  const handleSubmit = async () => {
    const currentAssessment = activeAssessmentRef.current;
    const currentQuestions = shuffledQuestionsRef.current;
    const currentAnswers = answersRef.current;
    const currentResults = resultsRef.current;
    const currentHistory = attemptHistoryRef.current;

    if (!currentAssessment || submitting) return;

    setSubmitting(true);
    let serverAttempt;
    try {
      serverAttempt = await apiPost<any>(`/nstp/students/me/assessments/${currentAssessment.id}/attempts`, {
        answers: currentQuestions.map((question, index) => ({ questionId: question.id, optionIndex: currentAnswers[index] ?? -1 })),
      });
      toast.success('Assessment submitted successfully!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to submit assessment. Please check your answers and try again.');
      setSubmitting(false);
      return;
    }

    const nextResults = {
      ...currentResults,
      [currentAssessment.id]: {
        score: serverAttempt.data?.score ?? serverAttempt.score,
        correct: serverAttempt.data?.correct ?? serverAttempt.correct,
        total: serverAttempt.data?.total ?? serverAttempt.total,
        passed: serverAttempt.data?.passed ?? serverAttempt.passed,
        date: serverAttempt.data?.submittedAt ?? serverAttempt.submittedAt,
      },
    };

    const attempt = nextResults[currentAssessment.id];

    const nextHistory = {
      ...currentHistory,
      [currentAssessment.id]: [attempt, ...(currentHistory[currentAssessment.id] || [])].slice(0, 5),
    };

    setResults(nextResults);
    setAttemptHistory(nextHistory);
    setActiveAssessment(null);
    setTimeLeft(null);
    setSubmitting(false);
  };

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0 || !activeAssessment) return;

    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t === null) return null;
        if (t <= 1) {
          handleSubmit();
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, activeAssessment]);

  const shuffleArray = <T,>(array: T[]): T[] => {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const startAssessment = (assessment: NstpAssessment) => {
    const shuffled = shuffleArray(assessment.questions);
    const count = assessment.questionsToShow > 0 ? Math.min(assessment.questionsToShow, shuffled.length) : shuffled.length;
    setShuffledQuestions(shuffled.slice(0, count));
    setActiveAssessment(assessment);
    setAnswers({});
    setTimeLeft(assessment.timeLimit * 60);
  };

  const formatTime = (seconds: number | null) => {
    const safeSeconds = seconds ?? 0;
    const mins = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (activeAssessment) {
    const answeredCount = Object.keys(answers).length;

    return (
      <div className="size-full overflow-auto bg-[#fcfaf6] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="max-w-4xl mx-auto p-4 md:p-8">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{activeAssessment.title}</h1>
              <div className="flex items-center gap-2 text-blue-700 bg-blue-100 px-4 py-2 rounded-xl dark:bg-blue-500/15 dark:text-blue-100">
                <Clock className="w-5 h-5" />
                <span className="font-mono font-semibold">{formatTime(timeLeft)}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-6 text-sm text-slate-600 dark:text-slate-300">
              <span>{shuffledQuestions.length} questions</span>
              <span>Passing score: {activeAssessment.passingScore}%</span>
              <span>{answeredCount}/{shuffledQuestions.length} answered</span>
            </div>
            {timeLeft !== null && timeLeft <= 120 && (
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-100 text-rose-700 text-sm font-medium dark:bg-rose-500/15 dark:text-rose-100">
                <AlertTriangle className="w-4 h-4" />
                Less than 2 minutes remaining
              </div>
            )}
          </div>

          <div className="space-y-6 mb-6">
            {shuffledQuestions.map((question, index) => (
              <div key={question.id} className="bg-white rounded-2xl border border-slate-200 p-6 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <h3 className="font-semibold text-slate-900 mb-4 dark:text-slate-100">{index + 1}. {question.prompt}</h3>
                <div className="space-y-3">
                  {question.options.map((option, optionIndex) => (
                    <label
                      key={optionIndex}
                      className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${answers[index] === optionIndex ? 'border-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-500/15' : 'border-slate-200 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-950/40 dark:hover:border-blue-400'}`}
                    >
                      <input
                        type="radio"
                        name={`question-${index}`}
                        checked={answers[index] === optionIndex}
                        onChange={() => setAnswers({ ...answers, [index]: optionIndex })}
                        className="w-4 h-4 text-blue-600 dark:text-blue-400"
                      />
                      <span className="text-slate-700 dark:text-slate-200">{option}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-300">Questions answered: {answeredCount} / {shuffledQuestions.length}</p>
              </div>
              <div className="flex gap-3">
                <button disabled={submitting} onClick={() => setActiveAssessment(null)} className="px-6 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
                <button disabled={submitting} onClick={handleSubmit} className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-700 to-yellow-500 text-white px-8 py-2 rounded-xl hover:opacity-95 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? 'Submitting...' : 'Submit Assessment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const completedCount = Object.keys(results).length;
  const averageScore = completedCount > 0 ? Math.round((Object.values(results) as any[]).reduce((acc: number, result: any) => acc + result.score, 0) / completedCount) : 0;
  const passingRate = completedCount > 0 ? Math.round((Object.values(results).filter((result: any) => {
    if (result.manualStatus === 'passed') return true;
    if (result.manualStatus === 'failed') return false;
    return result.passed;
  }).length / completedCount) * 100) : 0;

  return (
    <div className="min-h-full overflow-visible bg-[#fcfaf6] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 p-2 md:p-4">
        {onBack && (
          <button
            onClick={onBack}
            className="module-btn clickable-button mb-1 w-fit px-3 py-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Assessments & Examinations</h2>
          <span className="posh-tag border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-200">
            Bento View
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="posh-kpi">
            <div className="flex items-center gap-3 mb-2"><FileText className="w-5 h-5 text-blue-700" /><span className="text-sm text-slate-600 dark:text-slate-300">Available Assessments</span></div>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{library.length}</p>
          </div>
          <div className="posh-kpi">
            <div className="flex items-center gap-3 mb-2"><CheckCircle className="w-5 h-5 text-green-600" /><span className="text-sm text-slate-600 dark:text-slate-300">Completed</span></div>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{completedCount}</p>
          </div>
          <div className="posh-kpi">
            <div className="flex items-center gap-3 mb-2"><Award className="w-5 h-5 text-blue-600" /><span className="text-sm text-slate-600 dark:text-slate-300">Average Score</span></div>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{averageScore}%</p>
          </div>
          <div className="posh-kpi">
            <div className="flex items-center gap-3 mb-2"><TrendingUp className="w-5 h-5 text-rose-600" /><span className="text-sm text-slate-600 dark:text-slate-300">Passing Rate</span></div>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{passingRate}%</p>
          </div>
        </div>

        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.18fr)_minmax(300px,0.82fr)]">
          {libraryError && <div role="alert" className="xl:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{libraryError}</div>}
          <div className="bento-panel min-h-0 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">Assessment Library</h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">{library.length} items</span>
            </div>
            <div className="space-y-3 xl:max-h-[calc(100dvh-22rem)] xl:overflow-auto xl:pr-1">
              {library.length === 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">No published assessments are available yet.</div>
              )}
              {library.map((assessment) => {
            const result = results[assessment.id];
            const history = attemptHistory[assessment.id] || [];
            const isExam = assessment.type === 'exam';
            const effectivePassed = result
              ? result.manualStatus === 'passed'
                ? true
                : result.manualStatus === 'failed'
                ? false
                : Boolean(result.passed)
              : false;

            return (
              <div key={assessment.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:p-5">
                <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${isExam ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-100' : 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-100'}`}>{isExam ? 'MAJOR EXAM' : 'QUIZ'}</span>
                      <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${assessment.status === 'published' ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-100' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}>{assessment.status.toUpperCase()}</span>
                      {result && <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${effectivePassed ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-100' : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-100'}`}>{effectivePassed ? 'PASSED' : 'FAILED'}</span>}
                      {result?.manualStatus && <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-100">ADMIN OVERRIDE</span>}
                    </div>
                    <h3 className="mb-2 break-words text-lg font-semibold text-slate-900 dark:text-slate-100">{assessment.title}</h3>
                    <p className="text-sm text-slate-600 mb-3 dark:text-slate-300">{assessment.description}</p>
                    <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
                      <span className="flex items-center gap-1"><FileText className="w-4 h-4" />{assessment.questionsToShow > 0 ? `${Math.min(assessment.questionsToShow, assessment.questions.length)}/${assessment.questions.length}` : assessment.questions.length} questions</span>
                      <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{assessment.timeLimit} minutes</span>
                      <span>Passing: {assessment.passingScore}%</span>
                      <span className="min-w-0 break-words">Owner: {assessment.ownerName}</span>
                    </div>
                    {result && (
                      <div className="flex items-center gap-2 text-sm">
                        <Award className={`w-4 h-4 ${effectivePassed ? 'text-green-600' : 'text-red-600'}`} />
                        <span className="font-semibold text-slate-900 dark:text-slate-100">Score: {result.score}% ({result.correct}/{result.total})</span>
                        <span className="text-slate-600 dark:text-slate-300">• Taken on {new Date(result.date).toLocaleDateString()}</span>
                      </div>
                    )}
                    {history.length > 1 && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <History className="w-4 h-4" /> {history.length} recent attempts recorded
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => startAssessment(assessment)}
                    className={`module-btn clickable-button w-full justify-center lg:w-auto ${result ? '' : 'module-btn-primary border-0 text-white'}`}
                  >
                    {result ? 'Retake' : 'Start Assessment'}
                  </button>
                </div>
              </div>
            );
              })}
            </div>
          </div>

          <div className="grid gap-3">
            <div className="bento-panel p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">Performance Snapshot</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                  <p className="text-xs uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-200">Average Score</p>
                  <p className="mt-1 text-3xl font-bold text-emerald-700 dark:text-emerald-200">{averageScore}%</p>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/20 dark:bg-rose-500/10">
                  <p className="text-xs uppercase tracking-[0.14em] text-rose-700 dark:text-rose-200">Passing Rate</p>
                  <p className="mt-1 text-3xl font-bold text-rose-700 dark:text-rose-200">{passingRate}%</p>
                </div>
              </div>
            </div>

            <div className="bento-panel p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">Recent Attempts</h3>
              <div className="space-y-3 xl:max-h-[28rem] xl:overflow-auto xl:pr-1">
                {Object.entries(results).length === 0 ? (
                  <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">No attempts yet.</p>
                ) : (
                  (Object.entries(results) as [string, any][])
                    .slice(0, 12)
                    .map(([assessmentId, result]) => (
                      <div key={assessmentId} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{assessmentId}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-300">Score: {(result as any).score}% • {new Date((result as any).date).toLocaleDateString()}</p>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
