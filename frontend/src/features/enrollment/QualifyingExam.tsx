import { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, Clock, AlertCircle, Award, LogOut, Shield, Send, HelpCircle, CheckCircle2 } from 'lucide-react';
import { NstpComponent, QualifyingExamResult, isCriminologyProgram, isTeacherEducationProgram } from '../../data/nstpData';
import type { StudentUser } from '../../services/authUser';
import { apiPost, ApiRequestError } from '../../services/apiClient';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';

export type QualifyingQuestion = {
  id: string;
  prompt: string;
  options: string[];
  order?: number;
};

export default function QualifyingExam({ user, preferredComponent, onComplete, onLogout }: { user: StudentUser; preferredComponent: NstpComponent; onComplete: (score: number | null, assignment?: QualifyingExamResult) => void; onLogout: () => void }) {
  const [questions, setQuestions] = useState<QualifyingQuestion[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [clockOffset, setClockOffset] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [timeLeft, setTimeLeft] = useState(3600);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [submissionResult, setSubmissionResult] = useState<QualifyingExamResult | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const answersRef = useRef<Record<number, number>>({});
  const questionsRef = useRef<QualifyingQuestion[]>([]);
  const attemptIdRef = useRef<string | null>(null);
  const submittedRef = useRef(false);

  const scrollToQuestion = (idx: number) => {
    const el = document.getElementById(`exam-question-${idx}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  answersRef.current = answers;
  questionsRef.current = questions;
  attemptIdRef.current = attemptId;
  submittedRef.current = submitted;

  const storageKey = attemptId ? `qualifying-exam-answers-${user.id}-${attemptId}` : null;

  // Restore saved answers from sessionStorage once attemptId is available
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          setAnswers((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch {
      // Ignore sessionStorage deserialization errors
    }
  }, [storageKey]);

  // Autosave answers to sessionStorage whenever answers change
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined' || submitted) return;
    try {
      if (Object.keys(answers).length > 0) {
        sessionStorage.setItem(storageKey, JSON.stringify(answers));
      }
    } catch {
      // Ignore quota errors
    }
  }, [answers, storageKey, submitted]);

  const handleSubmit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;

    const payload = {
      attemptId: attemptIdRef.current,
      preferredComponent,
      answers: Object.entries(answersRef.current).map(([qIdx, optIdx]) => ({
        questionId: questionsRef.current[Number(qIdx)]?.id || `q-${qIdx}`,
        optionIndex: optIdx,
      })),
    };

    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const res = await apiPost<{
          success: boolean;
          data: {
            id: string;
            score: number;
            passed: boolean;
            assignedComponent: string | null;
            status: string;
          };
        } | null>('/nstp/students/me/qualifying-exam/submit', payload, null);

        if (res?.data) {
          toast.dismiss('submit-busy-retry');
          const finalScore = res.data.score ?? 0;
          setScore(finalScore);
          setSubmitted(true);

          if (attemptIdRef.current && typeof window !== 'undefined') {
            sessionStorage.removeItem(`qualifying-exam-answers-${user.id}-${attemptIdRef.current}`);
          }

          const examResult: QualifyingExamResult = {
            userId: user.id,
            userName: user.name,
            userEmail: user.email,
            preferredComponent,
            score: finalScore,
            assignedComponent: (res.data.assignedComponent as NstpComponent) || null,
            status: res.data.status as QualifyingExamResult['status'],
            timestamp: new Date().toISOString(),
          };
          setSubmissionResult(examResult);

          toast.success('Exam submitted successfully.');
          return;
        } else {
          toast.dismiss('submit-busy-retry');
          toast.error('Unable to submit exam. Please try again.');
          submittedRef.current = false;
          return;
        }
      } catch (err: any) {
        const is503 = (err instanceof ApiRequestError && err.status === 503) || err?.status === 503;
        if (is503 && attempt < maxRetries - 1) {
          attempt++;
          toast.loading(`Server busy allocating slots; retrying submission (${attempt}/${maxRetries - 1})...`, {
            id: 'submit-busy-retry',
          });
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }

        toast.dismiss('submit-busy-retry');
        toast.error(err?.message || 'Could not submit exam. Please try again.');
        // Failed: preserve answers in state and sessionStorage, allow student to retry
        submittedRef.current = false;
        return;
      }
    }
  }, [preferredComponent, user.id, user.name, user.email]);

  useEffect(() => {
    let mounted = true;

    async function startExamSession() {
      try {
        const response = await apiPost<{
          success: boolean;
          data: {
            attemptId: string;
            examTitle: string;
            serverNow?: string;
            expiresAt: string;
            questions: QualifyingQuestion[];
          };
        } | null>('/nstp/students/me/qualifying-exam/start', { preferredComponent }, null);

        if (!mounted) return;

        if (response?.data?.questions) {
          setQuestions(response.data.questions);
          setAttemptId(response.data.attemptId);
          if (response.data.serverNow) {
            const offset = new Date(response.data.serverNow).getTime() - Date.now();
            setClockOffset(offset);
          }
          if (response.data.expiresAt) {
            setExpiresAt(response.data.expiresAt);
            const serverCurrent = response.data.serverNow ? new Date(response.data.serverNow).getTime() : Date.now();
            const remaining = Math.max(0, Math.floor((new Date(response.data.expiresAt).getTime() - serverCurrent) / 1000));
            setTimeLeft(remaining);
          }
        } else {
          setLoadError('Unable to load qualifying exam questions. Please try again.');
        }
      } catch (err: any) {
        if (!mounted) return;
        setLoadError(err?.message || 'Unable to start qualifying exam.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    startExamSession();

    return () => {
      mounted = false;
    };
  }, [preferredComponent]);

  // Server-authoritative timer using clock offset to eliminate client clock skew
  useEffect(() => {
    if (loading || submitted || !expiresAt) return;

    const updateRemaining = () => {
      const estimatedServerNow = Date.now() + clockOffset;
      const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - estimatedServerNow) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        handleSubmit();
      }
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);

    return () => clearInterval(timer);
  }, [loading, submitted, expiresAt, clockOffset, handleSubmit]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (submitted) {
    const finalScore = score ?? 0;

    return (
      <div className="size-full flex items-center justify-center bg-[radial-gradient(circle_at_top,_#fef3c7_0%,_#fff7ed_35%,_#f8fafc_85%)] dark:bg-[radial-gradient(circle_at_top,_rgba(90,167,255,0.14)_0%,_rgba(255,210,77,0.08)_22%,_#08101f_62%)]">
        <div className="max-w-2xl w-full p-8">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center dark:border-slate-700 dark:bg-slate-900">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-blue-500/15">
              <Award className="w-10 h-10 text-blue-600 dark:text-blue-300" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3 dark:text-slate-100">Exam Submitted Successfully</h2>
            <div className="bg-blue-50 rounded-xl p-6 mb-6 dark:bg-blue-500/10">
              <p className="text-sm text-slate-600 mb-2 dark:text-slate-300">Your Score</p>
              <p className="text-5xl font-bold text-blue-600 mb-2">{finalScore}%</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {finalScore >= 80 ? 'Excellent performance!' : finalScore >= 70 ? 'Good job!' : 'Thank you for participating'}
              </p>
            </div>

            <div className={`${score !== null && score >= 0 ? 'bg-yellow-50 border-yellow-200 dark:border-yellow-500/20 dark:bg-yellow-500/10' : 'bg-slate-50 border-slate-200 dark:border-slate-700 dark:bg-slate-800'} border rounded-xl p-6 mb-6`}>
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5 dark:text-yellow-300" />
                <div className="text-left">
                  <p className="font-semibold text-yellow-900 mb-1 dark:text-yellow-100">
                    {submissionResult?.assignedComponent ? 'Component Access Granted' : submissionResult?.status === 'not-qualified' ? 'Qualifying Score Not Reached' : 'Awaiting Available Slot'}
                  </p>
                  <p className="text-sm text-yellow-800 dark:text-yellow-100">
                    {(() => {
                      if (submissionResult?.assignedComponent) {
                        return <>You qualified for <strong>{submissionResult.assignedComponent}</strong>. Continue to enter the student LMS for your assigned component.</>;
                      }
                      if (submissionResult?.status === 'not-qualified') {
                        return <>Your preferred component is <strong>{preferredComponent}</strong>. The NSTP Coordinator may still review or manually approve your application.</>;
                      }
                      return <>Your preferred component is <strong>{preferredComponent}</strong>, but the slot queue is currently full. The NSTP Coordinator can manually approve or reassign your application.</>;
                    })()}
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => onComplete(finalScore, submissionResult || undefined)}
              className="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-8 py-3 rounded-xl hover:opacity-95 transition-opacity font-medium"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="size-full overflow-auto bg-[#fcfaf6] dark:bg-slate-950">
      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <div className="flex justify-end mb-4">
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>

        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2 dark:text-slate-100">NSTP Qualifying Examination</h1>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-slate-600 dark:text-slate-300">Target Track: <strong>{preferredComponent}</strong></p>
                {isCriminologyProgram(user.course || user.degreeProgram, user.school) && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                    SCJE: Mandatory MTS (ROTC)
                  </span>
                )}
                {isTeacherEducationProgram(user.course || user.degreeProgram, user.school) && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200">
                    STE: Mandatory LTS
                  </span>
                )}
              </div>
            </div>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
              timeLeft <= 120
                ? 'text-red-700 bg-red-100 border border-red-300 animate-pulse dark:bg-red-500/25 dark:text-red-200 dark:border-red-500/30'
                : timeLeft <= 600
                ? 'text-amber-800 bg-amber-100 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-500/30'
                : 'text-blue-700 bg-blue-50 border border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/20'
            }`}>
              <Clock className="w-5 h-5" />
              <span className="font-mono font-semibold text-lg">{formatTime(timeLeft)}</span>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5 dark:text-blue-300" />
              <div className="text-sm text-blue-900 dark:text-blue-100">
                <p className="font-semibold mb-1">Important Notice</p>
                <p>
                  {isCriminologyProgram(user.course || user.degreeProgram, user.school)
                    ? 'Your score will place you into your preferred MTS branch (Army or Navy) subject to unit quota availability.'
                    : isTeacherEducationProgram(user.course || user.degreeProgram, user.school)
                    ? 'Your score will finalize your placement into the Literacy Training Service (LTS) field teaching roster.'
                    : 'Your exam score will determine your component placement. Students are ranked by score, and those with the highest scores in each component get priority enrollment based on available slots.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {loadError && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
            <p className="font-semibold">{loadError}</p>
          </div>
        )}

        {loading && (
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <p className="text-slate-600 dark:text-slate-300">Loading qualifying examination questions...</p>
          </div>
        )}

        {/* Question Palette / Navigator */}
        {!loading && questions.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  Question Navigator
                </h3>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {Object.keys(answers).length} of {questions.length} answered
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-emerald-600 inline-block" /> Answered
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-slate-100 border border-slate-300 dark:bg-slate-800 dark:border-slate-600 inline-block" /> Unanswered
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {questions.map((_, idx) => {
                const isAnswered = answers[idx] !== undefined;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => scrollToQuestion(idx)}
                    className={`w-9 h-9 rounded-lg font-semibold text-xs transition-all flex items-center justify-center cursor-pointer ${
                      isAnswered
                        ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700'
                        : 'bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Questions */}
        {!loading && (
          <div className="space-y-6 mb-6">
            {questions.map((q, idx) => (
              <div
                id={`exam-question-${idx}`}
                key={q.id || idx}
                className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 scroll-mt-24"
              >
                <h3 className="font-semibold text-slate-900 mb-4 dark:text-slate-100">
                  {idx + 1}. {q.prompt}
                </h3>
                <div className="space-y-3">
                  {q.options.map((option, optIdx) => (
                    <label
                      key={optIdx}
                      className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                        answers[idx] === optIdx
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10'
                          : 'border-slate-200 hover:border-amber-300 dark:border-slate-700 dark:hover:border-amber-400'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`question-${idx}`}
                        checked={answers[idx] === optIdx}
                        onChange={() => setAnswers({ ...answers, [idx]: optIdx })}
                        className="w-4 h-4 text-amber-600"
                      />
                      <span className="text-slate-700 dark:text-slate-200">{option}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Submit */}
        {!loading && questions.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sticky bottom-0 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  Questions answered: {Object.keys(answers).length} / {questions.length}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Make sure to review all answers before submitting
                </p>
              </div>
              <button
                onClick={() => setConfirmModalOpen(true)}
                className="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-8 py-3 rounded-xl hover:opacity-95 transition-opacity font-medium inline-flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <Send className="w-4 h-4" />
                Submit Examination
              </button>
            </div>
          </div>
        )}

        {/* Pre-submission Confirmation Dialog */}
        <Dialog open={confirmModalOpen} onOpenChange={setConfirmModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <HelpCircle className="w-6 h-6 text-amber-500" />
                Confirm Exam Submission
              </DialogTitle>
              <DialogDescription className="text-slate-600 dark:text-slate-300 pt-2 text-sm leading-relaxed">
                {Object.keys(answers).length < questions.length ? (
                  <span className="block space-y-3">
                    <span className="block p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-200 text-sm">
                      <strong>Attention:</strong> You have answered <strong>{Object.keys(answers).length}</strong> out of <strong>{questions.length}</strong> questions.
                      {' '}{questions.length - Object.keys(answers).length} question(s) remain unanswered.
                    </span>
                    <span className="block">Unanswered questions will be scored as 0. Are you sure you wish to finalize and submit now?</span>
                  </span>
                ) : (
                  <span>
                    You have answered all <strong>{questions.length}</strong> questions. Once submitted, your score will be calculated and your component placement processed.
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer text-sm"
              >
                Review Questions
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmModalOpen(false);
                  handleSubmit();
                }}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-medium hover:opacity-95 transition-opacity cursor-pointer shadow-sm inline-flex items-center gap-2 text-sm"
              >
                <Send className="w-4 h-4" />
                Confirm & Submit
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
