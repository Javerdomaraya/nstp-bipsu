import { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, Clock, AlertCircle, Award, LogOut } from 'lucide-react';
import { loadQualifyingExamResults, saveQualifyingExamResults, syncStudentAccessFromQualifyingResult, NstpComponent, QualifyingExamResult } from '../../data/nstpData';
import type { StudentUser } from '../../services/authUser';
import { apiPost } from '../../services/apiClient';
import { toast } from 'sonner';

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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [timeLeft, setTimeLeft] = useState(3600);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const answersRef = useRef<Record<number, number>>({});
  const questionsRef = useRef<QualifyingQuestion[]>([]);
  const attemptIdRef = useRef<string | null>(null);
  const submittedRef = useRef(false);

  answersRef.current = answers;
  questionsRef.current = questions;
  attemptIdRef.current = attemptId;
  submittedRef.current = submitted;

  const handleSubmit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;

    try {
      const payload = {
        attemptId: attemptIdRef.current,
        preferredComponent,
        answers: Object.entries(answersRef.current).map(([qIdx, optIdx]) => ({
          questionId: questionsRef.current[Number(qIdx)]?.id || `q-${qIdx}`,
          optionIndex: optIdx,
        })),
      };

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
        const finalScore = res.data.score ?? 0;
        setScore(finalScore);
        setSubmitted(true);

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

        const allResults = loadQualifyingExamResults();
        const updatedResults = allResults.some((result) => result.userId === user.id)
          ? allResults.map((result) => (result.userId === user.id ? examResult : result))
          : [...allResults, examResult];

        saveQualifyingExamResults(updatedResults);
        syncStudentAccessFromQualifyingResult(examResult);
        localStorage.setItem(`examResult-${user.id}`, JSON.stringify(examResult));
        toast.success('Exam submitted successfully.');
      } else {
        toast.error('Unable to submit exam. Please try again.');
        submittedRef.current = false;
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not submit exam. Please try again.');
      submittedRef.current = false;
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
            expiresAt: string;
            questions: QualifyingQuestion[];
          };
        } | null>('/nstp/students/me/qualifying-exam/start', { preferredComponent }, null);

        if (!mounted) return;

        if (response?.data?.questions) {
          setQuestions(response.data.questions);
          setAttemptId(response.data.attemptId);
          if (response.data.expiresAt) {
            setExpiresAt(response.data.expiresAt);
            const remaining = Math.max(0, Math.floor((new Date(response.data.expiresAt).getTime() - Date.now()) / 1000));
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

  // Server-authoritative timer: computes remaining seconds directly against server expiresAt
  useEffect(() => {
    if (loading || submitted || !expiresAt) return;

    const updateRemaining = () => {
      const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        handleSubmit();
      }
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);

    return () => clearInterval(timer);
  }, [loading, submitted, expiresAt, handleSubmit]);

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
                    {(() => {
                      const saved = loadQualifyingExamResults().find((result) => result.userId === user.id);
                      return saved?.assignedComponent ? 'Component Access Granted' : saved?.status === 'not-qualified' ? 'Qualifying Score Not Reached' : 'Awaiting Available Slot';
                    })()}
                  </p>
                  <p className="text-sm text-yellow-800 dark:text-yellow-100">
                    {(() => {
                      const saved = loadQualifyingExamResults().find((result) => result.userId === user.id);
                      if (saved?.assignedComponent) {
                        return <>You qualified for <strong>{saved.assignedComponent}</strong>. Continue to enter the student LMS for your assigned component.</>;
                      }
                      if (saved?.status === 'not-qualified') {
                        return <>Your preferred component is <strong>{preferredComponent}</strong>. The NSTP Coordinator may still review or manually approve your application.</>;
                      }
                      return <>Your preferred component is <strong>{preferredComponent}</strong>, but the slot queue is currently full. The NSTP Coordinator can manually approve or reassign your application.</>;
                    })()}
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => onComplete(finalScore, loadQualifyingExamResults().find((result) => result.userId === user.id))}
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
              <p className="text-slate-600 dark:text-slate-300">Preferred Component: <strong>{preferredComponent}</strong></p>
            </div>
            <div className="flex items-center gap-2 text-orange-700 bg-orange-100 px-4 py-2 rounded-xl dark:bg-orange-500/15 dark:text-orange-200">
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
                  Your exam score will determine your component placement. Students are ranked by score, and
                  those with the highest scores in each component get priority enrollment based on available slots.
                  If your preferred component is full, you will be assigned to another component with vacancies.
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

        {/* Questions */}
        {!loading && (
          <div className="space-y-6 mb-6">
            {questions.map((q, idx) => (
              <div key={q.id || idx} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
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
                onClick={handleSubmit}
                disabled={Object.keys(answers).length < questions.length}
                className="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-8 py-3 rounded-xl hover:opacity-95 transition-opacity font-medium disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                Submit Examination
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
