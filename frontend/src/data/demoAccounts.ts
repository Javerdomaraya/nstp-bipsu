import type { AuthenticatedUser } from '../services/authUser';

export const DEMO_PASSWORD = 'Password123!';

export type DemoAccountMetadata = {
  role: 'admin' | 'coordinator' | 'facilitator' | 'student';
  identifier: string;
  name: string;
  title: string;
  badge: string;
  features: string[];
  user: AuthenticatedUser;
};

export const DEMO_ACCOUNTS: Record<string, DemoAccountMetadata> = {
  admin: {
    role: 'admin',
    identifier: 'admin@bipsu.edu.ph',
    name: 'Dr. Reynold G. Bustillo',
    title: 'NSTP Director & Dean',
    badge: 'Institutional Governor',
    features: [
      'Institutional KPIs & Biliran Municipality Overview',
      'Full Exclusive Authority: Review, Approve, or Reject pending student sign-ups',
      'Global student search across all colleges and municipalities',
      'System-wide audit metrics & master template controls',
      'Institution-wide semester grade view & compliance exports',
      'System-wide module audit & publishing oversight',
      'Master institutional assessment bank & CHED/LGU PDF layout controls',
    ],
    user: {
      id: 'demo-admin-001',
      name: 'Dr. Reynold G. Bustillo',
      email: 'admin@bipsu.edu.ph',
      role: 'admin',
      status: 'ACTIVE',
      title: 'NSTP Director & Dean',
      data: {
        title: 'NSTP Director & Dean',
        department: 'Office of the National Service Training Program',
        contactNumber: '09123456789',
      },
    },
  },
  coordinator: {
    role: 'coordinator',
    identifier: 'coordinator.cwts@bipsu.edu.ph',
    name: 'Prof. Maria Santos',
    title: 'CWTS Component Coordinator',
    badge: 'Track Overseer (CWTS)',
    features: [
      'Component KPIs & Student Distribution donut with accessible legend',
      'Roster Monitoring: Component student roster filtered by CWTS',
      'Attendance Audit tab: Audits field sessions, dates, facilitators, and learner turnout',
      'Track-level grade distribution & official completion audit',
      'Module Library: Full authoring, editing, duration, and draft controls for CWTS',
      'Track-level assessment linkage to component curriculum',
      'Facilitator Staffing: Provisions facilitators and assigns 1 to 3 municipalities',
      'Component-scoped completion analytics and grade rosters',
    ],
    user: {
      id: 'demo-coord-cwts-001',
      name: 'Prof. Maria Santos',
      email: 'coordinator.cwts@bipsu.edu.ph',
      role: 'coordinator',
      status: 'ACTIVE',
      title: 'CWTS Program Coordinator',
      coordinatorScope: 'CWTS',
      component: 'CWTS',
      data: {
        title: 'CWTS Program Coordinator',
        department: 'NSTP CWTS Component Unit',
        coordinatorScope: 'CWTS',
        contactNumber: '09123456781',
      },
    },
  },
  facilitator: {
    role: 'facilitator',
    identifier: 'facilitator.naval@bipsu.edu.ph',
    name: 'Engr. Juan Dela Cruz',
    title: 'NSTP Senior Field Facilitator',
    badge: 'Field Instructor (Naval & Almeria)',
    features: [
      'Cohort KPIs: Total Students, Sessions Held, Attendance Today %, Cohort Progress %',
      'My Students tab: Dedicated directory of students enrolled in assigned municipalities',
      'Attendance Sheet tab: Creates dated sessions and marks Present, Late, Excused, Absent',
      'Grade Book tab: Dedicated spreadsheet interface for midterm, final, and overall marks',
      'Module Library: Clean read-only guide for instructional delivery',
      'Instruction-based quiz & activity monitoring',
      'Class Grade Report PDF generation via client-side jsPDF',
    ],
    user: {
      id: 'demo-facilitator-001',
      name: 'Engr. Juan Dela Cruz',
      email: 'facilitator.naval@bipsu.edu.ph',
      role: 'facilitator',
      status: 'ACTIVE',
      title: 'NSTP Senior Field Facilitator',
      component: 'CWTS',
      municipalities: ['Naval', 'Almeria'],
      municipality: 'Naval',
      data: {
        title: 'NSTP Senior Field Facilitator',
        department: 'School of Technology and Computer Studies',
        municipalities: ['Naval', 'Almeria'],
        component: 'CWTS',
        contactNumber: '09123456783',
      },
    },
  },
  student: {
    role: 'student',
    identifier: '21-10042',
    name: 'Javer Domaraya',
    title: 'BSIT 1st Year (CWTS)',
    badge: 'Enrolled Learner',
    features: [
      'Enrolled track status, Module hours progress, and 1-tap shortcuts',
      'Personal profile & enrolled class section (CWTS-1A Naval)',
      'Attendance Log tab: Inspects personal session-by-session history and attendance rate',
      'Grades tab: Official transcript view of midterm/final marks and completion standing',
      'Modules tab: Interactive lessons, study hours tracker, post-module quizzes',
      'Assessments tab: Interactive timed quizzes and qualifying placement exams',
      'Assigned facilitator contact info displayed in class metadata',
      'Printable official student profile with completion seal',
    ],
    user: {
      id: 'demo-student-001',
      name: 'Javer Domaraya',
      email: 'student.cwts@bipsu.edu.ph',
      studentId: '21-10042',
      role: 'student',
      status: 'ACTIVE',
      component: 'CWTS',
      preferredComponent: 'CWTS',
      generalEducationComplete: true,
      examTaken: true,
      examScore: 92,
      componentAccessStatus: 'enrolled',
      municipality: 'Naval',
      data: {
        firstName: 'Javer',
        surname: 'Domaraya',
        studentId: '21-10042',
        school: 'Biliran Province State University',
        department: 'School of Technology and Computer Studies',
        degreeProgram: 'BS Information Technology',
        yearLevel: '1st Year',
        municipality: 'Naval',
        province: 'Biliran',
        contactNumber: '09123456784',
        generalEducationComplete: true,
        preferredComponent: 'CWTS',
        component: 'CWTS',
        examTaken: true,
        examScore: 92,
      },
    },
  },
};

export function findDemoAccount(identifier: string, role?: string): AuthenticatedUser | null {
  const cleanId = identifier.trim().toLowerCase();
  for (const demo of Object.values(DEMO_ACCOUNTS)) {
    const matchesId =
      demo.identifier.toLowerCase() === cleanId ||
      demo.user.email.toLowerCase() === cleanId ||
      ('studentId' in demo.user && (demo.user as any).studentId?.toLowerCase() === cleanId);

    const matchesRole = !role || demo.role === role.toLowerCase();
    if (matchesId && matchesRole) {
      return demo.user;
    }
  }

  // Also support legacy alias 'instructor.cwts@bipsu.edu.ph' mapped to facilitator
  if (cleanId === 'instructor.cwts@bipsu.edu.ph' && (!role || role === 'facilitator')) {
    return DEMO_ACCOUNTS.facilitator.user;
  }

  return null;
}
