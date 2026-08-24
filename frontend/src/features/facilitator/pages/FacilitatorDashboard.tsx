import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { FacilitatorUser } from '../../../services/authUser';
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck,
  Check,
  CheckCircle,
  ChevronDown,
  ClipboardList,
  Clock,
  Download,
  LayoutDashboard,
  MapPin,
  Menu,
  Moon,
  Search,
  Settings,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import CollapsibleRoleSidebar from '../../../components/layout/CollapsibleRoleSidebar';
import FacilitatorGradesView from '../components/FacilitatorGradesView';
import {
  loadAccounts,
  loadAssessments,
  loadAttendanceRecords,
  loadAttendanceSessions,
  loadPendingStudentRegistrations,
  loadStudents,
  saveAttendanceRecords,
  saveAttendanceSessions,
  NSTP_COMPONENTS,
  PendingStudentRegistration,
  NstpAssessment,
  NstpAttendanceRecord,
  NstpAttendanceSession,
  NstpStudent,
  AttendanceStatus,
  replaceAssessmentsSnapshot,
} from '../../../data/nstpData';
import { fetchManagedAssessments } from '../../../services/assessments';

const componentColors = ['#10b981', '#2563eb', '#f59e0b', '#8b5cf6', '#06b6d4'];
const gradeColors = ['#10b981', '#2563eb', '#f59e0b', '#8b5cf6', '#ef4444'];

const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'F';

