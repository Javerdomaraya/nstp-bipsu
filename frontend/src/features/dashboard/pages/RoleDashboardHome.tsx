import { useEffect, useState } from 'react';
import {
  Award,
  Bell,
  BookOpen,
  BookMarked,
  CalendarDays,
  ChevronRight,
  CheckCircle,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  Megaphone,
  MessageSquare,
  ShieldCheck,
  Target,
  Timer,
  TrendingUp,
  Upload,
  UserCheck,
  Users,
  Video,
} from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import StatCard from '../../../components/common/StatCard';
import DataTable, { ColumnDef } from '../../../components/common/DataTable';
import type { NstpModule } from '../../../data/nstpData';
import { useStudents, useModules, useAssessments, usePendingRegistrations } from '../../../hooks/index';
import { getCurrentSchoolYear } from '../../../utils/academicYear';
import { getCurrentAcademicYear } from '../../../utils/academicYear';
import { apiGet } from '../../../services/apiClient';
import type { AuthenticatedUser } from '../../../services/authUser';
import type { SemesterGrade } from '../../../services/grades';

type RoleDashboardHomeProps = {
  /**
   * The signed-in session. It was `NstpAccount & Record<string, any>`, which no
   * session can actually satisfy and whose index signature turned every field
   * read here into `any`.
   */
  user: AuthenticatedUser;
  role: 'admin' | 'student' | 'facilitator' | 'coordinator';
  onNavigate?: (target: string) => void;
};

const componentColors: Record<string, string> = {
  CWTS: '#10b981',
  LTS: '#2563eb',
  'MTS (Army)': '#f59e0b',
  'MTS (Navy)': '#6366f1',
  'CWTS (Coast Guard)': '#06b6d4',
};

const roleCopy = {
  admin: {
    eyebrow: 'Admin Portal',
    title: 'NSTP Management Portal',
    body: 'Monitor enrollment, publish learning content, assign components, manage facilitator outputs, release grades, and keep program reporting ready.',
    tone: 'from-[#061A3A] via-[#0B3D91] to-[#0B3D91]',
    soft: 'bg-blue-50 text-blue-800 border-blue-100',
    actionTitle: 'Admin Operations',
    chartTitle: 'Component Distribution',
  },
  student: {
    eyebrow: 'Student Portal',
    title: 'Student NSTP Portal',
    body: 'Track your common module, assessment readiness, component assignment, official grade status, and notices in one focused workspace.',
    tone: 'from-[#061A3A] via-[#0B3D91] to-[#0B3D91]',
    soft: 'bg-blue-50 text-blue-800 border-blue-100',
    actionTitle: 'Student Tasks',
    chartTitle: 'Your NSTP Context',
  },
  facilitator: {
    eyebrow: 'Facilitator Portal',
    title: 'NSTP Facilitator Workspace',
    body: 'Upload lecture video details, create owned assessments, and maintain answer keys. Student records, grades, reports, and account controls remain admin-only.',
    tone: 'from-[#061A3A] via-[#0B3D91] to-[#0B3D91]',
    soft: 'bg-amber-50 text-amber-900 border-amber-100',
    actionTitle: 'Facilitator Actions',
    chartTitle: 'Owned Assessment Status',
  },
  coordinator: {
    eyebrow: 'Coordinator Portal',
    title: 'NSTP Component Coordination',
    body: 'Curate component curriculum, coordinate facilitators, manage training groups, oversee section progress, and verify official grade submissions.',
    tone: 'from-[#061A3A] via-[#0B3D91] to-[#0B3D91]',
    soft: 'bg-indigo-50 text-indigo-900 border-indigo-100',
    actionTitle: 'Coordinator Operations',
    chartTitle: 'Component Scope Overview',
  },
};

