import { useState, useEffect } from 'react';
import { FileText, Clock, AlertCircle, Award, LogOut } from 'lucide-react';
import { autoAssignQualifyingResult, loadQualifyingExamResults, saveQualifyingExamResults, syncStudentAccessFromQualifyingResult, NstpComponent, QualifyingExamResult } from '../../data/nstpData';
import type { StudentUser } from '../../services/authUser';
import { apiPost } from '../../services/apiClient';
import { toast } from 'sonner';

const EXAM_QUESTIONS = [
  {
    question: 'What is the primary objective of the National Service Training Program?',
    options: [
      'To provide military training to all students',
      'To promote civic consciousness and defense preparedness',
      'To replace regular academic courses',
      'To provide employment after graduation'
    ],
    correct: 1
  },
  {
    question: 'Which government agency oversees the implementation of NSTP?',
    options: ['Department of Education', 'Commission on Higher Education', 'Department of National Defense', 'All of the above'],
    correct: 3
  },
  {
    question: 'What does CWTS stand for?',
    options: [
      'Community Welfare Training Service',
      'Civic Welfare Training Service',
      'Community Work Training Service',
      'Civic Work and Training Service'
    ],
    correct: 1
  },
  {
    question: 'How many hours of training are required for NSTP completion?',
    options: ['25 hours', '36 hours', '54 hours', '72 hours'],
    correct: 2
  },
  {
    question: 'Which component focuses on teaching literacy to communities?',
    options: ['CWTS', 'LTS', 'MTS', 'ROTC'],
    correct: 1
  },
  {
    question: 'What is a key principle of community development discussed in the seminars?',
    options: [
      'Top-down approach',
      'Participatory development',
      'Individual focus',
      'Government-only initiative'
    ],
    correct: 1
  },
  {
    question: 'In disaster risk reduction, what does DRRM stand for?',
    options: [
      'Disaster Response and Recovery Management',
      'Disaster Risk Reduction and Management',
      'Defense and Risk Response Mechanism',
      'Disaster Relief and Rescue Mission'
    ],
    correct: 1
  },
  {
    question: 'Which of the following is NOT a component of NSTP?',
    options: ['CWTS', 'LTS', 'MTS', 'JROTC'],
    correct: 3
  },
  {
    question: 'What is the main focus of MTS (Military Training Service)?',
    options: [
      'Community service',
      'Literacy training',
      'Military training and national defense preparation',
      'Environmental conservation'
    ],
    correct: 2
  },
  {
    question: 'According to the Philippine Constitution, what is emphasized regarding citizenship?',
    options: [
      'Rights only',
      'Duties only',
      'Both rights and responsibilities',
      'Neither rights nor duties'
    ],
    correct: 2
  }
];

export default function QualifyingExam({ user, preferredComponent, onComplete, onLogout }: { user: StudentUser; preferredComponent: NstpComponent; onComplete: (score: number | null, assignment?: QualifyingExamResult) => void; onLogout: () => void }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [timeLeft, setTimeLeft] = useState(3600); // 60 minutes
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          handleSubmit();
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSubmit = () => {
    if (submitted) return;

    let correct = 0;
    EXAM_QUESTIONS.forEach((q, idx) => {
      if (answers[idx] === q.correct) {
        correct++;
      }
    });

    const finalScore = Math.round((correct / EXAM_QUESTIONS.length) * 100);
    setScore(finalScore);
    setSubmitted(true);

    // Save exam result
    const examResult: QualifyingExamResult = {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      preferredComponent,
      score: finalScore,
      timestamp: new Date().toISOString()
    };

    const allResults = loadQualifyingExamResults();
    const assignedResult = autoAssignQualifyingResult(examResult, allResults);
    const updatedResults = allResults.some((result) => result.userId === user.id)
      ? allResults.map((result) => (result.userId === user.id ? assignedResult : result))
      : [...allResults, assignedResult];

    saveQualifyingExamResults(updatedResults);
    syncStudentAccessFromQualifyingResult(assignedResult);

    // Save to user's record locally and persist to server
    localStorage.setItem(`examResult-${user.id}`, JSON.stringify(assignedResult));
    apiPost('/nstp/students/me/qualifying-results', assignedResult)
      .then(() => toast.success('Exam result synced with server.'))
      .catch((err) => console.warn('Could not sync exam result to server:', err));
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

        {/* Questions */}
        <div className="space-y-6 mb-6">
          {EXAM_QUESTIONS.map((q, idx) => (
            <div key={idx} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h3 className="font-semibold text-slate-900 mb-4 dark:text-slate-100">
                {idx + 1}. {q.question}
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

        {/* Submit */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sticky bottom-0 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">
                Questions answered: {Object.keys(answers).length} / {EXAM_QUESTIONS.length}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Make sure to review all answers before submitting
              </p>
            </div>
            <button
              onClick={handleSubmit}
              disabled={Object.keys(answers).length < EXAM_QUESTIONS.length}
              className="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-8 py-3 rounded-xl hover:opacity-95 transition-opacity font-medium disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              Submit Examination
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