export default function FacilitatorDashboard({
  user,
  onLogout,
  onNavigate,
  embedded = false,
}: {
  user: FacilitatorUser;
  onLogout?: () => void;
  onNavigate?: (target: string) => void;
  embedded?: boolean;
}) {
  type FacilitatorView = 'dashboard' | 'enrollment-requests' | 'attendance-sheet' | 'grade-book' | 'modules' | 'reports';

  const [view, setView] = useState<FacilitatorView>('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [students, setStudents] = useState<NstpStudent[]>([]);
  const [pendingRegistrations, setPendingRegistrations] = useState<PendingStudentRegistration[]>([]);
  const [assessments, setAssessments] = useState<NstpAssessment[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<NstpAttendanceRecord[]>([]);
  const [attendanceSessions, setAttendanceSessions] = useState<NstpAttendanceSession[]>([]);
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [newSessionDate, setNewSessionDate] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessionTitle, setEditSessionTitle] = useState('');
  const [editSessionDate, setEditSessionDate] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setStudents(loadStudents());
    setPendingRegistrations(loadPendingStudentRegistrations());
    setAssessments(loadAssessments());
    setAttendanceRecords(loadAttendanceRecords());
    setAttendanceSessions(loadAttendanceSessions());
    fetchManagedAssessments('facilitator').then((records) => {
      setAssessments(records);
      replaceAssessmentsSnapshot(records);
    }).catch(() => { /* dashboard keeps the last display cache and never treats it as writable authority */ });
  }, []);

  const assignedMunicipalities = user.municipalities || [];
  const scopedStudents = useMemo(
    () => students.filter((student) => student.municipality && assignedMunicipalities.includes(student.municipality)),
    [students, assignedMunicipalities],
  );
  const scopedPending = useMemo(
    () => pendingRegistrations.filter((registration) => registration.municipality && assignedMunicipalities.includes(registration.municipality)),
    [pendingRegistrations, assignedMunicipalities],
  );

  const query = search.trim().toLowerCase();
  const visiblePending = scopedPending.filter((registration) => {
    if (!query) return true;
    return [registration.name, registration.email, registration.studentId, registration.municipality].some((value) => value?.toLowerCase().includes(query));
  });

  // Grade editing and release state are loaded by the server-backed semester
  // grade book. Legacy browser grade snapshots are not treated as analytics.
  const gradeValues: number[] = [];
  const averageGrade = gradeValues.length ? gradeValues.reduce((sum, grade) => sum + grade, 0) / gradeValues.length : 0;
  const attendanceToday = scopedStudents.length ? Math.round((scopedStudents.filter((student) => student.status === 'active' || student.status === 'graduated').length / scopedStudents.length) * 100) : 0;

  const componentData = NSTP_COMPONENTS.map((component) => ({
    name: component,
    value: scopedStudents.filter((student) => student.component === component).length,
  }));

  const gradeDistribution = [
    { range: '90 - 100', value: gradeValues.filter((grade) => grade >= 90).length },
    { range: '85 - 89', value: gradeValues.filter((grade) => grade >= 85 && grade < 90).length },
    { range: '80 - 84', value: gradeValues.filter((grade) => grade >= 80 && grade < 85).length },
    { range: '75 - 79', value: gradeValues.filter((grade) => grade >= 75 && grade < 80).length },
    { range: 'Below 75', value: gradeValues.filter((grade) => grade > 0 && grade < 75).length },
  ];

  const recentAssessments = assessments
    .filter((assessment) => assessment.ownerRole === 'facilitator' && (assessment.ownerId === user.id || assessment.ownerId === 'facilitator-1'))
    .slice(0, 4);

  const modules = (() => { try { return JSON.parse(localStorage.getItem('nstp-module-library') || '[]'); } catch { return []; } })();

  const getRecentSaturdays = (count: number): string[] => {
    const dates: string[] = [];
    const current = new Date();
    current.setDate(current.getDate() - 30);
    while (dates.length < count) {
      if (current.getDay() === 6) {
        dates.push(current.toISOString().split('T')[0]);
      }
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const createAttendanceSession = () => {
    const date = newSessionDate || getRecentSaturdays(1)[0];
    if (!date) return;
    const existing = attendanceSessions.find((s) => s.date === date);
    if (existing) return;
    const session: NstpAttendanceSession = {
      id: `ats-${Math.random().toString(36).slice(2, 10)}`,
      date,
      facilitatorId: user.id,
      title: newSessionTitle.trim() || `NSTP Session - ${new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      createdAt: new Date().toISOString(),
    };
    const nextSessions = [...attendanceSessions, session].sort((a, b) => b.date.localeCompare(a.date));
    setAttendanceSessions(nextSessions);
    saveAttendanceSessions(nextSessions);
    setNewSessionTitle('');
    setNewSessionDate('');
  };

  const startEditSession = (session: NstpAttendanceSession) => {
    setEditingSessionId(session.id);
    setEditSessionTitle(session.title);
    setEditSessionDate(session.date);
  };

  const saveEditSession = () => {
    if (!editingSessionId || !editSessionDate) return;
    const nextSessions = attendanceSessions.map((s) =>
      s.id === editingSessionId
        ? { ...s, title: editSessionTitle.trim() || s.title, date: editSessionDate, updatedAt: new Date().toISOString() }
        : s
    );
    setAttendanceSessions(nextSessions);
    saveAttendanceSessions(nextSessions);
    setEditingSessionId(null);
  };

  const cancelEditSession = () => {
    setEditingSessionId(null);
  };

  const deleteAttendanceSession = (sessionId: string) => {
    const nextSessions = attendanceSessions.filter((s) => s.id !== sessionId);
    const nextRecords = attendanceRecords.filter((r) => r.sessionId !== sessionId);
    setAttendanceSessions(nextSessions);
    setAttendanceRecords(nextRecords);
    saveAttendanceSessions(nextSessions);
    saveAttendanceRecords(nextRecords);
  };

  const getStudentAttendance = (studentId: string, sessionId: string): AttendanceStatus | undefined => {
    return attendanceRecords.find((r) => r.studentId === studentId && r.sessionId === sessionId)?.status;
  };

  const setAttendance = (student: NstpStudent, sessionId: string, status: AttendanceStatus) => {
    const studentKey = student.studentId || student.id;
    const existingIndex = attendanceRecords.findIndex((r) => r.studentId === studentKey && r.sessionId === sessionId);
    let nextRecords: NstpAttendanceRecord[];
    if (existingIndex >= 0) {
      if (attendanceRecords[existingIndex].status === status) {
        nextRecords = attendanceRecords.filter((_, i) => i !== existingIndex);
      } else {
        nextRecords = attendanceRecords.map((r, i) =>
          i === existingIndex ? { ...r, status, updatedAt: new Date().toISOString() } : r
        );
      }
    } else {
      nextRecords = [...attendanceRecords, {
        id: `atr-${Math.random().toString(36).slice(2, 10)}`,
        studentId: studentKey,
        sessionId,
        status,
        facilitatorId: user.id,
        updatedAt: new Date().toISOString(),
      }];
    }
    setAttendanceRecords(nextRecords);
    saveAttendanceRecords(nextRecords);
  };

  const getAttendanceCounts = (sessionId: string) => {
    const records = attendanceRecords.filter((r) => r.sessionId === sessionId);
    return {
      present: records.filter((r) => r.status === 'present').length,
      absent: records.filter((r) => r.status === 'absent').length,
      late: records.filter((r) => r.status === 'late').length,
      excused: records.filter((r) => r.status === 'excused').length,
    };
  };

  const exportReportsPdf = async () => {
    const [jspdfModule, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const JsPDF = jspdfModule.default;
    const autoTable = autoTableModule.default;
    const doc = new JsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 40;

    doc.setFontSize(18);
    doc.text('NSTP Class Report', pageW / 2, 40, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Facilitator: ${user.name}`, margin, 62);
    doc.text(`Municipality: ${assignedMunicipalities.join(', ') || 'N/A'}`, margin, 76);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`, margin, 90);
    doc.setDrawColor(37, 99, 235);
    doc.setLineWidth(1);
    doc.line(margin, 98, pageW - margin, 98);

    let yPos = 116;
    doc.setFontSize(14);
    doc.text('Grade Distribution', margin, yPos);
    yPos += 18;

    const gradeTableData = gradeDistribution
      .filter((g) => g.value > 0)
      .map((g) => [g.range, g.value.toString(), `${scopedStudents.length ? Math.round((g.value / scopedStudents.length) * 100) : 0}%`]);

    if (gradeTableData.length) {
      autoTable(doc, {
        startY: yPos,
        head: [['Grade Range', 'Students', 'Percentage']],
        body: gradeTableData,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235] },
        margin: { left: margin, right: margin },
      });
      yPos = (doc as any).lastAutoTable.finalY + 24;
    } else {
      yPos += 14;
    }

    doc.setFontSize(14);
    doc.text('Recent Assessments', margin, yPos);
    yPos += 18;

    const assessmentTableData = recentAssessments.map((a) => [
      a.title,
      a.moduleId || 'General',
      a.status,
      new Date(a.updatedAt).toLocaleDateString(),
    ]);

    if (assessmentTableData.length) {
      autoTable(doc, {
        startY: yPos,
        head: [['Assessment', 'Module', 'Status', 'Updated']],
        body: assessmentTableData,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235] },
        margin: { left: margin, right: margin },
      });
      yPos = (doc as any).lastAutoTable.finalY + 24;
    } else {
      yPos += 14;
    }

    doc.setFontSize(14);
    doc.text('Attendance Summary', margin, yPos);
    yPos += 18;

    const attTableData = attendanceSessions.map((s) => {
      const c = getAttendanceCounts(s.id);
      return [
        s.title,
        new Date(s.date).toLocaleDateString(),
        `${c.present}`,
        `${c.absent}`,
        `${c.late}`,
        `${c.excused}`,
      ];
    });

    if (attTableData.length) {
      autoTable(doc, {
        startY: yPos,
        head: [['Session', 'Date', 'Present', 'Absent', 'Late', 'Excused']],
        body: attTableData,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235] },
        margin: { left: margin, right: margin },
      });
      yPos = (doc as any).lastAutoTable.finalY + 24;
    } else {
      yPos += 14;
    }

    doc.save(`nstp-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const toggleTheme = () => {
    document.documentElement.classList.toggle('dark');
  };

  const navGroups = [
    {
      label: 'Home',
      items: [{ label: 'Dashboard', icon: LayoutDashboard, active: view === 'dashboard', badge: null, target: 'dashboard' as FacilitatorView }],
    },
    {
      label: 'Students',
      items: [
        { label: 'My Students', icon: Users, active: view === 'grade-book', badge: null, target: 'grade-book' as FacilitatorView },
        { label: 'Student Approvals', icon: UserCheck, active: view === 'enrollment-requests', badge: scopedPending.length || null, target: 'enrollment-requests' as FacilitatorView },
        { label: 'Attendance', icon: CalendarCheck, active: view === 'attendance-sheet', badge: null, target: 'attendance-sheet' as FacilitatorView },
        { label: 'Grades', icon: ClipboardList, active: view === 'grade-book', badge: null, target: 'grade-book' as FacilitatorView },
      ],
    },
    {
      label: 'Modules',
      items: [
        { label: 'Module Library', icon: BookOpen, active: view === 'modules', badge: null, target: 'modules' as FacilitatorView },
      ],
    },
    {
      label: 'Reports',
      items: [
        { label: 'Reports', icon: BarChart3, active: view === 'reports', badge: null, target: 'reports' as FacilitatorView },
      ],
    },
  ];

  const handleSidebarAction = (target: string) => {
    if (target === 'announcements') {
      onNavigate?.(target);
      return;
    }
    setView(target as FacilitatorView);
  };

  const kpis = [
    {
      label: 'Total Students',
      value: scopedStudents.length,
      detail: 'Enrolled students',
      action: `${Math.max(0, scopedStudents.length - 116)} this month`,
      icon: Users,
      toneClass: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-200',
    },
    {
      label: 'Student Approvals',
      value: scopedPending.length,
      detail: 'Pending approval',
      action: 'View requests',
      icon: UserCheck,
      toneClass: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-200',
    },
    {
      label: 'Attendance Today',
      value: `${attendanceToday}%`,
      detail: `${Math.round((attendanceToday / 100) * scopedStudents.length)} present / ${scopedStudents.length} total`,
      action: 'View attendance',
      icon: CalendarCheck,
      toneClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-200',
    },
    {
      label: 'Average Grade',
      value: averageGrade ? averageGrade.toFixed(2) : '0.00',
      detail: 'Class average',
      action: 'View grade book',
      icon: BookOpen,
      toneClass: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-200',
    },
  ];

  return (
    <div className={`${embedded ? 'min-h-0 bg-transparent' : 'min-h-dvh overflow-x-hidden bg-[#f4f8fd]'} text-slate-950 dark:bg-slate-950 dark:text-slate-100`}>
      <div className={embedded ? 'min-h-0' : 'min-h-dvh'}>
        {!embedded && (
          <CollapsibleRoleSidebar
            open={mobileSidebarOpen}
            onClose={() => setMobileSidebarOpen(false)}
            portalLabel="Facilitator Portal"
            closeLabel="Close facilitator navigation"
            groups={navGroups.map((group) => ({
              label: group.label,
              items: group.items.map((item) => ({
                label: item.label,
                icon: item.icon,
                active: item.active,
                badge: item.badge ?? undefined,
                onClick: () => handleSidebarAction(item.target),
              })),
            }))}
            avatarLabel={initials(user.name)}
            accountLabel="Facilitator"
            accountTitle={user.name}
            accountSubtitle={assignedMunicipalities.length ? `${assignedMunicipalities.join(', ')}, Biliran` : 'Awaiting assignment'}
            accountMeta={
              <div className="flex items-start gap-2 text-xs font-semibold text-white/75">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#E5B73B]" />
                <span className="min-w-0 truncate">{assignedMunicipalities.length ? `${assignedMunicipalities.join(', ')}, Biliran` : 'Awaiting assignment'}</span>
              </div>
            }
            onLogout={onLogout}
          />
        )}

        <main className={`min-w-0 overflow-hidden rounded-[2rem] border border-slate-200 bg-white/85 shadow-xl shadow-slate-200/50 backdrop-blur transition-all duration-300 dark:border-slate-800 dark:bg-slate-900/85 dark:shadow-none ${embedded ? '' : 'm-3 lg:ml-[76px]'}`}>
          <header className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 dark:border-slate-800 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              {!embedded && (
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(true)}
                  className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 lg:hidden"
                  aria-label="Open facilitator navigation"
                >
                  <Menu className="h-5 w-5" />
                </button>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-700 dark:text-blue-300">Facilitator Portal</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white md:text-3xl">Good morning, {user.name}</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">Facilitator - {assignedMunicipalities[0] || 'Unassigned'}, Biliran</p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end">
              <label className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-950 sm:min-w-[16rem] xl:w-[24rem]">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search students, assessments..."
                  className="w-full bg-transparent text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
                />
              </label>
              <button onClick={toggleTheme} className="grid h-12 w-12 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-blue-200 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                <Moon className="h-5 w-5" />
              </button>
              <button className="relative grid h-12 w-12 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                <Bell className="h-5 w-5" />
                {scopedPending.length ? <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-rose-500 text-xs font-semibold text-white">{scopedPending.length}</span> : null}
              </button>
              <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-700 text-sm font-semibold text-white">{initials(user.name)}</span>
                <span className="hidden text-sm font-medium text-slate-800 dark:text-slate-100 sm:block">{user.name}</span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </div>
            </div>
          </header>

          <div className="space-y-5 p-5">
            {view === 'dashboard' && (
              <>
                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {kpis.map((stat) => {
                    const Icon = stat.icon;
                    return (
                      <article key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                        <div className="flex items-start gap-4">
                          <span className={`grid h-14 w-14 place-items-center rounded-2xl ${stat.toneClass}`}>
                            <Icon className="h-7 w-7" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{stat.label}</p>
                            <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">{stat.value}</p>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{stat.detail}</p>
                          </div>
                        </div>
                        <p className="mt-4 text-sm font-medium text-blue-700 dark:text-blue-300">{stat.action}</p>
                      </article>
                    );
                  })}
                </section>

                <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
                  <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Student Approvals</h2>
                      <button onClick={() => setView('enrollment-requests')} className="text-sm font-medium text-blue-700 dark:text-blue-300 hover:underline">View all</button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] overflow-hidden rounded-2xl text-sm">
                        <thead>
                          <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                            <th className="px-4 py-3">Student</th>
                            <th className="px-4 py-3">Municipality</th>
                            <th className="px-4 py-3">Request Date</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visiblePending.slice(0, 5).map((registration) => (
                            <tr key={registration.id} className="border-b border-slate-100 dark:border-slate-800">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-600 text-xs font-semibold text-white">{initials(registration.name)}</span>
                                  <span>
                                    <span className="block font-medium text-slate-900 dark:text-slate-100">{registration.name}</span>
                                    <span className="text-xs text-slate-500">{registration.studentId || registration.email}</span>
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{registration.municipality}, Biliran</td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{new Date(registration.createdAt).toLocaleDateString()}</td>
                              <td className="px-4 py-3"><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">Pending</span></td>
                              <td className="px-4 py-3">
                                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Administrator review required</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {visiblePending.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                          No pending enrollment requests for your municipality scope.
                        </div>
                      ) : null}
                    </div>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Class Overview</h2>
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">View all students</span>
                    </div>
                    <div className="grid gap-5 sm:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-1 2xl:grid-cols-[220px_minmax(0,1fr)]">
                      <div className="h-56 min-h-56 min-w-0">
                        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                          <PieChart>
                            <Pie data={componentData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2}>
                              {componentData.map((entry, index) => <Cell key={entry.name} fill={componentColors[index % componentColors.length]} />)}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-4">
                        {componentData.map((item, index) => (
                          <div key={item.name} className="flex items-center justify-between gap-3 text-sm">
                            <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: componentColors[index] }} />
                              {item.name}
                            </span>
                            <span className="font-semibold text-slate-900 dark:text-white">{item.value} ({scopedStudents.length ? Math.round((item.value / scopedStudents.length) * 100) : 0}%)</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>
                </section>

                <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
                  <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Recent Assessments</h2>
                      <button onClick={() => setView('reports')} className="text-sm font-medium text-blue-700 dark:text-blue-300 hover:underline">View all</button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[680px] text-sm">
                        <thead>
                          <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                            <th className="px-4 py-3">Assessment</th>
                            <th className="px-4 py-3">Module</th>
                            <th className="px-4 py-3">Submissions</th>
                            <th className="px-4 py-3">Due Date</th>
                            <th className="px-4 py-3">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentAssessments.map((assessment, index) => (
                            <tr key={assessment.id} className="border-b border-slate-100 dark:border-slate-800">
                              <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{assessment.title}</td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{assessment.moduleId || 'General'}</td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{Math.max(0, scopedStudents.length - index * 4)} / {scopedStudents.length}</td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{new Date(assessment.updatedAt).toLocaleDateString()}</td>
                              <td className="px-4 py-3">
                                <span className={`rounded-full px-3 py-1 text-xs font-medium ${assessment.status === 'published' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                                  {assessment.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Grade Distribution</h2>
                      <button onClick={() => setView('grade-book')} className="text-sm font-medium text-blue-700 dark:text-blue-300 hover:underline">View grade book</button>
                    </div>
                    <div className="h-64 min-h-64 min-w-0">
                      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                        <BarChart data={gradeDistribution} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
                          <XAxis dataKey="range" tickLine={false} axisLine={false} fontSize={12} />
                          <YAxis tickLine={false} axisLine={false} fontSize={12} />
                          <Tooltip />
                          <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                            {gradeDistribution.map((entry, index) => <Cell key={entry.range} fill={gradeColors[index % gradeColors.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </article>
                </section>
              </>
            )}

            {view === 'enrollment-requests' && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setView('dashboard')} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300">
                      <ChevronDown className="h-4 w-4 rotate-90" />
                    </button>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Student Approvals</h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Approve or reject pending student registrations.</p>
                    </div>
                  </div>
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">{visiblePending.length} pending</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] overflow-hidden rounded-2xl text-sm">
                    <thead>
                      <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                        <th className="px-4 py-3">Student</th>
                        <th className="px-4 py-3">Municipality</th>
                        <th className="px-4 py-3">Request Date</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePending.map((registration) => (
                        <tr key={registration.id} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-600 text-xs font-semibold text-white">{initials(registration.name)}</span>
                              <span>
                                <span className="block font-medium text-slate-900 dark:text-slate-100">{registration.name}</span>
                                <span className="text-xs text-slate-500">{registration.studentId || registration.email}</span>
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{registration.municipality}, Biliran</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{new Date(registration.createdAt).toLocaleDateString()}</td>
                          <td className="px-4 py-3"><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">Pending</span></td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Administrator review required</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {visiblePending.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      No pending enrollment requests for your municipality scope.
                    </div>
                  ) : null}
                </div>
              </section>
            )}

            {view === 'grade-book' && (
              <FacilitatorGradesView />
            )}

            {view === 'modules' && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="mb-4 flex items-center gap-3">
                  <button onClick={() => setView('dashboard')} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300">
                    <ChevronDown className="h-4 w-4 rotate-90" />
                  </button>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">
                    <BookOpen className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Module Library</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Browse published modules (read-only).</p>
                  </div>
                </div>
                {modules.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                    <BookOpen className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
                    <p className="mt-3 text-sm font-medium text-slate-500 dark:text-slate-400">No modules available yet</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Modules are created by the coordinator.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[500px] text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                        <tr>
                          <th className="px-4 py-3">Title</th>
                          <th className="px-4 py-3">Hours</th>
                          <th className="px-4 py-3">Difficulty</th>
                          <th className="px-4 py-3">Component</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modules.map((mod: any) => (
                          <tr key={mod.id} className="border-t border-slate-100 dark:border-slate-800">
                            <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{mod.title}</td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{mod.hours}h</td>
                            <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{mod.difficulty}</span></td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{mod.component || 'Common'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {view === 'attendance-sheet' && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="mb-4 flex items-center gap-3">
                  <button onClick={() => setView('dashboard')} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300">
                    <ChevronDown className="h-4 w-4 rotate-90" />
                  </button>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
                    <CalendarCheck className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Attendance Sheet</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Track student attendance every NSTP Saturday session.</p>
                  </div>
                </div>

                <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Session Title</label>
                    <input
                      value={newSessionTitle}
                      onChange={(e) => setNewSessionTitle(e.target.value)}
                      placeholder="e.g. Week 1 - Orientation"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                  <div className="sm:w-48">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Session Date</label>
                    <input
                      type="date"
                      value={newSessionDate}
                      onChange={(e) => setNewSessionDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                  <button
                    onClick={createAttendanceSession}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800"
                  >
                    <Check className="h-4 w-4" />
                    Add Session
                  </button>
                </div>

                {attendanceSessions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                    <CalendarCheck className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
                    <p className="mt-3 text-sm font-medium text-slate-500 dark:text-slate-400">No attendance sessions yet</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Add a session above to start tracking NSTP Saturday attendance.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {attendanceSessions.map((session) => {
                      const counts = getAttendanceCounts(session.id);
                      return (
                        <div key={session.id} className="rounded-xl border border-slate-200 dark:border-slate-700">
                          <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
                            {editingSessionId === session.id ? (
                              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
                                <div className="flex-1">
                                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Title</label>
                                  <input
                                    value={editSessionTitle}
                                    onChange={(e) => setEditSessionTitle(e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950"
                                  />
                                </div>
                                <div className="sm:w-40">
                                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Date</label>
                                  <input
                                    type="date"
                                    value={editSessionDate}
                                    onChange={(e) => setEditSessionDate(e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950"
                                  />
                                </div>
                                <div className="flex gap-1">
                                  <button onClick={saveEditSession} className="inline-flex h-8 items-center gap-1 rounded-lg bg-blue-700 px-3 text-xs font-semibold text-white hover:bg-blue-800">
                                    <Check className="h-3.5 w-3.5" /> Save
                                  </button>
                                  <button onClick={cancelEditSession} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-300">
                                    <X className="h-3.5 w-3.5" /> Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="min-w-0">
                                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{session.title}</h3>
                                  <p className="text-xs text-slate-500">
                                    {new Date(session.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                    <span className="h-2 w-2 rounded-full bg-emerald-500" />{counts.present}
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                                    <span className="h-2 w-2 rounded-full bg-rose-500" />{counts.absent}
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                    <span className="h-2 w-2 rounded-full bg-amber-500" />{counts.late}
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                                    <span className="h-2 w-2 rounded-full bg-blue-500" />{counts.excused}
                                  </span>
                                  <button
                                    onClick={() => startEditSession(session)}
                                    className="ml-1 grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:border-slate-600 dark:text-slate-500 dark:hover:bg-slate-800"
                                    title="Edit session"
                                  >
                                    <ClipboardList className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => deleteAttendanceSession(session.id)}
                                    className="grid h-7 w-7 place-items-center rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 dark:border-rose-500/30 dark:hover:bg-rose-500/10"
                                    title="Delete session"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[500px] text-sm">
                              <thead>
                                <tr className="border-b border-slate-100 bg-white text-left text-xs uppercase tracking-[0.06em] text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                                  <th className="px-4 py-3">Student</th>
                                  <th className="px-4 py-3">Component</th>
                                  <th className="px-4 py-3 text-center">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {scopedStudents.map((student) => {
                                  const currentStatus = getStudentAttendance(student.studentId || student.id, session.id);
                                  return (
                                    <tr key={student.id} className="border-b border-slate-100 dark:border-slate-800">
                                      <td className="px-4 py-3">
                                        <p className="font-medium text-slate-900 dark:text-slate-100">{student.name}</p>
                                        <p className="text-xs text-slate-500">{student.studentId || student.email}</p>
                                      </td>
                                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{student.component}</td>
                                      <td className="px-4 py-3">
                                        <div className="flex items-center justify-center gap-1">
                                          {(['present', 'absent', 'late', 'excused'] as AttendanceStatus[]).map((status) => {
                                            const isActive = currentStatus === status;
                                            const btnColors: Record<AttendanceStatus, string> = {
                                              present: 'border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-500/40 dark:text-emerald-200 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/25',
                                              absent: 'border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 dark:border-rose-500/40 dark:text-rose-200 dark:bg-rose-500/15 dark:hover:bg-rose-500/25',
                                              late: 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 dark:border-amber-500/40 dark:text-amber-200 dark:bg-amber-500/15 dark:hover:bg-amber-500/25',
                                              excused: 'border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 dark:border-blue-500/40 dark:text-blue-200 dark:bg-blue-500/15 dark:hover:bg-blue-500/25',
                                            };
                                            const activeColors: Record<AttendanceStatus, string> = {
                                              present: 'border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-700 dark:border-emerald-400 dark:bg-emerald-500 dark:text-white',
                                              absent: 'border-rose-500 bg-rose-600 text-white hover:bg-rose-700 dark:border-rose-400 dark:bg-rose-500 dark:text-white',
                                              late: 'border-amber-500 bg-amber-600 text-white hover:bg-amber-700 dark:border-amber-400 dark:bg-amber-500 dark:text-white',
                                              excused: 'border-blue-500 bg-blue-600 text-white hover:bg-blue-700 dark:border-blue-400 dark:bg-blue-500 dark:text-white',
                                            };
                                            return (
                                              <button
                                                key={status}
                                                onClick={() => setAttendance(student, session.id, status)}
                                                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold leading-none transition-all ${
                                                  isActive ? activeColors[status] : btnColors[status]
                                                }`}
                                                title={status.charAt(0).toUpperCase() + status.slice(1)}
                                              >
                                                {status === 'present' && <CheckCircle className="h-3 w-3" />}
                                                {status === 'absent' && <X className="h-3 w-3" />}
                                                {status === 'late' && <Clock className="h-3 w-3" />}
                                                {status === 'excused' && <Check className="h-3 w-3" />}
                                                <span className="hidden sm:inline">{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            {scopedStudents.length === 0 && (
                              <div className="p-6 text-center text-sm text-slate-500">
                                No students assigned to your municipality yet.
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {view === 'reports' && (
              <section className="space-y-5">
                <div className="flex items-center gap-3">
                  <button onClick={() => setView('dashboard')} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300">
                    <ChevronDown className="h-4 w-4 rotate-90" />
                  </button>
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Reports</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Class analytics and grade distribution.</p>
                  </div>
                  <button
                    onClick={exportReportsPdf}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800"
                  >
                    <Download className="h-4 w-4" />
                    Export PDF
                  </button>
                </div>
                <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
                  <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Recent Assessments</h2>
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">{recentAssessments.length} total</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[680px] text-sm">
                        <thead>
                          <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                            <th className="px-4 py-3">Assessment</th>
                            <th className="px-4 py-3">Module</th>
                            <th className="px-4 py-3">Submissions</th>
                            <th className="px-4 py-3">Due Date</th>
                            <th className="px-4 py-3">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentAssessments.map((assessment, index) => (
                            <tr key={assessment.id} className="border-b border-slate-100 dark:border-slate-800">
                              <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{assessment.title}</td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{assessment.moduleId || 'General'}</td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{Math.max(0, scopedStudents.length - index * 4)} / {scopedStudents.length}</td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{new Date(assessment.updatedAt).toLocaleDateString()}</td>
                              <td className="px-4 py-3">
                                <span className={`rounded-full px-3 py-1 text-xs font-medium ${assessment.status === 'published' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                                  {assessment.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                  <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <h2 className="mb-4 text-lg font-semibold text-slate-950 dark:text-white">Grade Distribution</h2>
                    <div className="h-64 min-h-64 min-w-0">
                      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                        <BarChart data={gradeDistribution} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
                          <XAxis dataKey="range" tickLine={false} axisLine={false} fontSize={12} />
                          <YAxis tickLine={false} axisLine={false} fontSize={12} />
                          <Tooltip />
                          <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                            {gradeDistribution.map((entry, index) => <Cell key={entry.range} fill={gradeColors[index % gradeColors.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </article>
                </section>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
