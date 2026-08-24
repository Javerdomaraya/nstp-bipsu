import { useEffect, useMemo, useState } from 'react';
import { Activity, BookOpen, CheckCircle2, ClipboardCheck, Clock3, FileDown, FileSpreadsheet, Filter, Gauge, Layers, Loader2, ShieldAlert, TrendingUp } from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { loadAccounts, loadAssessments, loadModules, loadStudents, loadTrainingGroups, NstpAccount, NstpAssessment, NstpComponent, NstpModule, NstpStudent, NstpTrainingGroup, UNASSIGNED_COMPONENT_LABEL } from '../data/nstpData';
import { createXlsxWorkbook } from '../utils/xlsxExport';
import { apiGet } from '../services/apiClient';
import { fetchAdminGrades, fetchCoordinatorGrades, type SemesterGrade } from '../services/grades';
import { fetchCoordinatorStudents, fetchCoordinatorTrainingGroups } from '../services/coordinator';
import type { AuthenticatedUser } from '../services/authUser';
import { fetchManagedModules } from '../services/modules';
import { fetchManagedAssessments } from '../services/assessments';
import { facilitatorRecordToAccount, fetchMyFacilitators } from '../services/staff';
import { useCoordinatorScope } from '../hooks/useCoordinatorScope';
import { getCurrentAcademicYear } from '../utils/academicYear';

const PALETTE = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];

type ReportProfile = 'executive' | 'academic' | 'operations';
type StudentReportTab = 'overview' | 'academic' | 'components' | 'activity';

/**
 * Everything the report renders, whatever the role. Both branches below produce
 * this same shape, so the rest of the component never needs to know which source
 * it came from — and never needs a second `isCoordinator ? … : …` per field.
 */
type ReportSource = {
  students: NstpStudent[];
  modules: NstpModule[];
  assessments: NstpAssessment[];
  facilitators: NstpAccount[];
  trainingGroups: NstpTrainingGroup[];
};

const EMPTY_REPORT_SOURCE: ReportSource = {
  students: [], modules: [], assessments: [], facilitators: [], trainingGroups: [],
};

/**
 * Reads the client snapshot store that `syncAllFromApi` populates from the
 * `/nstp/admin/*` endpoints.
 *
 * Called from exactly one place: the non-coordinator branch of the ternary in
 * `ReportsCenter`. That structure is the point. The loaders used to be invoked
 * unconditionally at the top of the component and the results discarded for
 * coordinators, which meant a coordinator's render did read admin-scoped
 * localStorage — harmless only for as long as nobody wired one of those values
 * into a coordinator code path by mistake. Keeping the calls inside this function
 * makes "a coordinator never reads the admin snapshot" a property of the control
 * flow rather than a promise in a comment.
 */
function loadSnapshotReportSource(): ReportSource {
  return {
    students: loadStudents(),
    modules: loadModules(),
    assessments: loadAssessments(),
    facilitators: loadAccounts().filter((account) => account.role === 'facilitator'),
    trainingGroups: loadTrainingGroups(),
  };
}

