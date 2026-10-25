import { useState, useEffect, useMemo } from 'react';
import { Calendar, Clock, Users, Video, CheckCircle, Play, Lock, Award, Sparkles, ShieldCheck, ArrowRight, LayoutDashboard, BookOpen, ExternalLink } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/common/StatCard';
import { loadModules, loadAssessments, type NstpModule, type NstpAssessment } from '../../data/nstpData';
import type { StudentUser } from '../../services/authUser';
import { toSafeEmbedUrl, toSafeExternalUrl } from '../../utils/moduleUrls';

const shuffleArray = <T,>(array: T[]): T[] => {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const STORAGE_KEY_PREFIX = 'seminars-';

type SeminarProgress = {
  completed: boolean;
  score: number;
  completedDate?: string;
};

type AssessmentQuestion = {
  question: string;
  options: string[];
  correct: number;
};

export default function GeneralEducation({ user, onComplete, onLogout }: { user: StudentUser; onComplete: () => void; onLogout?: () => void; }) {
  const [modules, setModules] = useState<NstpModule[]>([]);
  const [assessments, setAssessments] = useState<NstpAssessment[]>([]);
  const [progress, setProgress] = useState<Record<string, SeminarProgress>>({});
  const [selectedModule, setSelectedModule] = useState<NstpModule | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [assessmentActive, setAssessmentActive] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [assessmentQuestions, setAssessmentQuestions] = useState<AssessmentQuestion[]>([]);
  const [mediaConsumed, setMediaConsumed] = useState<Record<string, boolean>>({});

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const MEDIA_CONSUMED_KEY = `nstp-media-consumed-${user.id}`;

  const commonModules = useMemo(() =>
    modules.filter((m) => (m.component || 'Common') === 'Common'),
    [modules]
  );

  useEffect(() => {
    setModules(loadModules());
    setAssessments(loadAssessments());

    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}${user.id}`);
    if (saved) {
      setProgress(JSON.parse(saved));
    }

    const savedMedia = localStorage.getItem(MEDIA_CONSUMED_KEY);
    if (savedMedia) {
      try {
        setMediaConsumed(JSON.parse(savedMedia));
      } catch { /* ignore */ }
    }
  }, [user.id]);

  const totalHours = commonModules.reduce((acc, m) => acc + (progress[m.id]?.completed ? m.hours : 0), 0);
  const completedCount = commonModules.filter((m) => progress[m.id]?.completed).length;
  const canComplete = totalHours >= 25 && completedCount === commonModules.length;
  const averageScore = completedCount > 0
    ? Math.round(commonModules.filter((m) => progress[m.id]?.completed).reduce((acc, m) => acc + (progress[m.id]?.score || 0), 0) / completedCount)
    : 0;
  const hoursPercent = Math.min(100, Math.round((totalHours / 25) * 100));
  const seminarPercent = Math.min(100, Math.round((completedCount / commonModules.length) * 100));
  const nextModule = commonModules.find((m, index) => !progress[m.id]?.completed && (index === 0 || progress[commonModules[index - 1]?.id]?.completed));
  const remainingHours = Math.max(0, 25 - totalHours);
  const stageSteps = [
    { label: 'Orientation', complete: true },
    { label: 'Seminars', complete: completedCount === commonModules.length },
    { label: 'Assessments', complete: canComplete },
    { label: 'Component', complete: false },
  ];

  const getLinkedAssessment = (moduleId: string): NstpAssessment | undefined => {
    return assessments.find((a) => a.moduleId === moduleId && a.status === 'published');
  };

  const joinSeminar = (seminar: NstpModule) => {
    setSelectedModule(seminar);
    setIsLive(true);
  };

  const toggleMediaConsumed = () => {
    if (!selectedModule) return;
    const next = {
      ...mediaConsumed,
      [selectedModule.id]: !mediaConsumed[selectedModule.id],
    };
    setMediaConsumed(next);
    localStorage.setItem(MEDIA_CONSUMED_KEY, JSON.stringify(next));
  };

  const startAssessment = () => {
    if (!selectedModule) return;
    if (!mediaConsumed[selectedModule.id]) return;

    const linked = getLinkedAssessment(selectedModule.id);
    if (linked) {
      const shuffled = shuffleArray(linked.questions);
      const count = linked.questionsToShow > 0 ? Math.min(linked.questionsToShow, shuffled.length) : shuffled.length;
      setAssessmentQuestions(
        shuffled.slice(0, count).map((q) => ({
          question: q.prompt,
          options: q.options,
          correct: q.correctIndex,
        }))
      );
    } else {
      setAssessmentQuestions([]);
    }

    setIsLive(false);
    setAssessmentActive(true);
    setAnswers({});
  };

  const completeAssessment = () => {
    if (!selectedModule) return;

    const correct = assessmentQuestions.reduce((acc, q, idx) => {
      return answers[idx] === q.correct ? acc + 1 : acc;
    }, 0);
    const total = assessmentQuestions.length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;

    const updatedProgress: Record<string, SeminarProgress> = {
      ...progress,
      [selectedModule.id]: { completed: true, score, completedDate: new Date().toISOString() },
    };
    setProgress(updatedProgress);
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${user.id}`, JSON.stringify(updatedProgress));
    setSelectedModule(null);
    setAssessmentActive(false);
  };

  // Media Consumption View
  if (isLive && selectedModule) {
    const videoEmbedUrl = toSafeEmbedUrl(selectedModule.videoUrl);
    const documentUrl = toSafeExternalUrl(selectedModule.documentLink);
    const meetingUrl = toSafeExternalUrl(selectedModule.meetingLink);
    const hasVideo = !!videoEmbedUrl;
    const hasDocument = !!documentUrl;
    const hasMeeting = !!meetingUrl;
    const hasContent = hasVideo || hasDocument || hasMeeting;
    const isConsumed = mediaConsumed[selectedModule.id] || false;

    return (
      <div className="size-full flex flex-col bg-slate-900">
        <div className="flex-1 flex items-center justify-center bg-slate-800 relative overflow-hidden">
          {hasVideo ? (
            <iframe
              src={videoEmbedUrl}
              className="w-full h-full"
              sandbox="allow-scripts allow-same-origin allow-presentation"
              referrerPolicy="no-referrer"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              title={selectedModule.title}
            />
          ) : hasDocument ? (
            <div className="text-center p-8">
              <ExternalLink className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <p className="text-white text-lg mb-4">Document available for this module</p>
              <a
                href={documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                Open External Document
              </a>
            </div>
          ) : hasMeeting ? (
            <div className="text-center p-8">
              <Users className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <p className="text-white text-lg mb-4">Meeting link available for this module</p>
              <a
                href={meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                className="inline-flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-xl hover:bg-green-700 transition-colors font-medium"
              >
                <Video className="w-4 h-4" />
                Join External Meeting
              </a>
            </div>
          ) : (
            <div className="text-center p-8">
              <BookOpen className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <p className="text-white text-lg">No content has been attached to this module yet.</p>
              <p className="text-slate-400 mt-2">The admin has not added a video, document, or meeting link.</p>
            </div>
          )}
        </div>

        <div className="bg-slate-900 border-t border-slate-700 p-6">
          <div className="max-w-5xl mx-auto">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">{selectedModule.title}</h2>
                <p className="text-slate-400">{selectedModule.description}</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={toggleMediaConsumed}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors ${
                    isConsumed
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-slate-700 text-white hover:bg-slate-600'
                  }`}
                >
                  <CheckCircle className="w-4 h-4" />
                  {isConsumed ? 'Mark as Unwatched' : 'Mark as Watched'}
                </button>
                <button
                  onClick={startAssessment}
                  disabled={!isConsumed}
                  className={`px-6 py-3 rounded-xl font-medium transition-opacity ${
                    isConsumed
                      ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:opacity-95'
                      : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  Proceed to Assessment
                </button>
                <button
                  onClick={() => {
                    setSelectedModule(null);
                    setIsLive(false);
                  }}
                  className="px-6 py-3 border border-slate-600 text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  Leave Session
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {selectedModule.hours} hours
              </span>
              {selectedModule.scheduledDate && (
                <span className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {selectedModule.scheduledDate}
                </span>
              )}
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                {selectedModule.speaker}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Assessment View
  if (assessmentActive && selectedModule) {
    const answeredCount = Object.keys(answers).length;

    return (
      <div className="size-full overflow-auto bg-[#fcfaf6] dark:bg-slate-950">
        <div className="max-w-4xl mx-auto p-4 md:p-8">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 mb-6 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                onClick={() => {
                  setAssessmentActive(false);
                  setSelectedModule(null);
                  setAnswers({});
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition-all hover:-translate-y-0.5 hover:bg-blue-100 hover:shadow-sm dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100 dark:hover:bg-blue-500/20"
              >
                <LayoutDashboard className="w-4 h-4" />
                Return to Dashboard
              </button>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2 dark:text-slate-100">
              Assessment: {selectedModule.title}
            </h1>
            <p className="text-slate-600 dark:text-slate-300">
              Complete the assessment based on the seminar by {selectedModule.speaker}
            </p>
            {assessmentQuestions.length === 0 && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                No published assessment is linked to this module yet. Mark as complete to proceed.
              </div>
            )}
          </div>

          {assessmentQuestions.length > 0 && (
            <>
              <div className="space-y-6 mb-6">
                {assessmentQuestions.map((item, index) => (
                  <div key={index} className="bg-white rounded-2xl border border-slate-200 p-6 dark:border-slate-700 dark:bg-slate-900">
                    <h3 className="font-semibold text-slate-900 mb-4 dark:text-slate-100">
                      Question {index + 1}: {item.question}
                    </h3>
                    <div className="space-y-3">
                      {item.options.map((option, idx) => (
                        <label
                          key={idx}
                          className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 hover:shadow-sm dark:hover:border-blue-400 dark:hover:bg-blue-500/10 ${
                            answers[index] === idx
                              ? 'border-amber-500 bg-amber-50 shadow-sm dark:bg-amber-500/10'
                              : 'border-slate-200 hover:border-amber-300 dark:border-slate-700 dark:hover:border-amber-400'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q-${index}`}
                            checked={answers[index] === idx}
                            onChange={() => setAnswers({ ...answers, [index]: idx })}
                            className="w-4 h-4 text-amber-600"
                          />
                          <span className="text-slate-700 dark:text-slate-200">{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-6 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {answeredCount} / {assessmentQuestions.length} answered
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      onClick={() => setAssessmentActive(false)}
                      className="px-6 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={completeAssessment}
                      disabled={answeredCount < assessmentQuestions.length}
                      className="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-8 py-2 rounded-lg disabled:bg-slate-300 disabled:cursor-not-allowed"
                    >
                      Submit Assessment
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {assessmentQuestions.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  No questions to answer. You can still mark this seminar as complete.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => setAssessmentActive(false)}
                    className="px-6 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={completeAssessment}
                    className="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-8 py-2 rounded-lg"
                  >
                    Mark as Complete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main Seminar Schedule View
  const initials = user.name ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : 'ST';
  const today = new Date().toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <AppShell
      portalLabel="Student Portal"
      sidebarOpen={sidebarOpen}
      onSidebarToggle={setSidebarOpen}
      avatarLabel={initials}
      accountLabel="Student"
      accountTitle={user.name}
      accountSubtitle={user.email}
      accountMeta={
        <div className="flex items-center gap-2 text-xs text-white/75">
          <Calendar className="h-4 w-4 text-[#E5B73B]" />
          {today}
        </div>
      }
      onLogout={onLogout}
      sidebarGroups={[
        {
          label: 'Enrolment Track',
          items: [
            {
              label: 'General Education',
              icon: BookOpen,
              active: true,
              onClick: () => setSidebarOpen(false),
            },
          ],
        },
      ]}
      header={
        <PageHeader
          eyebrow="Student Workspace"
          title="General Education"
          subtitle="Complete Common Module seminars and pass assessments to unlock NSTP component selection."
          onMenuClick={() => setSidebarOpen(true)}
          actionsSlot={
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                <Clock className="h-3.5 w-3.5" />
                {totalHours}/25 hrs
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                <CheckCircle className="h-3.5 w-3.5" />
                {completedCount}/{commonModules.length} seminars
              </span>
            </div>
          }
        />
      }
    >
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Hero & Progress Row */}
        <div className="grid gap-4 xl:grid-cols-12">
          {/* Hero Banner with Next Action */}
          <section className="relative overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-[#073b8e] via-[#105bd8] to-[#09a6d8] p-4 text-white shadow-sm sm:p-6 dark:border-blue-400/30 xl:col-span-8">
            <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full border border-white/20" />
            <div className="absolute bottom-0 right-0 h-32 w-64 bg-gradient-to-l from-amber-300/30 to-transparent" />
            <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-end">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/12 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Required stage
                </span>
                <h1 className="mt-3 text-xl font-bold leading-tight sm:text-2xl md:text-3xl">General Education for NSTP readiness</h1>
                <p className="mt-2 text-xs leading-relaxed text-blue-50 sm:text-sm">
                  Finish the 25-hour seminar track, pass each short assessment, then unlock component selection for CWTS, LTS, MTS Army, or MTS Navy.
                </p>
                <div className="mt-3.5 flex flex-wrap gap-2 text-xs font-medium text-blue-50">
                  <span className="rounded-full bg-white/14 px-2.5 py-1">25 contact hours</span>
                  <span className="rounded-full bg-white/14 px-2.5 py-1">{commonModules.length} guided seminars</span>
                  <span className="rounded-full bg-white/14 px-2.5 py-1">Assessment gated</span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/20 bg-white/14 p-3.5 backdrop-blur-md sm:p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-100">Next action</p>
                {nextModule ? (
                  <>
                    <p className="mt-1.5 text-base font-semibold leading-snug sm:text-lg">{nextModule.title.replace('Seminar ', 'S')}</p>
                    <p className="mt-1 text-xs text-blue-50">{nextModule.scheduledDate}{nextModule.scheduledTime ? ` at ${nextModule.scheduledTime}` : ''}</p>
                    <button
                      onClick={() => joinSeminar(nextModule)}
                      className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-blue-800 shadow-sm transition-transform hover:-translate-y-0.5 sm:text-sm"
                    >
                      <Play className="h-4 w-4" />
                      Join available seminar
                    </button>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-base font-semibold sm:text-lg">All seminars cleared</p>
                    <p className="mt-1 text-xs text-blue-50">Proceed when the completion button appears below.</p>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Unlock Progress & Stage Steps */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900 xl:col-span-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">Unlock progress</p>
                <h3 className="mt-1 text-xl font-bold text-slate-950 sm:text-2xl dark:text-slate-100">{hoursPercent}% ready</h3>
              </div>
              <div className="relative grid h-16 w-16 shrink-0 place-items-center rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(#2563eb ${hoursPercent * 3.6}deg, rgba(226,232,240,0.9) 0deg)` }} />
                <div className="relative grid h-11 w-11 place-items-center rounded-full bg-white text-xs font-bold text-blue-700 dark:bg-slate-900 dark:text-blue-200">{hoursPercent}%</div>
              </div>
            </div>
            <div className="mt-4 space-y-2.5">
              {stageSteps.map((step, index) => (
                <div key={step.label} className="flex items-center gap-2.5">
                  <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${step.complete ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-100' : index === 1 ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-100' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                    {step.complete ? <CheckCircle className="h-3.5 w-3.5" /> : index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-900 dark:text-slate-100">{step.label}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className={`h-full rounded-full ${step.complete ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: step.complete ? '100%' : index === 1 ? `${seminarPercent}%` : '0%' }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* High-Hierarchy Core Metric Cards */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="Contact Hours"
            value={`${totalHours}/25`}
            detail={remainingHours > 0 ? `${remainingHours} hrs remaining to unlock component` : '25 contact hours fulfilled'}
            icon={Clock}
            tone={totalHours >= 25 ? 'success' : 'warning'}
            badge={`${hoursPercent}%`}
            progress={hoursPercent}
          />
          <StatCard
            title="Seminars Completed"
            value={`${completedCount}/${commonModules.length}`}
            detail={commonModules.length - completedCount > 0 ? `${commonModules.length - completedCount} seminar(s) remaining` : 'All seminars completed'}
            icon={Video}
            tone={completedCount === commonModules.length ? 'success' : 'primary'}
            badge={`${seminarPercent}%`}
            progress={seminarPercent}
          />
          <StatCard
            title="Average Score"
            value={`${averageScore}%`}
            detail={completedCount > 0 ? 'Based on completed seminar assessments' : 'No assessments completed yet'}
            icon={Award}
            tone={averageScore >= 75 ? 'success' : 'default'}
          />
        </section>

        {/* Seminar Schedule */}
        <section className="grid gap-3 sm:gap-4 md:grid-cols-2">
          {commonModules.map((mod, index) => {
            const semProgress = progress[mod.id];
            const isLocked = index > 0 && !progress[commonModules[index - 1]?.id]?.completed;

            return (
              <div
                key={mod.id}
                className={`group relative overflow-hidden rounded-2xl border p-4 shadow-sm transition-all sm:p-5 dark:text-slate-100 ${
                  semProgress?.completed
                    ? 'border-green-200 bg-green-50/70 dark:border-green-500/20 dark:bg-green-500/10'
                    : isLocked
                    ? 'border-slate-200 bg-slate-50/80 opacity-75 dark:border-slate-800 dark:bg-slate-900/60'
                    : 'border-blue-200 bg-white dark:border-blue-500/20 dark:bg-slate-900'
                }`}
              >
                {!isLocked && !semProgress?.completed && <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-700 via-cyan-500 to-amber-400" />}
                <div className="flex flex-col gap-3 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2.5 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        Seminar {index + 1}
                      </span>
                      {semProgress?.completed && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-100">
                          <CheckCircle className="h-3 w-3" /> Completed
                        </span>
                      )}
                      {isLocked && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          <Lock className="h-3 w-3" /> Locked
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold leading-snug text-slate-950 sm:text-lg dark:text-slate-100">{mod.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600 sm:text-sm dark:text-slate-300">{mod.description}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {mod.speaker || 'TBA'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {mod.scheduledDate || 'TBA'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {mod.scheduledTime || 'TBA'} ({mod.hours}h)
                      </span>
                    </div>

                    {mod.speakerPosition && (
                      <p className="mt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">{mod.speakerPosition}</p>
                    )}

                    {semProgress?.completed && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-white/70 px-3 py-2 dark:border-emerald-500/20 dark:bg-slate-950/40">
                        <Award className="h-4 w-4 text-green-600" />
                        <span className="text-xs font-semibold text-green-700 dark:text-green-300">
                          Score: {semProgress.score}% • Completed on {new Date(semProgress.completedDate || '').toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="pt-1">
                    <button
                      onClick={() => !isLocked && !semProgress?.completed && joinSeminar(mod)}
                      disabled={isLocked || semProgress?.completed}
                      className={`inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all sm:w-auto sm:text-sm ${
                        semProgress?.completed
                          ? 'bg-green-100 text-green-700 cursor-default dark:bg-green-500/15 dark:text-green-100'
                          : isLocked
                          ? 'bg-slate-200 text-slate-500 cursor-not-allowed dark:bg-slate-800 dark:text-slate-400'
                          : 'bg-gradient-to-r from-blue-700 to-cyan-500 text-white shadow-sm hover:-translate-y-0.5 hover:opacity-95'
                      }`}
                    >
                      {semProgress?.completed ? (
                        <>
                          <CheckCircle className="h-4 w-4" />
                          Completed
                        </>
                      ) : isLocked ? (
                        <>
                          <Lock className="h-4 w-4" />
                          Locked
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4" />
                          Join Seminar
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {/* Complete Button */}
        {canComplete && (
          <div className="rounded-2xl border-2 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-5 text-center shadow-sm sm:p-8 dark:border-green-500/20 dark:from-slate-900 dark:to-slate-800 dark:text-slate-100">
            <div className="mb-2 flex items-center justify-center gap-2">
              <CheckCircle className="h-7 w-7 text-green-600" />
              <h3 className="text-xl font-bold text-slate-950 sm:text-2xl dark:text-slate-100">Congratulations!</h3>
            </div>
            <p className="mx-auto max-w-xl text-xs text-slate-600 sm:text-sm dark:text-slate-300">
              You've completed all {commonModules.length} seminars totaling {totalHours} contact hours.
              You can now proceed to select your NSTP component.
            </p>
            <button
              onClick={onComplete}
              className="mt-4 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-green-700"
            >
              <Sparkles className="h-5 w-5" />
              Proceed to Component Selection
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
