import { useEffect, useState } from 'react';
import { TrendingUp, Award, Clock, Target, CheckCircle, BookOpen, Flame, Activity, ArrowLeft } from 'lucide-react';
import { NstpAssessment, NstpModule } from '../../../data/nstpData';
import { PortalStatCard } from '../../../components/ui/portal';
import { fetchManagedModules } from '../../../services/modules';
import { fetchStudentAssessments } from '../../../services/assessments';
import type { AuthenticatedUser } from '../../../services/authUser';
import { apiGet } from '../../../services/apiClient';

type AssessmentResult = {
  score: number;
  date: string;
  passed: boolean;
};

export default function ProgressTracker({ user, onBack }: { user: AuthenticatedUser; onBack?: () => void }) {
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [assessments, setAssessments] = useState<Record<string, AssessmentResult>>({});
  const [modules, setModules] = useState<NstpModule[]>([]);
  const [publishedAssessments, setPublishedAssessments] = useState<NstpAssessment[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchManagedModules('student'),
      fetchStudentAssessments(),
      apiGet<{ success: boolean; data: { progress: Array<{ moduleId: string; completedAt: string | null }>; attempts: Array<{ quizId: string | null; score: number; submittedAt: string; passed: boolean }> } }>('/nstp/students/me/progress'),
    ]).then(([moduleRows, assessmentRows, response]) => {
      setModules(moduleRows);
      setPublishedAssessments(assessmentRows);
      setProgress(Object.fromEntries(response.data.progress.map((entry) => [entry.moduleId, Boolean(entry.completedAt)])));
      const latest = new Map<string, AssessmentResult>();
      response.data.attempts.forEach((attempt) => {
        if (!attempt.quizId || latest.has(attempt.quizId)) return;
        latest.set(attempt.quizId, { score: Number(attempt.score || 0), date: attempt.submittedAt, passed: Boolean(attempt.passed) });
      });
      setAssessments(Object.fromEntries(latest));
      setLoadError(null);
    }).catch((error) => setLoadError(error instanceof Error ? error.message : 'Unable to load official progress.'));
  }, [user.id]);
  const totalModules = modules.length;
  const totalContactHours = modules.reduce((total, module) => total + module.hours, 0);
  const completedModules = modules.filter((module) => progress[module.id]).length;
  const completedAssessments = Object.keys(assessments).length;
  const passedAssessments = (Object.values(assessments) as AssessmentResult[]).filter((result) => result.passed).length;
  const averageScore = Object.keys(assessments).length > 0
    ? Math.round((Object.values(assessments) as AssessmentResult[]).reduce((acc, r) => acc + r.score, 0) / Object.keys(assessments).length)
    : 0;
  const moduleCompletionRatio = totalModules > 0 ? completedModules / totalModules : 0;
  const estimatedHours = Math.round(moduleCompletionRatio * totalContactHours);
  const improvementIndex = Math.min(100, Math.round((averageScore * 0.6) + (moduleCompletionRatio * 40)));

  const nextModule = modules.find((module) => !progress[module.id]);
  const nextAssessment = publishedAssessments.find((assessment) => !assessments[assessment.id]);

  const milestones = [
    { title: 'First Module Completed', completed: completedModules >= 1, icon: BookOpen },
    { title: '5 Assessments Passed', completed: passedAssessments >= 5, icon: CheckCircle },
    { title: '15 Contact Hours', completed: estimatedHours >= 15, icon: Clock },
    { title: 'Major Exam Attempted', completed: publishedAssessments.some((assessment) => assessment.type === 'exam' && assessments[assessment.id]), icon: Award },
    { title: 'All Modules Completed', completed: completedModules === totalModules, icon: Target },
    { title: 'All Published Tests Attempted', completed: completedAssessments >= publishedAssessments.length, icon: Award }
  ];

  return (
    <div className="bento-screen size-full bg-[#f8fafc] dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex h-full max-w-7xl flex-col gap-4 p-2 md:p-4">
        {onBack && (
          <button
            onClick={onBack}
            className="module-btn clickable-button mb-1 w-fit px-3 py-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
        )}
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Your Progress</h2>
        {loadError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{loadError}</div>}

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="bento-panel p-5 lg:col-span-2">
            <p className="text-xs uppercase tracking-[0.16em] font-semibold text-emerald-700 mb-2">Performance Snapshot</p>
            <h3 className="text-lg font-bold text-slate-900 mb-1">{passedAssessments}/{completedAssessments} passed assessments</h3>
            <p className="text-sm text-slate-600">Stay above your passing threshold and focus on weak modules before major exams.</p>
          </div>
          <div className="bento-panel p-5">
            <p className="text-xs uppercase tracking-[0.16em] font-semibold text-rose-700 mb-2">Learning Momentum</p>
            <h3 className="text-lg font-bold text-slate-900 mb-1">{improvementIndex}% improvement index</h3>
            <p className="text-sm text-slate-600">Calculated from your assessment performance and module completion rate.</p>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <PortalStatCard
            title="Modules"
            value={<>{completedModules}<span className="text-xl text-slate-600 dark:text-slate-300">/{totalModules}</span></>}
            icon={<BookOpen className="h-5 w-5" />}
            tone="gold"
          >
            <div className="mt-3 bg-slate-100 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${moduleCompletionRatio * 100}%` }}
              />
            </div>
          </PortalStatCard>

          <PortalStatCard
            title="Contact Hours"
            value={<>{estimatedHours}<span className="text-xl text-slate-600 dark:text-slate-300">/{totalContactHours}</span></>}
            icon={<Clock className="h-5 w-5" />}
            tone="green"
          >
            <div className="mt-3 bg-slate-100 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full transition-all"
                style={{ width: `${moduleCompletionRatio * 100}%` }}
              />
            </div>
          </PortalStatCard>

          <PortalStatCard
            title="Assessments"
            value={<>{completedAssessments}<span className="text-xl text-slate-600 dark:text-slate-300">/{publishedAssessments.length}</span></>}
            icon={<CheckCircle className="h-5 w-5" />}
            tone="blue"
          >
            <div className="mt-3 bg-slate-100 rounded-full h-2">
              <div
                className="bg-purple-600 h-2 rounded-full transition-all"
                style={{ width: `${publishedAssessments.length > 0 ? (completedAssessments / publishedAssessments.length) * 100 : 0}%` }}
              />
            </div>
          </PortalStatCard>

          <PortalStatCard
            title="Avg Score"
            value={<>{averageScore}<span className="text-xl text-slate-600 dark:text-slate-300">%</span></>}
            icon={<Award className="h-5 w-5" />}
            tone="slate"
          >
            <div className="mt-3 bg-slate-100 rounded-full h-2">
              <div
                className="bg-orange-600 h-2 rounded-full transition-all"
                style={{ width: `${averageScore}%` }}
              />
            </div>
          </PortalStatCard>
        </div>

        {/* Milestones */}
        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="bento-panel min-h-0 p-4">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-amber-600" />
            Milestones
          </h3>
          <div className="bento-scroll grid grid-cols-1 md:grid-cols-2 gap-3">
            {milestones.map((milestone, idx) => {
              const Icon = milestone.icon;
              return (
                <div
                  key={idx}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 ${
                    milestone.completed
                      ? 'border-green-200 bg-green-50'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${
                    milestone.completed ? 'bg-green-600' : 'bg-slate-300'
                  }`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className={`font-medium ${
                      milestone.completed ? 'text-green-900' : 'text-slate-600'
                    }`}>
                      {milestone.title}
                    </p>
                  </div>
                  {milestone.completed && (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bento-panel min-h-0 p-4">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-600" />
            Recent Activity
          </h3>
          <div className="bento-scroll space-y-3">
            {(Object.entries(assessments) as [string, AssessmentResult][])
              .slice(-5)
              .reverse()
              .map(([id, result]) => (
                <div key={id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Award className={`w-5 h-5 ${result.passed ? 'text-green-600' : 'text-red-600'}`} />
                    <div>
                      <p className="font-medium text-slate-900">Assessment Completed</p>
                      <p className="text-sm text-slate-600">
                        Score: {result.score}% • {new Date(result.date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-lg ${
                    result.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    <span className="text-xs font-semibold">
                      {result.passed ? 'PASSED' : 'FAILED'}
                    </span>
                  </div>
                </div>
              ))}
            {Object.keys(assessments).length === 0 && (
              <p className="text-center text-slate-500 py-8">No activity yet</p>
            )}
          </div>
        </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bento-panel p-4">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="w-4 h-4 text-rose-600" />
              <p className="font-semibold text-slate-900">Focus Area</p>
            </div>
            <p className="text-sm text-slate-600">
              {averageScore >= 80
                ? 'You are in a strong position. Prioritize final project documentation and sustained attendance.'
                : 'Review Modules 3 to 5 and retake low-scoring assessments to boost your standing.'}
            </p>
          </div>
          <div className="bento-panel p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              <p className="font-semibold text-slate-900">Suggested Weekly Goal</p>
            </div>
            <p className="text-sm text-slate-600">Complete 2 sections and 1 assessment attempt this week to keep your momentum high.</p>
          </div>
          <div className="bento-panel p-4 sm:col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-blue-700" />
              <p className="font-semibold text-slate-900">Personalized Next Step</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Next module</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{nextModule?.title || 'All modules completed'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Next assessment</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{nextAssessment?.title || 'All published assessments attempted'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