export default function ReportsCenter({ user }: { user: AuthenticatedUser }) {
  const [profile, setProfile] = useState<ReportProfile>('executive');
  const [studentReportTab, setStudentReportTab] = useState<StudentReportTab>('overview');
  const [exportState, setExportState] = useState<'idle' | 'working' | 'error'>('idle');

  const isCoordinator = user.role === 'coordinator';
  const coordinatorScope = useCoordinatorScope(isCoordinator ? user : null);

  const [coordinatorData, setCoordinatorData] = useState<ReportSource>(EMPTY_REPORT_SOURCE);
  const [coordinatorLoading, setCoordinatorLoading] = useState(isCoordinator);
  const [coordinatorError, setCoordinatorError] = useState<string | null>(null);
  const [grades, setGrades] = useState<SemesterGrade[]>([]);
  const [gradeError, setGradeError] = useState<string | null>(null);

  useEffect(() => {
    // Deliberately keyed on the resolved scope: no request is issued, and no
    // figure is rendered, until the server has confirmed which program this
    // coordinator owns.
    if (!isCoordinator || !coordinatorScope.scope) return;
    let cancelled = false;
    setCoordinatorLoading(true);
    setCoordinatorError(null);

    (async () => {
      try {
        const moduleRecords = await fetchManagedModules('coordinator');
        // Student progress is measured against the published modules in this
        // coordinator's own scope, so the percentage comes from real records.
        const publishedTarget = moduleRecords.filter((module) => (module.status || 'DRAFT') === 'PUBLISHED').length;
        const [students, assessments, facilitators, trainingGroups] = await Promise.all([
          fetchCoordinatorStudents(publishedTarget),
          fetchManagedAssessments('coordinator'),
          fetchMyFacilitators(),
          fetchCoordinatorTrainingGroups(),
        ]);
        if (cancelled) return;
        setCoordinatorData({
          students,
          modules: moduleRecords,
          assessments,
          facilitators: facilitators.map(facilitatorRecordToAccount),
          trainingGroups,
        });
      } catch (error) {
        if (cancelled) return;
        // The report renders an explicit failure rather than falling back to the
        // snapshot store, which would silently show unrelated data.
        setCoordinatorData(EMPTY_REPORT_SOURCE);
        setCoordinatorError(error instanceof Error ? error.message : 'Unable to load component report data.');
      } finally {
        if (!cancelled) setCoordinatorLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isCoordinator, coordinatorScope.scope]);

  // The single fork in the data path. A coordinator's figures come only from
  // coordinator-scoped endpoints; every other role reads the snapshot store,
  // which is correct for them because it is populated from the admin endpoints
  // their session is entitled to.
  const { students, modules, assessments, facilitators, trainingGroups } = isCoordinator
    ? coordinatorData
    : loadSnapshotReportSource();

  useEffect(() => {
    const schoolYear = getCurrentAcademicYear();
    setGradeError(null);
    if (user.role === 'student') {
      apiGet<{ success: boolean; data: SemesterGrade[] }>('/nstp/students/me/grades').then((response) => setGrades(response.data)).catch(() => setGrades([]));
    } else if (user.role === 'admin') {
      Promise.all([
        fetchAdminGrades({ schoolYear, semester: 'FIRST', pageSize: 100 }),
        fetchAdminGrades({ schoolYear, semester: 'SECOND', pageSize: 100 }),
      ]).then(([first, second]) => setGrades([...first.data, ...second.data])).catch(() => setGrades([]));
    } else if (isCoordinator && coordinatorScope.scope) {
      // /nstp/coordinators/grades ignores any client componentId and restricts
      // the result to the coordinator's own components server-side.
      Promise.all([
        fetchCoordinatorGrades({ schoolYear, semester: 'FIRST', pageSize: 100 }),
        fetchCoordinatorGrades({ schoolYear, semester: 'SECOND', pageSize: 100 }),
      ]).then(([first, second]) => {
        setGrades([...first.data, ...second.data]);
        setGradeError(null);
      }).catch((error) => {
        setGrades([]);
        setGradeError(error instanceof Error ? error.message : 'Unable to load coordinator grades.');
      });
    } else setGrades([]);
  }, [user.id, user.role, isCoordinator, coordinatorScope.scope]);

  const roleScopedAssessments = useMemo(() => {
    if (user.role === 'facilitator') {
      return assessments.filter((assessment) => assessment.ownerId === user.id);
    }
    return assessments;
  }, [assessments, user.id, user.role]);

  const matchedStudent = useMemo(() => {
    return students.find((student) => {
      const sameEmail = student.email.toLowerCase() === String(user.email || '').toLowerCase();
      const firstName = String(user.name || '').trim().split(' ')[0]?.toLowerCase();
      const containsName = firstName ? student.name.toLowerCase().includes(firstName) : false;
      return sameEmail || containsName;
    });
  }, [students, user.email, user.name]);

  const visibleStudents = useMemo(() => {
    if (user.role !== 'student') return students;
    return matchedStudent ? [matchedStudent] : students.slice(0, 1);
  }, [matchedStudent, students, user.role]);

  const statusData = useMemo(() => {
    const source = user.role === 'student' ? visibleStudents : students;
    const counts = source.reduce(
      (acc, student) => {
        acc[student.status] += 1;
        return acc;
      },
      { active: 0, pending: 0, graduated: 0 },
    );

    return [
      { name: 'Active', value: counts.active },
      { name: 'Pending', value: counts.pending },
      { name: 'Graduated', value: counts.graduated },
    ];
  }, [students, user.role, visibleStudents]);

  const componentData = useMemo(() => {
    const source = user.role === 'student' ? visibleStudents : students;
    const map = source.reduce<Record<string, number>>((acc, student) => {
      // Students without a component are counted as unassigned rather than
      // folded into a component they were never placed in.
      const bucket = student.component ?? UNASSIGNED_COMPONENT_LABEL;
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [students, user.role, visibleStudents]);

  const progressBandData = useMemo(() => {
    const source = user.role === 'student' ? visibleStudents : students;
    return [
      { band: '0-49', students: source.filter((student) => student.progress < 50).length },
      { band: '50-69', students: source.filter((student) => student.progress >= 50 && student.progress < 70).length },
      { band: '70-89', students: source.filter((student) => student.progress >= 70 && student.progress < 90).length },
      { band: '90-100', students: source.filter((student) => student.progress >= 90).length },
    ];
  }, [students, user.role, visibleStudents]);

  const trendData = useMemo(() => {
    const source = user.role === 'student' ? visibleStudents : students;
    return [...source]
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 10)
      .map((student) => ({
        label: student.name.split(' ')[0],
        progress: student.progress,
        assessments: student.assessments,
      }));
  }, [students, user.role, visibleStudents]);

  const difficultyData = useMemo(() => {
    const map = modules.reduce<Record<string, number>>((acc, module) => {
      acc[module.difficulty] = (acc[module.difficulty] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [modules]);

  const totalStudents = user.role === 'student' ? visibleStudents.length : students.length;
  const avgProgress = totalStudents > 0
    ? Math.round((user.role === 'student' ? visibleStudents : students).reduce((sum, student) => sum + student.progress, 0) / totalStudents)
    : 0;
  const completionRate = totalStudents > 0
    ? Math.round(((user.role === 'student' ? visibleStudents : students).filter((student) => student.progress === 100).length / totalStudents) * 100)
    : 0;

  const publishedAssessments = roleScopedAssessments.filter((assessment) => assessment.status === 'published').length;
  const totalModuleHours = modules.reduce((sum, module) => sum + module.hours, 0);
  const modulesWithTests = modules.filter((module) => assessments.some((assessment) => assessment.status === 'published' && assessment.moduleId === module.id)).length;
  const majorExams = assessments.filter((assessment) => assessment.status === 'published' && assessment.type === 'exam').length;
  const studentsNeedingIntervention = (user.role === 'student' ? visibleStudents : students).filter((student) => student.progress < 70).length;
  const topPerformer = [...(user.role === 'student' ? visibleStudents : students)].sort((a, b) => b.progress - a.progress)[0];

  const reportRows = useMemo(() => {
    const source = user.role === 'student' ? visibleStudents : students;
    return source.map((student: NstpStudent) => [
      student.studentId || student.id,
      student.name,
      student.email,
      student.degreeProgram || '',
      student.assignedMunicipality || student.municipality || '',
      student.facilitatorName || '',
      student.component ?? UNASSIGNED_COMPONENT_LABEL,
      `${student.progress}%`,
      String(student.assessments),
      student.status,
    ]);
  }, [students, user.role, visibleStudents]);

  const gradeRows = useMemo(() => {
    const sourceIds = new Set((user.role === 'student' ? visibleStudents : students).flatMap((student) => [student.studentId, student.id].filter(Boolean)));
    return grades
      .filter((grade) => user.role === 'student' || sourceIds.has(grade.student?.studentNumber || grade.studentId))
      .map((grade) => [
        grade.student?.studentNumber || grade.studentId,
        grade.schoolYear,
        grade.semester === 'FIRST' ? 'First Semester' : 'Second Semester',
        grade.percentEquivalent,
        grade.numericalEquivalent,
        grade.classification.replace(/_/g, ' '),
        grade.remarks || '',
        grade.isReleased ? 'Released' : 'Held',
        new Date(grade.updatedAt).toLocaleString(),
      ]);
  }, [grades, students, user.role, visibleStudents]);

  const facilitatorRows = useMemo(() => facilitators.map((facilitator) => [
    facilitator.name,
    facilitator.email,
    facilitator.municipalities?.join(', ') || 'Unassigned',
    String(students.filter((student) => student.facilitatorId === facilitator.id || facilitator.municipalities?.includes((student.assignedMunicipality || student.municipality) as any)).length),
  ]), [facilitators, students]);

  const trainingGroupRows = useMemo(() => trainingGroups.map((group) => [
    group.schoolYear,
    group.semester,
    group.component,
    group.facilitatorName,
    group.municipality || 'Program based',
    group.programHandles.join(', '),
    String(group.studentCount),
    group.studentCount > group.maxRecommendedLoad ? 'Over recommended load' : 'Within load',
  ]), [trainingGroups]);

  const exportExcel = async () => {
    setExportState('working');

    try {

    const summaryAoA = [
      ['NSTP Report Summary'],
      ['Role', user.role],
      ...(isCoordinator ? [['Component Scope', coordinatorScope.label]] : []),
      ['Profile', profile],
      ['Generated At', new Date().toLocaleString()],
      ['Total Students', String(totalStudents)],
      ['Average Progress', `${avgProgress}%`],
      ['Completion Rate', `${completionRate}%`],
      ['Published Assessments', String(publishedAssessments)],
      ['Total Modules', String(modules.length)],
      ['Total Module Hours', String(totalModuleHours)],
    ];

    const studentRows = [
      ['Student ID', 'Name', 'Email', 'Program', 'Municipality', 'Facilitator', 'Component', 'Progress', 'Assessments', 'Status'],
      ...reportRows,
    ];

    const gradeRowsForExport = [
      ['Student ID', 'School Year', 'Semester', 'Percent Grade', 'Numerical Grade', 'Classification', 'Remarks', 'Release Status', 'Updated At'],
      ...gradeRows,
    ];

    const moduleRows = [
      ['Module', 'Difficulty', 'Hours', 'Updated At'],
      ...modules.map((module) => [module.title, module.difficulty, module.hours, module.updatedAt]),
    ];

    const assessmentRows = [
      ['Assessment', 'Type', 'Status', 'Owner', 'Passing Score', 'Questions'],
      ...roleScopedAssessments.map((assessment) => [
        assessment.title,
        assessment.type,
        assessment.status,
        assessment.ownerName,
        assessment.passingScore,
        assessment.questions.length,
      ]),
    ];

    const facilitatorRowsForExport = [
      ['Facilitator', 'Email', 'Municipalities', 'Students'],
      ...facilitatorRows,
    ];

    const trainingGroupRowsForExport = [
      ['School Year', 'Semester', 'Component', 'Facilitator', 'Municipality', 'Program Handles', 'Students', 'Load Status'],
      ...trainingGroupRows,
    ];

      const blob = new Blob([createXlsxWorkbook([
        { name: 'Summary', rows: summaryAoA },
        { name: 'Students', rows: studentRows },
        { name: 'Grades', rows: gradeRowsForExport },
        { name: 'Modules', rows: moduleRows },
        { name: 'Assessments', rows: assessmentRows },
        { name: 'Facilitators', rows: facilitatorRowsForExport },
        { name: 'Training Groups', rows: trainingGroupRowsForExport },
      ])], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `nstp-reports-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      setExportState('idle');
    } catch {
      setExportState('error');
    }
  };

  const exportPdf = async () => {
    setExportState('working');

    try {
      const [jspdfModule, autoTableModule] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const JsPDF = jspdfModule.default;
      const autoTable = autoTableModule.default;

      const doc = new JsPDF({ orientation: 'landscape' });

    doc.setFontSize(16);
    doc.text('NSTP Analytics Report', 14, 14);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 21);
    doc.text(`Role: ${String(user.role).toUpperCase()}  |  Profile: ${profile.toUpperCase()}${isCoordinator ? `  |  Component: ${coordinatorScope.label}` : ''}`, 14, 27);

      const addReportTable = (title: string, head: string[], body: string[][], color: [number, number, number]) => {
        const currentY = ((doc as any).lastAutoTable?.finalY || 34) + 12;
        if (currentY > 170) doc.addPage();
        const startY = currentY > 170 ? 24 : ((doc as any).lastAutoTable?.finalY || 28) + 18;
        doc.setFontSize(11);
        doc.text(title, 14, startY - 4);
        autoTable(doc, {
          startY,
          head: [head],
          body,
          styles: { fontSize: 7, overflow: 'linebreak', cellPadding: 2 },
          headStyles: { fillColor: color },
          margin: { left: 14, right: 14 },
        });
      };

      autoTable(doc, {
        startY: 34,
        head: [['Metric', 'Value']],
        body: [
          ['Total Students', String(totalStudents)],
          ['Average Progress', `${avgProgress}%`],
          ['Completion Rate', `${completionRate}%`],
          ['Published Assessments', String(publishedAssessments)],
          ['Total Modules', String(modules.length)],
          ['Total Module Hours', String(totalModuleHours)],
        ],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235] },
      });

      addReportTable('Student Roster', ['Student ID', 'Name', 'Email', 'Program', 'Municipality', 'Facilitator', 'Component', 'Progress', 'Assessments', 'Status'], reportRows, [15, 118, 110]);
      addReportTable('Grade Records', ['Student ID', 'School Year', 'Semester', 'Percent', 'Numerical', 'Classification', 'Remarks', 'Release', 'Updated'], gradeRows, [37, 99, 235]);
      addReportTable('Module Library', ['Module', 'Component', 'Difficulty', 'Hours', 'Source'], modules.map((module) => [
        module.title,
        module.component || 'Common',
        module.difficulty,
        String(module.hours),
        module.sourceDocument || 'System',
      ]), [79, 70, 229]);
      addReportTable('Assessment Bank', ['Assessment', 'Type', 'Status', 'Owner', 'Passing', 'Questions'], roleScopedAssessments.map((assessment) => [
        assessment.title,
        assessment.type,
        assessment.status,
        assessment.ownerName,
        `${assessment.passingScore}%`,
        String(assessment.questions.length),
      ]), [234, 88, 12]);
      // Both collections are safe for a coordinator, and for the same reason: the
      // rows came from scoped endpoints. Facilitators from
      // /coordinators/facilitators, which returns only the facilitators they own;
      // training groups from /nstp/coordinators/component/training-groups, whose
      // query restricts the rows to the coordinator's own components. The PDF
      // used to omit training groups for coordinators — a leftover from before
      // that endpoint existed — while the on-screen table and the XLSX export
      // already included them, so the same report disagreed with itself.
      if (user.role === 'admin' || isCoordinator) {
        addReportTable('Facilitator Assignments', ['Facilitator', 'Email', 'Municipalities', 'Students'], facilitatorRows, [8, 145, 178]);
        addReportTable('Training Groups', ['School Year', 'Semester', 'Component', 'Facilitator', 'Municipality', 'Programs', 'Students', 'Load'], trainingGroupRows, [22, 163, 74]);
      }

      doc.save(`nstp-reports-${new Date().toISOString().slice(0, 10)}.pdf`);
      setExportState('idle');
    } catch {
      setExportState('error');
    }
  };

  // A coordinator report is component-specific, so it stays behind the same gate
  // as the rest of the coordinator surface: nothing is rendered or exported
  // until the server has confirmed the assigned program. Falling through to a
  // default would produce a report labelled with the wrong component.
  if (isCoordinator && coordinatorScope.state.status !== 'ready') {
    return (
      <div className="grid min-h-[60vh] place-items-center p-8">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950">
          {coordinatorScope.state.status === 'resolving' ? (
            <div role="status" className="space-y-3">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-700" aria-hidden="true" />
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Confirming your coordinator program…</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Reports stay hidden until the server confirms your assigned NSTP program.</p>
            </div>
          ) : (
            <div role="alert" className="space-y-3">
              <ShieldAlert className="mx-auto h-8 w-8 text-rose-600" aria-hidden="true" />
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Coordinator program unavailable</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{coordinatorScope.state.message}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (user.role === 'student') {
    // The roster record is the real subject of this report. When it has not synced
    // yet the screen falls back to the session, and the fallback is typed with
    // `component: NstpComponent | null` on purpose: the previous `|| 'CWTS'`
    // invented a classification, so an unclassified student was shown a full CWTS
    // report — cohort comparisons included — as if it were their own.
    type StudentReportSubject = Omit<NstpStudent, 'component'> & { component: NstpComponent | null };
    const student: StudentReportSubject = matchedStudent || visibleStudents[0] || {
      name: user.name || 'Student',
      email: user.email || '',
      component: user.component ?? null,
      progress: 0,
      assessments: 0,
      status: 'pending',
      studentId: user.studentId || user.id,
      municipality: user.municipality || '',
      notes: '',
      updatedAt: new Date().toISOString(),
      id: user.id || 'student',
    };
    const componentLabel = student.component ?? UNASSIGNED_COMPONENT_LABEL;
    const relevantModules = modules.filter((module) => module.component === 'Common' || module.component === student.component);
    const moduleTarget = Math.max(1, relevantModules.length || 8);
    const modulesCompleted = Math.min(moduleTarget, Math.max(0, Math.round((student.progress / 100) * moduleTarget)));
    const assessmentTarget = Math.max(1, publishedAssessments || 9);
    const assessmentsCompleted = Math.min(assessmentTarget, Math.max(student.assessments || 0, Math.round((student.progress / 100) * assessmentTarget)));
    const studentGrade = grades.find((grade) => grade.student?.studentNumber === student.studentId || grade.studentId === student.id) || (user.role === 'student' ? grades[0] : undefined);
    const scoreSource = studentGrade?.percentGrade || Math.max(70, Math.min(98, student.progress));
    const overallAverage = Math.round(scoreSource);
    const requiredHours = 25;
    const completedHours = Math.max(requiredHours, Math.round((totalModuleHours || requiredHours) * Math.max(student.progress, 1) / 100));
    const programCompletion = Math.round(((modulesCompleted / moduleTarget) * 55) + ((assessmentsCompleted / assessmentTarget) * 30) + (studentGrade?.isReleased ? 15 : 3));
    const monthTrend = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'].map((month, index, rows) => {
      const start = Math.max(45, overallAverage - 22);
      const value = Math.min(overallAverage, Math.round(start + ((overallAverage - start) / Math.max(1, rows.length - 1)) * index + (index % 2 === 0 ? 0 : 2)));
      return { month, score: value };
    });
    const componentBreakdown = [
      { name: 'CWTS', value: student.component === 'CWTS' ? 56 : 18, avg: student.component === 'CWTS' ? overallAverage : 91, color: '#10b981' },
      { name: 'CWTS (Coast Guard)', value: student.component === 'CWTS (Coast Guard)' ? 56 : 10, avg: student.component === 'CWTS (Coast Guard)' ? overallAverage : 90, color: '#06b6d4' },
      { name: 'LTS', value: student.component === 'LTS' ? 56 : 22, avg: student.component === 'LTS' ? overallAverage : 91, color: '#2563eb' },
      { name: 'MTS (Army)', value: student.component === 'MTS (Army)' ? 56 : 11, avg: student.component === 'MTS (Army)' ? overallAverage : 90, color: '#f97316' },
      { name: 'MTS (Navy)', value: student.component === 'MTS (Navy)' ? 56 : 11, avg: student.component === 'MTS (Navy)' ? overallAverage : 93, color: '#7c3aed' },
    ];
    const recentAssessments = roleScopedAssessments.filter((assessment) => assessment.status === 'published').slice(0, 5).map((assessment, index) => ({
      title: assessment.title,
      module: modules.find((module) => module.id === assessment.moduleId)?.title || `Module ${Math.max(1, index + 3)}`,
      score: Math.max(75, Math.min(99, overallAverage + ((index % 2 === 0 ? 2 : -2) * index))),
      date: new Date(Date.now() - index * 6 * 24 * 60 * 60 * 1000).toLocaleDateString(),
    }));
    const activityRows = [
      ['Component placement', student.component ? `${student.component} component assigned` : 'Component not yet assigned'],
      ['Module progress', `${modulesCompleted} of ${moduleTarget} modules completed`],
      ['Assessment status', `${assessmentsCompleted} of ${assessmentTarget} assessments completed`],
      ['Grade release', studentGrade?.isReleased ? `${studentGrade.semester === 'FIRST' ? 'First' : 'Second'} Semester grade released` : 'Semester grade pending'],
    ];

    return (
      <div className="space-y-5 overflow-auto pr-1">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Student Portal</p>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">Reports</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your performance overview, academic records, component standing, and activity log.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={exportPdf} disabled={exportState === 'working'} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-blue-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <FileDown className="h-4 w-4" />
                Export PDF
              </button>
              <button onClick={exportExcel} disabled={exportState === 'working'} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-60">
                <FileSpreadsheet className="h-4 w-4" />
                Export Excel
              </button>
            </div>
          </div>
          {exportState === 'working' && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Preparing your report file...</p>}
          {exportState === 'error' && <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">Export failed. Please try again.</p>}
        </section>

        <section className="grid gap-4 xl:grid-cols-4">
          {[
            { label: 'Overall Average', value: `${overallAverage}%`, detail: overallAverage >= 90 ? 'Excellent' : overallAverage >= 80 ? 'On Track' : 'Needs Support', icon: Gauge, color: '#2563eb' },
            { label: 'Modules Completed', value: `${modulesCompleted} / ${moduleTarget}`, detail: `${Math.round((modulesCompleted / moduleTarget) * 100)}% complete`, icon: BookOpen, color: '#7c3aed' },
            { label: 'Total NSTP Hours', value: `${completedHours} / ${requiredHours}`, detail: 'Hours completed', icon: CheckCircle2, color: '#10b981' },
            { label: 'Assessments Completed', value: `${assessmentsCompleted} / ${assessmentTarget}`, detail: `${Math.round((assessmentsCompleted / assessmentTarget) * 100)}% complete`, icon: ClipboardCheck, color: '#f97316' },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <article key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{stat.label}</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight" style={{ color: stat.color }}>{stat.value}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{stat.detail}</p>
                  </div>
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-slate-50 dark:bg-slate-900">
                    <Icon className="h-7 w-7" style={{ color: stat.color }} />
                  </span>
                </div>
              </article>
            );
          })}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-wrap gap-1 border-b border-slate-200 px-4 pt-3 dark:border-slate-800">
            {[
              { id: 'overview', label: 'Overview', icon: FileDown },
              { id: 'academic', label: 'Academic Reports', icon: ClipboardCheck },
              { id: 'components', label: 'Component Breakdown', icon: Layers },
              { id: 'activity', label: 'Activity Log', icon: Activity },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = studentReportTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setStudentReportTab(tab.id as StudentReportTab)} className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${active ? 'border-blue-700 text-blue-700 dark:border-blue-300 dark:text-blue-200' : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'}`}>
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="font-semibold text-slate-950 dark:text-white">{studentReportTab === 'activity' ? 'Activity Timeline' : 'Performance Over Time'}</h3>
                <span className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">{componentLabel}</span>
              </div>
              {studentReportTab === 'activity' ? (
                <div className="space-y-3">
                  {activityRows.map(([label, detail], index) => (
                    <div key={label} className="flex gap-3 rounded-2xl border border-slate-100 p-4 dark:border-slate-800">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">{index + 1}</span>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{label}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-72 min-h-72">
                  <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <LineChart data={monthTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" />
                      <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                      <Tooltip formatter={(value) => [`${value}%`, 'Score']} />
                      <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="font-semibold text-slate-950 dark:text-white">Component Breakdown</h3>
                <span className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">By Weight</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-1 2xl:grid-cols-[14rem_minmax(0,1fr)]">
                <div className="relative h-56 min-h-56">
                  <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <PieChart>
                      <Pie data={componentBreakdown} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2}>
                        {componentBreakdown.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <span><span className="block text-3xl font-semibold text-blue-700 dark:text-blue-300">{overallAverage}%</span><span className="text-xs text-slate-500 dark:text-slate-400">Average</span></span>
                  </div>
                </div>
                <div className="space-y-3 self-center">
                  {componentBreakdown.map((item) => (
                    <div key={item.name} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span>
                      <span className="text-slate-500 dark:text-slate-400">{item.value}% (Avg. {item.avg}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-slate-950 dark:text-white">{studentReportTab === 'academic' ? 'Academic Report Items' : 'Recent Assessments'}</h3>
              <button className="text-sm font-semibold text-blue-700 dark:text-blue-300">View all</button>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr><th className="px-4 py-3">Assessment</th><th className="px-4 py-3">Module</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Date Passed</th></tr>
                </thead>
                <tbody>
                  {recentAssessments.map((assessment) => (
                    <tr key={assessment.title} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{assessment.title}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{assessment.module}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{assessment.score}%</td>
                      <td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">Passed</span></td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{assessment.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {recentAssessments.length === 0 && <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">No published assessments are available yet.</div>}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-950 dark:text-white">Program Completion</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Progress to completion</p>
              </div>
              <span className="text-2xl font-semibold text-slate-950 dark:text-white">{programCompletion}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${programCompletion}%` }} /></div>
            <div className="mt-5 space-y-3">
              {[
                ['NSTP Hours Requirement', `${completedHours} / ${requiredHours} hours`, completedHours >= requiredHours],
                ['Modules Completed', `${modulesCompleted} / ${moduleTarget} modules`, modulesCompleted >= moduleTarget],
                ['Semester Grade', studentGrade?.isReleased ? 'Released' : 'Pending', Boolean(studentGrade?.isReleased)],
              ].map(([label, detail, done]) => (
                <div key={label as string} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">{done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock3 className="h-4 w-4 text-slate-400" />}{label as string}</span>
                  <span className="text-slate-500 dark:text-slate-400">{detail as string}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
              <span className="font-semibold text-slate-900 dark:text-slate-100">Program Status</span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${programCompletion >= 85 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200'}`}>{programCompletion >= 85 ? 'On Track' : 'Needs Review'}</span>
            </div>
          </article>
        </section>
      </div>
    );
  }

  return (
    <div className="bento-screen space-y-4 overflow-auto pr-1">
      <div className="bento-panel animate-rise-in p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] font-semibold text-blue-700 dark:text-blue-300">Reports Module</p>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {isCoordinator ? `${coordinatorScope.label} Analytics and Decision Dashboard` : 'Analytics and Decision Dashboard'}
            </h2>
            <p className="text-sm text-slate-600 mt-1 dark:text-slate-300">
              {isCoordinator
                ? `Every figure below is restricted by the server to your ${coordinatorScope.label} component records.`
                : 'Centralized reporting with export-ready data for academic planning and program governance.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={exportPdf}
              disabled={exportState === 'working' || coordinatorLoading}
              className="clickable-button inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <FileDown className="w-4 h-4 text-rose-600" />
              Export PDF
            </button>
            <button
              onClick={exportExcel}
              disabled={exportState === 'working' || coordinatorLoading}
              className="clickable-button inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Export Excel
            </button>
          </div>
        </div>
        {exportState === 'working' && (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Preparing export file...</p>
        )}
        {exportState === 'error' && (
          <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">Export failed. Please try again.</p>
        )}
        {isCoordinator && coordinatorLoading && (
          <p role="status" className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading {coordinatorScope.label} component records…
          </p>
        )}
        {isCoordinator && !coordinatorLoading && coordinatorError && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {coordinatorError}
          </p>
        )}
        {isCoordinator && gradeError && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            Grade data is unavailable: {gradeError}
          </p>
        )}
        {isCoordinator && !coordinatorLoading && !coordinatorError && students.length === 0 && (
          <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            No students are enrolled in {coordinatorScope.label} yet, so the figures below are all zero.
          </p>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="bento-panel p-4">
          <p className="text-xs uppercase tracking-[0.16em] font-semibold text-blue-700 dark:text-blue-300">Executive Summary</p>
          <h3 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{studentsNeedingIntervention} students need intervention</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Prioritize learners below 70% progress for mentoring, remediation, and schedule follow-ups.</p>
        </div>
        <div className="bento-panel p-4">
          <p className="text-xs uppercase tracking-[0.16em] font-semibold text-emerald-700 dark:text-emerald-300">Top Performer</p>
          <h3 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{topPerformer?.name || 'N/A'} - {topPerformer?.progress || 0}%</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Highlight best-performing students as peer mentors to improve cohort outcomes.</p>
        </div>
        <div className="bento-panel p-4">
          <p className="text-xs uppercase tracking-[0.16em] font-semibold text-blue-700 dark:text-blue-300">Objective Coverage</p>
          <h3 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{totalModuleHours}/25 hours tracked</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{modulesWithTests}/{modules.length} modules have tests and {majorExams} major exam{majorExams === 1 ? '' : 's'} are published.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="posh-kpi animate-rise-in stagger-1">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Total students</p>
          <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-slate-100">{totalStudents}</p>
        </div>
        <div className="posh-kpi animate-rise-in stagger-2">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Average progress</p>
          <p className="mt-1 text-3xl font-bold text-blue-700 dark:text-blue-300">{avgProgress}%</p>
        </div>
        <div className="posh-kpi animate-rise-in stagger-3">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Completion rate</p>
          <p className="mt-1 text-3xl font-bold text-emerald-600 dark:text-emerald-300">{completionRate}%</p>
        </div>
        <div className="posh-kpi animate-rise-in">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Published assessments</p>
          <p className="mt-1 text-3xl font-bold text-amber-600 dark:text-amber-300">{publishedAssessments}</p>
        </div>
      </div>

      <div className="bento-panel animate-rise-in p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <Filter className="w-4 h-4 text-blue-700" />
            Report profile
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-950">
            <button
              onClick={() => setProfile('executive')}
              className={`clickable-button px-3 py-1.5 rounded-lg text-sm font-semibold ${profile === 'executive' ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}
            >
              Executive
            </button>
            <button
              onClick={() => setProfile('academic')}
              className={`clickable-button px-3 py-1.5 rounded-lg text-sm font-semibold ${profile === 'academic' ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}
            >
              Academic
            </button>
            <button
              onClick={() => setProfile('operations')}
              className={`clickable-button px-3 py-1.5 rounded-lg text-sm font-semibold ${profile === 'operations' ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}
            >
              Operations
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3 inline-flex items-center gap-2">
            <Gauge className="w-4 h-4 text-blue-700" />
            Status Distribution
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3 inline-flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-600" />
            Component Distribution
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <PieChart>
                <Pie data={componentData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={88} label>
                  {componentData.map((item, index) => (
                    <Cell key={`component-${item.name}`} fill={PALETTE[index % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3 inline-flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            Progress Band Analysis
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <BarChart data={progressBandData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="band" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="students" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Student Progress and Assessments</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="progress" stroke="#2563eb" strokeWidth={2} />
                <Line type="monotone" dataKey="assessments" stroke="#f59e0b" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Module Difficulty Mix</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <BarChart data={difficultyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#7c3aed" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