export default function RoleDashboardHome({ user, role, onNavigate }: RoleDashboardHomeProps) {
  const { data: students = [] } = useStudents();
  const { data: modules = [] } = useModules();
  const { data: assessments = [] } = useAssessments();
  const [grades, setGrades] = useState<SemesterGrade[]>([]);
  const { data: pending = [] } = usePendingRegistrations();
  const copy = roleCopy[role] || roleCopy.student;

  const publishedAssessments = assessments.filter((assessment) => assessment.status === 'published');
  const facilitatorOwned = assessments.filter((assessment) => assessment.ownerId === user.id);
  useEffect(() => {
    if (role !== 'student') return;
    apiGet<{ success: boolean; data: SemesterGrade[] }>('/nstp/students/me/grades')
      .then((response) => setGrades(response.data)).catch(() => setGrades([]));
  }, [role, user.id]);
  const activeAcademicYear = getCurrentAcademicYear();
  const activeGrades = grades.filter((grade) => grade.schoolYear === activeAcademicYear);
  const studentGrade = activeGrades.find((grade) => grade.semester === 'SECOND') || activeGrades.find((grade) => grade.semester === 'FIRST');
  const studentAverage = studentGrade?.percentGrade || 0;

  const componentData = Object.entries(componentColors).map(([name, fill]) => ({
    name,
    fill,
    value: Math.max(0, students.filter((student) => student.component === name).length),
  }));

  const facilitatorChartData = [
    { name: 'Published', fill: '#10b981', value: facilitatorOwned.filter((assessment) => assessment.status === 'published').length },
    { name: 'Draft', fill: '#f59e0b', value: facilitatorOwned.filter((assessment) => assessment.status === 'draft').length },
  ];

  const chartData = role === 'facilitator' ? facilitatorChartData : componentData;
  const chartTotal = chartData.reduce((sum, item) => sum + item.value, 0) || 1;
  const progressBands = [
    { name: 'At Risk', value: students.filter((student) => student.progress < 70).length, fill: '#ef4444' },
    { name: 'On Track', value: students.filter((student) => student.progress >= 70 && student.progress < 90).length, fill: '#2563eb' },
    { name: 'Excellent', value: students.filter((student) => student.progress >= 90).length, fill: '#10b981' },
  ];
  const moduleCoverage = modules.slice(0, 6).map((module, index) => ({
    name: `M${index + 1}`,
    hours: module.hours,
    tests: assessments.filter((assessment) => assessment.moduleId === module.id).length,
  }));
  const releaseTrend = [
    { name: 'First Semester', released: activeGrades.filter((grade) => grade.semester === 'FIRST').length, pending: activeGrades.some((grade) => grade.semester === 'FIRST') ? 0 : 1 },
    { name: 'Second Semester', released: activeGrades.filter((grade) => grade.semester === 'SECOND').length, pending: activeGrades.some((grade) => grade.semester === 'SECOND') ? 0 : 1 },
  ];
  // Enrolment progress exists on a student session only. Administrators render
  // these same bars as a generic "not applicable" baseline (35/20/50), which is
  // exactly what the falsy branches produce when there is no student to read.
  const studentUser = user.role === 'student' ? user : null;
  const firstName = user.name?.split(' ')[0] || (role === 'student' ? 'Student' : 'User');
  const commonModuleHours = modules.filter((m) => !m.component || m.component === 'Common').reduce((sum, m) => sum + m.hours, 0);
  const studentMilestones = [
    { label: 'General Education', value: studentUser?.generalEducationComplete ? 100 : Math.min(95, Math.round((commonModuleHours / 25) * 100)) },
    { label: 'Component Exam', value: studentUser?.examTaken ? 100 : 20 },
    { label: 'Classification', value: user.component ? 100 : 50 },
    { label: 'Grade Release', value: studentGrade ? 100 : 35 },
  ];
  const overallMilestoneProgress = role === 'student'
    ? Math.min(100, Math.round(studentMilestones.reduce((acc, m) => acc + m.value, 0) / studentMilestones.length))
    : 100;
  const primaryBarData = role === 'facilitator'
    ? facilitatorChartData
    : studentMilestones.map((item) => ({ name: item.label, value: item.value, fill: '#2563eb' }));
  const facilitatorReadiness = [
    { label: 'Owned Content', value: Math.min(100, facilitatorOwned.length * 25) },
    { label: 'Published', value: facilitatorOwned.length ? Math.round((facilitatorOwned.filter((assessment) => assessment.status === 'published').length / facilitatorOwned.length) * 100) : 0 },
    { label: 'Answer Keys', value: facilitatorOwned.length ? 100 : 0 },
  ];
  const secondaryBars = role === 'admin'
    ? progressBands
    : role === 'facilitator'
      ? facilitatorReadiness.map((item) => ({ name: item.label, value: item.value, fill: '#7c3f13' }))
      : studentMilestones.map((item) => ({ name: item.label, value: item.value, fill: '#2563eb' }));

  const kpis = role === 'admin'
    ? [
      { title: 'Students', value: String(students.length), detail: `${pending.length} pending approvals`, icon: Users, target: 'students' },
      { title: 'Learning Hours', value: String(modules.reduce((sum, module) => sum + module.hours, 0)), detail: `${modules.length} active modules`, icon: BookOpen, target: 'modules' },
      { title: 'Assessments', value: String(publishedAssessments.length), detail: `${assessments.length} total records`, icon: ClipboardList, target: 'assessments' },
      { title: 'Grade Terms', value: '2', detail: getCurrentSchoolYear(), icon: Award, target: 'students' },
      { title: 'Reports Generated', value: '12', detail: 'This month', icon: TrendingUp, target: 'reports' },
    ]
    : role === 'facilitator'
      ? [
        { title: 'Lecture Upload', value: 'Ready', detail: 'Video metadata workspace', icon: Upload, target: 'lecture' },
        { title: 'Owned Assessments', value: String(facilitatorOwned.length), detail: 'Editable by facilitator', icon: ClipboardList, target: 'assessments' },
        { title: 'Answer Keys', value: 'Enabled', detail: 'Question-level keys', icon: CheckCircle, target: 'assessments' },
        { title: 'Access Level', value: 'Limited', detail: 'No records or grades', icon: ShieldCheck },
      ]
      : [
        { title: 'Common Modules', value: `${studentUser?.generalEducationComplete ? 25 : Math.min(25, commonModuleHours)}/25 hrs`, detail: studentUser?.generalEducationComplete ? 'Requirement completed' : `${Math.max(0, 25 - commonModuleHours)} hrs remaining`, icon: BookOpen, target: 'modules' },
        { title: 'Assessments', value: publishedAssessments.length ? `${publishedAssessments.length} Ready` : 'Upcoming', detail: `${publishedAssessments.length} published tests`, icon: ClipboardList, target: 'assessments' },
        { title: 'Component Track', value: user.component || 'Pending', detail: user.component ? 'Official assignment' : 'Classification pending', icon: ShieldCheck, target: 'progress' },
        { title: 'Official Standing', value: studentGrade ? `${studentGrade.percentGrade}%` : 'In Progress', detail: studentGrade?.remarks || 'Standing clearance', icon: Award, target: 'grades' },
      ];

  const workflow = role === 'admin'
    ? ['Approve enrollment', 'Publish modules', 'Assign facilitators', 'Classify students', 'Release grades']
    : role === 'facilitator'
      ? ['Upload lecture', 'Build assessment', 'Set answer key', 'Publish', 'Review attempts']
      : ['Study modules', 'Take quizzes', 'Check progress', 'Confirm component', 'View grade'];

  const actions = role === 'admin'
    ? [
      { label: 'Manage Students', target: 'students', icon: Users },
      { label: 'Module Library', target: 'modules', icon: BookOpen },
      { label: 'Assessment Bank', target: 'assessments', icon: ClipboardList },
      { label: 'Classify Students', target: 'assignments', icon: ShieldCheck },
      { label: 'Reports', target: 'reports', icon: FileText },
    ]
    : role === 'facilitator'
      ? [
        { label: 'Upload Lecture', target: 'lecture', icon: Upload },
        { label: 'Create Assessment', target: 'assessments', icon: ClipboardList },
        { label: 'Edit Answer Key', target: 'assessments', icon: CheckCircle },
      ]
      : [
        { label: 'Open Modules', target: 'modules', icon: BookOpen },
        { label: 'Check Attendance', target: 'attendance', icon: CalendarDays },
        { label: 'Take Assessment', target: 'assessments', icon: ClipboardList },
        { label: 'View Grades', target: 'grades', icon: Award },
      ];

  const featureTiles = role === 'admin'
    ? [
      { title: 'Approval Desk', copy: 'Review pending student access and enrollment flags.', icon: UserCheck, target: 'students', tone: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' },
      { title: 'Intervention Queue', copy: 'Prioritize learners below the expected progress band.', icon: Target, target: 'reports', tone: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300' },
      { title: 'Resource Publishing', copy: 'Update common module materials and assessment coverage.', icon: BookMarked, target: 'modules', tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
    ]
    : role === 'facilitator'
      ? [
        { title: 'Lecture Studio', copy: 'Upload video details and connect the lesson to assessment items.', icon: Video, target: 'lecture', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300' },
        { title: 'Answer Key Builder', copy: 'Maintain correct answers before publishing a quiz or exam.', icon: CheckCircle, target: 'assessments', tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
        { title: 'Student Questions', copy: 'Prepare clarifications and announcement updates for learners.', icon: MessageSquare, target: 'announcements', tone: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300' },
      ]
      : [
        { title: 'Study Planner', copy: 'Jump back into the next module and keep your weekly pace.', icon: Timer, target: 'modules', tone: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' },
        { title: 'Assessment Prep', copy: 'Open available tests and check readiness before submission.', icon: ClipboardList, target: 'assessments', tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
        { title: 'Completion Records', copy: 'Review classification, grades, and official NSTP standing.', icon: GraduationCap, target: 'grades', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300' },
      ];

  const activityFeed = role === 'admin'
    ? [
      'Reviewed enrollment verification queue',
      'Updated grade release coverage',
      'Checked progress bands for intervention',
    ]
    : role === 'facilitator'
      ? [
        'Prepared owned assessment workspace',
        'Lecture upload area ready',
        'Answer key controls available',
      ]
      : [
        'Common Module path available',
        'Assessment list ready for review',
        'Grade and component records connected',
      ];

  const announcements = [
    { title: role === 'facilitator' ? 'Lecture Upload Window' : 'Common Module Schedule', date: 'May 24, 2026', icon: CalendarDays },
    { title: role === 'admin' ? 'Enrollment Review Queue' : 'Assessment Guidelines', date: 'May 20, 2026', icon: BookOpen },
    { title: 'NSTP Orientation', date: 'May 15, 2026', icon: Megaphone },
  ];

  const studentModuleColumns: ColumnDef<NstpModule>[] = [
    {
      key: 'title',
      header: 'Module & Topic',
      isPrimary: true,
      render: (mod) => (
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[11px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {mod.courseCode || 'MOD'}
            </span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">{mod.title}</span>
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{mod.description}</p>
        </div>
      ),
    },
    {
      key: 'hours',
      header: 'Hours',
      align: 'center',
      width: 'w-24',
      render: (mod) => (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <Clock className="h-3 w-3 text-blue-600" />
          {mod.hours} hrs
        </span>
      ),
    },
    {
      key: 'tests',
      header: 'Assessments',
      align: 'center',
      width: 'w-28',
      render: (mod) => {
        const tests = assessments.filter((a) => a.moduleId === mod.id);
        return (
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {tests.length > 0 ? `${tests.length} tests ready` : 'No tests'}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      width: 'w-32',
      render: (_mod, index) => {
        const isDone = index < 2;
        const isCurrent = index === 2;
        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
              isDone
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                : isCurrent
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {isDone ? <CheckCircle className="h-3 w-3" /> : null}
            {isDone ? 'Completed' : isCurrent ? 'In Progress' : 'Upcoming'}
          </span>
        );
      },
    },
    {
      key: 'action',
      header: 'Action',
      align: 'right',
      width: 'w-28',
      render: (_mod) => (
        <button
          onClick={() => onNavigate?.('modules')}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800 dark:text-blue-300 dark:hover:bg-slate-700"
        >
          Study
          <ChevronRight className="h-3 w-3" />
        </button>
      ),
    },
  ];

  return (
    <div className={role === 'student' ? 'h-full text-[#071733] dark:bg-slate-950' : 'h-full overflow-auto bg-[#f4f7fb] p-3 text-[#071733] dark:bg-slate-950 md:p-5'}>
      <div className="mx-auto max-w-7xl space-y-4">
        <section className={`overflow-hidden rounded-2xl bg-gradient-to-br ${copy.tone} text-white shadow-[0_18px_42px_-34px_rgba(15,23,42,0.75)]`}>
          <div className="grid gap-5 p-4 md:p-7 xl:grid-cols-[1.1fr_0.9fr] xl:items-center">
            <div>
              <div className="mb-4 inline-grid h-14 w-14 place-items-center rounded-2xl border border-white/25 bg-white/12 backdrop-blur-md">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">{copy.eyebrow}</p>
              <h1 className="mt-2 max-w-3xl text-2xl font-bold leading-tight md:text-4xl">
                {role === 'student' ? `Welcome back, ${firstName}! 👋` : copy.title}
              </h1>
              <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-white/85 md:text-base">
                {role === 'student'
                  ? 'Track your common module hours, assessment readiness, component classification, and academic grades in your official NSTP portal.'
                  : copy.body}
              </p>
              {role === 'student' && (
                <div className="mt-5 flex flex-wrap items-center gap-2.5 text-xs font-semibold">
                  {studentUser?.degreeProgram && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 backdrop-blur-sm border border-white/20">
                      <GraduationCap className="h-4 w-4" />
                      {studentUser.degreeProgram}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 backdrop-blur-sm border border-white/20">
                    <ShieldCheck className="h-4 w-4" />
                    {user.component ? `Component: ${user.component}` : 'Component: Pending'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 backdrop-blur-sm border border-white/20">
                    <CalendarDays className="h-4 w-4" />
                    AY {activeAcademicYear}
                  </span>
                </div>
              )}
              {role === 'admin' && (
                <div className="mt-6 flex flex-wrap gap-4 text-xs font-semibold text-white/85">
                  <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" />{getCurrentSchoolYear()}</span>
                  <span className="inline-flex items-center gap-2"><Timer className="h-4 w-4" />Second Semester</span>
                  <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" />Last updated: May 24, 2024 9:30 AM</span>
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {actions.slice(0, role === 'admin' ? 4 : 3).map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={() => onNavigate?.(action.target)}
                    className="flex min-h-20 items-center justify-between rounded-xl border border-white/18 bg-white/12 px-4 text-left text-sm font-semibold text-white backdrop-blur-md hover:bg-white/18"
                  >
                    <span className="flex items-center gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-white/12">
                        <Icon className="h-5 w-5" />
                      </span>
                      {action.label}
                    </span>
                    <ChevronRight className="h-5 w-5" />
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {role === 'student' && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-blue-200/80 bg-gradient-to-r from-blue-50 to-indigo-50/60 p-4 sm:p-5 shadow-sm dark:border-blue-900/40 dark:from-slate-900 dark:to-blue-950/30">
            <div className="flex items-center gap-3.5">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
                <Target className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">Current Objective</p>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                  {!studentUser?.generalEducationComplete
                    ? 'Complete 25 Contact Hours of Common Modules'
                    : !user.component
                    ? 'Awaiting Official Component Placement'
                    : `${user.component} — Continue Component Coursework`}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                  {!studentUser?.generalEducationComplete
                    ? 'Attend seminars and complete common orientation modules to qualify for NSTP track placement.'
                    : !user.component
                    ? 'Your qualifying exam score has been recorded. Review status while coordinators balance slots.'
                    : 'Access published learning modules, post-module assessments, and class sessions.'}
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate?.(!studentUser?.generalEducationComplete ? 'modules' : !user.component ? 'progress' : 'modules')}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 cursor-pointer active:scale-95"
            >
              <span>{!studentUser?.generalEducationComplete ? 'Go to Modules' : !user.component ? 'View Placement' : 'Start Learning'}</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        <section className={`grid gap-3 sm:grid-cols-2 ${role === 'admin' ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
          {kpis.map((card) => {
            const tone =
              card.title === 'NSTP Grade'
                ? 'success'
                : card.title === 'Component'
                ? 'warning'
                : card.title === 'Assessments'
                ? 'primary'
                : 'default';
            return (
              <StatCard
                key={card.title}
                title={card.title}
                value={card.value}
                detail={card.detail}
                icon={card.icon}
                tone={tone}
                onClick={card.target ? () => onNavigate?.(card.target!) : undefined}
              />
            );
          })}
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-base font-semibold text-slate-950 dark:text-slate-100">
                  {role === 'admin' ? 'Administrative Workflow' : role === 'facilitator' ? 'Publishing Workflow' : 'Student Progress Path'}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">The main checkpoints for this role.</p>
              </div>
              <span className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${copy.soft}`}>
                {role === 'admin' ? 'Coordinator' : role}
              </span>
            </div>

            <div className="mt-4 sm:mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
              {workflow.map((step, index) => (
                <div key={step} className="relative rounded-xl border border-slate-200 bg-slate-50 p-2.5 sm:p-3 text-center dark:border-slate-800 dark:bg-slate-950">
                  <span className={`grid h-9 w-9 place-items-center rounded-full text-sm font-semibold text-white ${index === workflow.length - 1 ? 'bg-emerald-500' : 'bg-blue-700'}`}>
                    {index === workflow.length - 1 ? <CheckCircle className="h-5 w-5" /> : index + 1}
                  </span>
                  <p className="mt-3 text-sm font-semibold leading-tight text-slate-800 dark:text-slate-100">{step}</p>
                  <CheckCircle className="mx-auto mt-3 h-4 w-4 text-emerald-500" />
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Overall Progress</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <span className="block h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${overallMilestoneProgress}%` }} />
              </span>
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-300">{overallMilestoneProgress}%</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-base font-semibold text-slate-950 dark:text-slate-100">{copy.chartTitle}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-[12rem_1fr] sm:items-center">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <PieChart>
                    <Pie data={chartData} dataKey="value" innerRadius={52} outerRadius={78} paddingAngle={4}>
                      {chartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {chartData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-3 text-sm font-semibold">
                    <span className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                      <span className="h-3 w-3 rounded-full" style={{ background: item.fill }} />
                      {item.name}
                    </span>
                    <span className="text-slate-950 dark:text-slate-100">{Math.round((item.value / chartTotal) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950 dark:text-slate-100">
                  {role === 'admin' ? 'Progress Bands' : role === 'facilitator' ? 'Publishing Readiness' : 'Personal Milestones'}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">
                  {role === 'admin' ? 'Quickly spot cohorts that need intervention.' : role === 'facilitator' ? 'A concise view of content readiness.' : 'Your current completion signals.'}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">Live</span>
            </div>

            <div className="mt-5 h-56">
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <BarChart data={secondaryBars} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <XAxis dataKey="name" tick={{ fill: 'currentColor', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'currentColor', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(37,99,235,0.08)' }} />
                  <Bar dataKey="value" radius={[8, 8, 4, 4]}>
                    {secondaryBars.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950 dark:text-slate-100">
                  {role === 'admin' ? 'Module and Grade Coverage' : role === 'facilitator' ? 'Assessment Ownership' : 'Grade Readiness'}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">
                  {role === 'admin' ? 'Coverage across instruction and official record release.' : role === 'facilitator' ? 'Published and draft ownership is separated from admin control.' : 'A simple signal for released and pending grade stages.'}
                </p>
              </div>
            </div>

            <div className="mt-5 h-56">
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                {role === 'admin' ? (
                  <AreaChart data={releaseTrend} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="releasedTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.38} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" tick={{ fill: 'currentColor', fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: 'currentColor', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="released" stroke="#2563eb" fill="url(#releasedTrend)" strokeWidth={3} />
                    <Area type="monotone" dataKey="pending" stroke="#f59e0b" fill="transparent" strokeWidth={2} />
                  </AreaChart>
                ) : (
                  <BarChart data={primaryBarData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <XAxis dataKey="name" tick={{ fill: 'currentColor', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: 'currentColor', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[8, 8, 4, 4]}>
                      {primaryBarData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>

            {role === 'admin' && (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {moduleCoverage.slice(0, 3).map((item) => (
                  <div key={item.name} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{item.name}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{item.hours} hrs / {item.tests} tests</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {role === 'student' && (
          <section className="space-y-2">
            <DataTable
              title="Course Modules & Assessment Readiness"
              subtitle="Track your Common Module completion, required hours, and assessment availability."
              data={modules.slice(0, 5)}
              columns={studentModuleColumns}
              keyExtractor={(mod) => mod.id}
              actionSlot={
                <button
                  onClick={() => onNavigate?.('modules')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  View All Modules
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              }
            />
          </section>
        )}

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950 dark:text-slate-100">
                  {role === 'admin' ? 'Operational Toolkit' : role === 'facilitator' ? 'Facilitator Toolkit' : 'Student Toolkit'}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">Role-specific options for faster daily work.</p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">New</span>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {featureTiles.map((feature) => {
                const Icon = feature.icon;
                return (
                  <button
                    key={feature.title}
                    onClick={() => onNavigate?.(feature.target)}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white hover:shadow-md dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"
                  >
                    <span className={`grid h-11 w-11 place-items-center rounded-xl ${feature.tone}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="mt-4 block text-sm font-semibold text-slate-950 dark:text-slate-100">{feature.title}</span>
                    <span className="mt-2 block text-xs leading-5 text-slate-600 dark:text-slate-300">{feature.copy}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-base font-semibold text-slate-950 dark:text-slate-100">Recent Activity</p>
            <div className="mt-4 space-y-3">
              {activityFeed.map((item, index) => (
                <div key={item} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-700 text-xs font-semibold text-white">{index + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item}</p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Available in your current role workspace.</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
                <p className="text-base font-semibold text-slate-950 dark:text-slate-100">Announcements</p>
              <button onClick={() => onNavigate?.('announcements')} className="text-xs font-semibold text-blue-700 dark:text-blue-300">View all</button>
            </div>
            <div className="space-y-2">
              {announcements.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-blue-700 dark:bg-slate-900 dark:text-blue-300">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-950 dark:text-slate-100">{item.title}</span>
                      <span className="block text-xs font-medium text-slate-600 dark:text-slate-300">{item.date}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-base font-semibold text-slate-950 dark:text-slate-100">{copy.actionTitle}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={() => onNavigate?.(action.target)}
                    className="flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 text-left text-sm font-semibold text-slate-800 hover:border-blue-200 hover:bg-blue-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-blue-500/10"
                  >
                    <Icon className="h-5 w-5 shrink-0 text-blue-700 dark:text-blue-300" />
                    {action.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
