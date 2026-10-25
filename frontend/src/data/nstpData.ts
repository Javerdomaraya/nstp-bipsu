import { ApiRequestError, apiGet, apiPost, apiDel } from '../services/apiClient';
import { toCoordinatorScope, toNstpComponent, type CoordinatorScope, type NstpComponent } from './nstpComponents';
import {
  DEMO_ACCOUNTS_SEED,
  DEMO_ASSESSMENTS_SEED,
  DEMO_ATTENDANCE_RECORDS_SEED,
  DEMO_ATTENDANCE_SESSIONS_SEED,
  DEMO_GRADES_SEED,
  DEMO_MODULES_SEED,
  DEMO_PENDING_REGISTRATIONS_SEED,
  DEMO_STUDENTS_SEED,
} from './demoSeedData';

// The component and coordinator-scope vocabularies live in their own
// dependency-free module so the security-critical parsers can be imported (and
// tested) without pulling in the API client. Re-exported here because they are
// part of this module's public surface and every screen already imports them
// from `nstpData`.
export { NSTP_COMPONENTS, toNstpComponent, UNASSIGNED_COMPONENT_LABEL, COORDINATOR_SCOPES, toCoordinatorScope } from './nstpComponents';
export type { NstpComponent, CoordinatorScope } from './nstpComponents';

export type NstpRole = 'admin' | 'coordinator' | 'student' | 'facilitator';
export type StaffAccountStatus = 'ACTIVE' | 'SUSPENDED';
export type BiliranMunicipality = 'Almeria' | 'Biliran' | 'Cabucgayan' | 'Caibiran' | 'Culaba' | 'Kawayan' | 'Maripipi' | 'Naval';

export type NstpAccount = {
  id: string;
  name: string;
  studentId?: string;
  surname?: string;
  firstName?: string;
  middleName?: string;
  email: string;
  password: string;
  role: NstpRole;
  school?: string;
  department?: string;
  degreeProgram?: string;
  yearLevel?: string;
  major?: string;
  gender?: string;
  birthdate?: string;
  houseStreetPurok?: string;
  barangay?: string;
  province?: string;
  currentAddress?: string;
  cityAddress?: string;
  provincialAddress?: string;
  contactNumber?: string;
  employeeNumber?: string;
  title?: string;
  bio?: string;
  municipalities?: string[];
  municipality?: string;
  assignedMunicipality?: string;
  generalEducationComplete?: boolean;
  preferredComponent?: NstpComponent;
  examTaken?: boolean;
  examScore?: number;
  componentId?: string;
  component?: NstpComponent;
  componentAccessStatus?: string;
  coordinatorScope?: CoordinatorScope;
  accountStatus?: StaffAccountStatus;
  _version?: number;
};

/**
 * Everything `createEmptyAssessment` needs from the account that owns a draft.
 *
 * Narrower than `NstpAccount` on purpose: the assessment author is identified by
 * id, name and role only, so screens that hold a session (which carries no
 * `password`) can create drafts without being handed a full account record.
 */
export type AssessmentOwner = Pick<NstpAccount, 'id' | 'name' | 'role'>;

export type PendingStudentRegistration = {
  id: string;
  studentId?: string;
  surname?: string;
  firstName?: string;
  middleName?: string;
  name: string;
  email: string;
  school?: string;
  department?: string;
  degreeProgram?: string;
  yearLevel?: string;
  major?: string;
  gender?: string;
  birthdate?: string;
  houseStreetPurok?: string;
  barangay?: string;
  province?: string;
  currentAddress?: string;
  cityAddress?: string;
  provincialAddress?: string;
  contactNumber?: string;
  municipality?: string;
  assignedMunicipality?: string;
  createdAt: string;
  _version?: number;
};

export type NstpQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
};

export type NstpAssessment = {
  id: string;
  title: string;
  type: 'quiz' | 'exam' | 'seminar';
  description: string;
  moduleId?: string;
  moduleTitle?: string;
  moduleStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  component?: NstpComponent | 'Common';
  timeLimit: number;
  passingScore: number;
  questionsToShow: number;
  ownerId: string;
  ownerName: string;
  ownerRole: 'admin' | 'coordinator' | 'facilitator';
  status: 'draft' | 'published' | 'archived';
  questions: NstpQuestion[];
  updatedAt: string;
  _version?: number;
};

export type NstpModule = {
  id: string;
  title: string;
  description: string;
  component?: NstpComponent | 'Common';
  courseCode?: string;
  semester?: string;
  schoolYear?: string;
  sourceDocument?: string;
  outcomes?: string[];
  hours: number;
  order?: number;
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  isPublished?: boolean;
  completedStudents?: number;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  videoUrl?: string;
  meetingLink?: string;
  documentLink?: string;
  speaker?: string;
  speakerPosition?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  updatedAt: string;
  _version?: number;
};

export type NstpStudent = {
  id: string;
  componentId?: string;
  studentId?: string;
  surname?: string;
  firstName?: string;
  middleName?: string;
  name: string;
  email: string;
  school?: string;
  department?: string;
  degreeProgram?: string;
  yearLevel?: string;
  major?: string;
  gender?: string;
  birthdate?: string;
  houseStreetPurok?: string;
  barangay?: string;
  province?: string;
  currentAddress?: string;
  cityAddress?: string;
  provincialAddress?: string;
  contactNumber?: string;
  /**
   * `null` means "no component assigned yet" and must be rendered as such.
   * A component is never inferred or defaulted: it decides which coordinator
   * owns the student, so a guessed value would hand a record to the wrong
   * coordinator while looking like legitimate data. See `toNstpComponent`.
   */
  component: NstpComponent | null;
  municipality?: string;
  assignedMunicipality?: string;
  programSection?: string;
  trainingGroupId?: string;
  facilitatorId?: string;
  facilitatorName?: string;
  progress: number;
  assessments: number;
  status: 'active' | 'pending' | 'graduated';
  notes: string;
  updatedAt: string;
  _version?: number;
};

export type NstpTrainingGroup = {
  id: string;
  schoolYear: string;
  semester: string;
  component: NstpComponent;
  facilitatorName: string;
  facilitatorId?: string;
  programHandles: string[];
  municipality?: string;
  studentCount: number;
  maxRecommendedLoad: number;
  sourceDocument: string;
  _version?: number;
};

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export type NstpAttendanceRecord = {
  id: string;
  studentId: string;
  sessionId: string;
  status: AttendanceStatus;
  facilitatorId: string;
  updatedAt: string;
  _version?: number;
};

export type NstpAttendanceSession = {
  id: string;
  date: string;
  facilitatorId: string;
  title: string;
  createdAt: string;
  _version?: number;
};

export type NstpGradeRecord = {
  id: string;
  studentId: string;
  prelim: number;
  midterm: number;
  final: number;
  remarks: 'In Progress' | 'Passed' | 'For Completion' | 'Failed';
  released: boolean;
  updatedAt: string;
  _version?: number;
};

type PendingSyncItem = {
  localKey: string;
  data: unknown[];
  timestamp: string;
  retryable: boolean;
  error?: string;
};

const ACCOUNTS_KEY = 'nstp-accounts';
const ASSESSMENTS_KEY = 'nstp-assessment-library';
const MODULES_KEY = 'nstp-module-library';
const STUDENTS_KEY = 'nstp-student-roster';
const PENDING_REGISTRATIONS_KEY = 'nstp-pending-student-registrations';
const GRADES_KEY = 'nstp-grade-records';
const TRAINING_GROUPS_KEY = 'nstp-training-groups';
const ATTENDANCE_RECORDS_KEY = 'nstp-attendance-records';
const ATTENDANCE_SESSIONS_KEY = 'nstp-attendance-sessions';
export const QUALIFYING_RESULTS_KEY = 'qualifyingExamResults';
export const COMPONENT_APPLICATION_STATE_KEY = 'nstp-component-application-state';
export const AUDIT_LOG_KEY = 'nstp-admin-audit-log';
const PENDING_SYNC_KEY = 'nstp-pending-sync';
const runtimeStore = new Map<string, string>();

// Academic and administrative records are intentionally session-only until
// their dedicated server APIs replace every legacy local-only feature.
function readSensitive(key: string) {
  return runtimeStore.get(key) ?? null;
}

function writeSensitive(key: string, value: string) {
  runtimeStore.set(key, value);
}

function removeSensitive(key: string) {
  runtimeStore.delete(key);
}

/**
 * Drops every session-only record held by this module.
 *
 * These snapshots live in `runtimeStore`, not in `localStorage`, so a logout
 * routine that purges only browser storage leaves them readable by the next
 * account that signs in on the same tab — no page reload happens between
 * accounts. This is the defence-in-depth half of the account-switch guarantee;
 * the primary guarantee is that scoped roles never read or write these keys.
 */
export function clearSessionSnapshots() {
  runtimeStore.clear();
}

const ADMIN_RESOURCE_MAP: Record<string, string> = {
  [ACCOUNTS_KEY]: 'accounts',
  [STUDENTS_KEY]: 'students',
  [MODULES_KEY]: 'modules',
  [ASSESSMENTS_KEY]: 'assessments',
  [GRADES_KEY]: 'grades',
  [PENDING_REGISTRATIONS_KEY]: 'pending-registrations',
  [TRAINING_GROUPS_KEY]: 'training-groups',
  [ATTENDANCE_RECORDS_KEY]: 'attendance-records',
  [ATTENDANCE_SESSIONS_KEY]: 'attendance-sessions',
  [QUALIFYING_RESULTS_KEY]: 'qualifying-results',
  [COMPONENT_APPLICATION_STATE_KEY]: 'component-state',
  [AUDIT_LOG_KEY]: 'audit-log',
};

function getAdminResource(localKey: string): string | null {
  const currentUser = safeJsonParse<NstpAccount | null>(readSensitive('session-user'), null);
  return currentUser?.role === 'admin' ? ADMIN_RESOURCE_MAP[localKey] || null : null;
}

export function setSessionUser(user: { id: string; role: string } | null) {
  if (typeof window === 'undefined') return;
  if (user) writeSensitive('session-user', JSON.stringify(user));
  else removeSensitive('session-user');
}

export async function syncToApi<T>(localKey: string, data: T[]): Promise<boolean> {
  const collection = getAdminResource(localKey);
  if (!collection || !Array.isArray(data) || data.length === 0) return true;
  try {
    const result = await apiPost<{ success?: boolean; data?: { upserted: number } }>(`/nstp/admin/${collection}/batch`, data);
    if (result?.success === true) return true;
    addToPendingSync(localKey, data, new ApiRequestError(409, 'The server rejected one or more records.'));
    return false;
  } catch (error) {
    addToPendingSync(localKey, data, error);
    return false;
  }
}

async function syncSingleToApi<T>(localKey: string, data: T): Promise<boolean> {
  const collection = getAdminResource(localKey);
  if (!collection) return true;
  try {
    await apiPost<T>(`/nstp/admin/${collection}`, data);
    return true;
  } catch {
    return false;
  }
}

function addToPendingSync(localKey: string, data: unknown[], error?: unknown) {
  const queue = safeJsonParse<PendingSyncItem[]>(readSensitive(PENDING_SYNC_KEY), []);
  const existing = queue.findIndex((item) => item.localKey === localKey);
  const apiError = error instanceof ApiRequestError ? error : undefined;
  const entry: PendingSyncItem = {
    localKey, data, timestamp: new Date().toISOString(),
    retryable: apiError?.retryable ?? queue[existing]?.retryable ?? true,
    error: apiError?.message ?? queue[existing]?.error,
  };
  if (existing >= 0) queue[existing] = entry;
  else queue.push(entry);
  writeSensitive(PENDING_SYNC_KEY, JSON.stringify(queue));
}

export async function retryPendingSyncs(): Promise<number> {
  const queue = safeJsonParse<PendingSyncItem[]>(readSensitive(PENDING_SYNC_KEY), []);
  if (queue.length === 0) return 0;
  let synced = 0;
  const remaining: PendingSyncItem[] = [];
  for (const item of queue) {
    if (!item.retryable) {
      remaining.push(item);
      continue;
    }
    const ok = await syncToApi(item.localKey, item.data);
    if (ok) synced++;
    else remaining.push(item);
  }
  if (remaining.length > 0) writeSensitive(PENDING_SYNC_KEY, JSON.stringify(remaining));
  else removeSensitive(PENDING_SYNC_KEY);
  return synced;
}

export async function syncCollectionFromApi(localKey: string, query = ''): Promise<void> {
  const collection = getAdminResource(localKey);
  if (!collection) return;
  try {
  if (collection === 'accounts') {
    const apiAccounts = await apiGet<any[]>(`/nstp/admin/accounts${query}`, []);
    if (apiAccounts.length > 0) {
      const mapped: NstpAccount[] = apiAccounts.map((a: any) => {
        const d = (a.data || {}) as Record<string, unknown>;
        const ip = (a.instructorProfile || {}) as Record<string, unknown>;
        const cp = (a.coordinatorProfile || {}) as Record<string, unknown>;
        // An account with no component on the server has no component here
        // either. The previous `|| 'CWTS'` invented a CWTS assignment for every
        // unassigned staff row, which then read back as real CWTS data.
        const accountComponent = toNstpComponent((ip.component as Record<string, unknown>)?.name) ?? toNstpComponent(d.component);
        return {
          id: a.id, name: a.name || '', email: a.email || '', password: '',
          role: (a.role || 'student').toLowerCase() as NstpRole,
          employeeNumber: (ip.employeeNumber as string) || (cp.employeeNumber as string) || (d.employeeNumber as string) || '',
          componentId: (ip.componentId as string) || (cp.componentId as string) || (d.componentId as string) || '',
          // Validated, not cast: an unrecognised scope on a staff row must read
          // back as "no scope" so the admin screens show it as unassigned,
          // rather than becoming a scope value the UI then treats as real.
          coordinatorScope: toCoordinatorScope(cp.scope) ?? toCoordinatorScope(d.coordinatorScope),
          accountStatus: (a.status as StaffAccountStatus) || 'ACTIVE',
          ...(accountComponent ? { component: accountComponent } : {}),
          municipalities: (ip.municipalities as string[]) || (d.municipalities as string[]) || [],
          title: (d.title as string) || '',
          contactNumber: (d.contactNumber as string) || '',
          studentId: (d.studentId as string) || '',
          surname: d.surname as string, firstName: d.firstName as string,
          middleName: d.middleName as string, school: d.school as string,
          department: d.department as string, degreeProgram: d.degreeProgram as string,
          yearLevel: d.yearLevel as string, major: d.major as string,
          gender: d.gender as string, birthdate: d.birthdate as string,
          houseStreetPurok: d.houseStreetPurok as string, barangay: d.barangay as string,
          province: (d.province as string) || 'Biliran',
          currentAddress: d.currentAddress as string, cityAddress: d.cityAddress as string,
          provincialAddress: d.provincialAddress as string,
          // No municipality on the server means none here. `|| 'Naval'` made every
          // unassigned staff row look like a Naval assignment, and facilitator
          // rosters are scoped by municipality.
          ...(typeof d.municipality === 'string' && d.municipality ? { municipality: d.municipality as BiliranMunicipality } : {}),
        };
      });
      if (mapped.length > 0) {
        const existing = safeJsonParse<NstpAccount[]>(readSensitive(localKey), []);
        const merged = [...existing];
        for (const m of mapped) {
          const idx = merged.findIndex((x) => x.email?.toLowerCase() === m.email?.toLowerCase());
          if (idx >= 0) {
            const existingVer = (merged[idx] as any)._version || 0;
            const incomingVer = (m as any)._version || 0;
            merged[idx] = incomingVer >= existingVer ? { ...merged[idx], ...m, password: merged[idx].password } : merged[idx];
          } else merged.unshift(m);
        }
        writeSensitive(localKey, JSON.stringify(merged));
      }
    }
    return;
  }
  if (collection === 'students') {
    const apiStudents = await apiGet<any[]>('/nstp/admin/students', []);
    if (apiStudents.length > 0) {
      const mapped: NstpStudent[] = apiStudents.map((bs: any) => {
        const userData = bs.user || {};
        const data = (userData.data || {}) as Record<string, unknown>;
        return {
          id: userData.id || bs.id, studentId: bs.studentNumber,
          surname: (data.surname as string) || '', firstName: (data.firstName as string) || '',
          middleName: (data.middleName as string) || '', name: userData.name || '',
          email: userData.email || '', school: (data.school as string) || '',
          department: (data.department as string) || '',
          degreeProgram: bs.course || (data.degreeProgram as string) || '',
          yearLevel: bs.yearLevel || (data.yearLevel as string) || '',
          major: (data.major as string) || '', gender: (data.gender as string) || '',
          birthdate: (data.birthdate as string) || '',
          houseStreetPurok: (data.houseStreetPurok as string) || '',
          barangay: (data.barangay as string) || '',
          province: (data.province as string) || 'Biliran',
          currentAddress: (data.currentAddress as string) || '',
          cityAddress: (data.cityAddress as string) || '',
          provincialAddress: (data.provincialAddress as string) || '',
          contactNumber: (data.contactNumber as string) || '',
          componentId: bs.componentId || bs.component?.id,
          // Unassigned stays unassigned: the previous `|| 'CWTS'` made every
          // server student without a component look like a CWTS enrolment.
          component: toNstpComponent(bs.component?.name),
          // Unassigned municipality stays unassigned: `FacilitatorDashboard`
          // scopes its roster with `assignedMunicipalities.includes(...)`, so a
          // fabricated 'Naval' would hand every unplaced student to the Naval
          // facilitator. An empty value matches no facilitator.
          municipality: typeof data.municipality === 'string' ? (data.municipality as BiliranMunicipality) : undefined,
          programSection: (data.degreeProgram as string) || '',
          progress: 0, assessments: 0, status: 'pending' as const,
          notes: 'Imported from server.', updatedAt: new Date().toISOString(),
        };
      });
      if (mapped.length > 0) {
        const existing = safeJsonParse<NstpStudent[]>(readSensitive(localKey), []);
        const merged = [...existing];
        for (const m of mapped) {
          const idx = merged.findIndex((x) => x.studentId === m.studentId || x.email?.toLowerCase() === m.email?.toLowerCase());
          if (idx >= 0) {
            const existingVer = (merged[idx] as any)._version || 0;
            const incomingVer = (m as any)._version || 0;
            merged[idx] = incomingVer >= existingVer ? m : merged[idx];
          } else merged.unshift(m);
        }
        writeSensitive(localKey, JSON.stringify(merged));
      }
    }
    return;
  }
  const apiData = await apiGet<any[]>(`/nstp/admin/${collection}`);
  if (collection === 'modules') {
    // Modules are official academic records. Replace the client snapshot with
    // the exact database response, including an empty collection, so stale or
    // failed client-only creations can never remain visible as real modules.
    writeSensitive(localKey, JSON.stringify(Array.isArray(apiData) ? apiData : []));
    window.dispatchEvent(new CustomEvent('nstp-modules-updated'));
    return;
  }
  if (collection === 'pending-registrations') {
    writeSensitive(localKey, JSON.stringify(Array.isArray(apiData) ? apiData : []));
    return;
  }
  if (Array.isArray(apiData) && apiData.length > 0) {
    const existing = safeJsonParse<any[]>(readSensitive(localKey), []);
    const merged = [...existing];
    for (const item of apiData) {
      const idx = merged.findIndex((x: any) => x.id === item.id);
      if (idx >= 0) {
        const existingVer = (merged[idx] as any)._version || 0;
        const incomingVer = (item as any)._version || 0;
        merged[idx] = incomingVer >= existingVer ? item : merged[idx];
      } else merged.unshift(item);
    }
    writeSensitive(localKey, JSON.stringify(merged));
  }
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 503) {
      window.dispatchEvent(new CustomEvent('nstp-service-unavailable', { detail: { localKey, error } }));
    }
    throw error;
  }
}

export async function syncAllFromApi(): Promise<void> {
  // Login refresh is intentionally narrow.  Official student records come from
  // /students/me endpoints; the remaining admin views fetch their own data.
  const currentUser = safeJsonParse<NstpAccount | null>(readSensitive('session-user'), null);
  const keys = currentUser?.role === 'admin'
    ? [MODULES_KEY, ASSESSMENTS_KEY]
    : [];
  await Promise.allSettled(keys.map((key) => syncCollectionFromApi(key)));
}
export const BILIRAN_MUNICIPALITIES: BiliranMunicipality[] = ['Almeria', 'Biliran', 'Cabucgayan', 'Caibiran', 'Culaba', 'Kawayan', 'Maripipi', 'Naval'];

export const DEPARTMENTS = [
  'School of Arts and Sciences',
  'School of Criminal Justice Education',
  'School of Management and Entrepreneurship',
  'School of Nursing and Health Sciences',
  'School of Engineering',
  'School of Technology and Computer Studies',
  'School of Teacher Education - Naval Campus',
  'School of Teacher Education - Biliran Campus',
  'School of Agri-Fisheries',
  'School of Agribusiness and Forest Resource Management',
  'School of Graduate Studies',
];

export const COURSES = [
  'BS Information Technology',
  'BS Computer Science',
  'BS Civil Engineering',
  'BS Electrical Engineering',
  'BS Mechanical Engineering',
  'BS Computer Engineering',
  'BS Criminology',
  'BS Hospitality Management',
  'BS Business Administration',
  'BS Business Administration major in Financial Management',
  'BS Elementary Education',
  'BS Secondary Education',
  'BS Nursing',
  'BS Agriculture',
  'BA Economics',
  'BS Information Systems',
];

export const BIPSU_PROGRAMS = [
  {
    school: 'School of Arts and Sciences',
    programs: ['Bachelor of Arts in Communication', 'Bachelor of Science in Biology', 'Bachelor of Science in Economics'],
  },
  {
    school: 'School of Criminal Justice Education',
    programs: ['Bachelor of Science in Criminology'],
  },
  {
    school: 'School of Management and Entrepreneurship',
    programs: ['Bachelor of Science in Business Administration', 'Bachelor of Science in Hospitality Management', 'Bachelor of Science in Tourism Management'],
  },
  {
    school: 'School of Nursing and Health Sciences',
    programs: ['Bachelor of Science in Nursing', 'Bachelor of Science in Public Health'],
  },
  {
    school: 'School of Engineering',
    programs: ['Bachelor of Science in Civil Engineering', 'Bachelor of Science in Computer Engineering', 'Bachelor of Science in Electrical Engineering', 'Bachelor of Science in Mechanical Engineering'],
  },
  {
    school: 'School of Technology and Computer Studies',
    programs: ['Bachelor of Science in Computer Science', 'Bachelor of Science in Information Systems', 'BS in Industrial Technology'],
  },
  {
    school: 'School of Teacher Education - Naval Campus',
    programs: ['Bachelor of Early Childhood Education', 'Bachelor of Elementary Education', 'Bachelor of Physical Education', 'Bachelor of Secondary Education', 'Bachelor of Special Needs Education', 'Bachelor of Technology & Livelihood Education'],
  },
];

export const YEAR_LEVEL_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
export const INDUSTRIAL_TECHNOLOGY_PROGRAM = 'BS in Industrial Technology';
export const INDUSTRIAL_TECHNOLOGY_MAJORS = [
  'Automotive Technology',
  'Architectural Drafting Technology',
  'Electrical Technology',
  'Electronics Technology',
  'Culinary Technology',
  'Apparel and Fashion Design Technology',
  'HVAC-R Technology',
];

export const SECONDARY_EDUCATION_PROGRAM = 'Bachelor of Secondary Education';
export const SECONDARY_EDUCATION_MAJORS = [
  'English',
  'Mathematics',
  'Science',
  'Social Studies',
  'Filipino',
];

export type QualifyingExamResult = {
  userId: string;
  userName: string;
  userEmail: string;
  preferredComponent: NstpComponent;
  score: number;
  timestamp: string;
  assignedComponent?: NstpComponent | null;
  rank?: number;
  status?: 'assigned-preferred' | 'assigned-alternative' | 'manual-approved' | 'filled-preferred' | 'filled-alternative' | 'waitlisted' | 'not-qualified';
  adminOverride?: boolean;
  _version?: number;
};

export type ComponentApplicationState = {
  slotLimits: Record<NstpComponent, number>;
  qualifyingScore: number;
  applicationClosed: boolean;
  updatedAt?: string;
  _version?: number;
};

export const DEFAULT_COMPONENT_APPLICATION_STATE: ComponentApplicationState = {
  slotLimits: {
    CWTS: 600,
    LTS: 400,
    'MTS (Army)': 300,
    'MTS (Navy)': 200,
    'CWTS (Coast Guard)': 250,
  },
  qualifyingScore: 70,
  applicationClosed: false,
};

const now = () => new Date().toISOString();



export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function incrementVersions<T extends { _version?: number }>(records: T[]): T[] {
  return records.map((r) => ({ ...r, _version: (r._version || 0) + 1 }));
}

/**
 * The role of the session that is currently signed in, as recorded by
 * `setSessionUser`. Advisory only — it decides which *local* caches are worth
 * touching, never what the signed-in user is allowed to see. Every scope
 * decision is made by the server on each request.
 */
function sessionRole(): string | null {
  if (typeof window === 'undefined') return null;
  return safeJsonParse<NstpAccount | null>(readSensitive('session-user'), null)?.role ?? null;
}

/**
 * Lazily initialises the shared snapshot keys to empty collections.
 *
 * Coordinators are excluded. Their screens read exclusively from
 * `/nstp/coordinators/**` endpoints, so seeding on their behalf would write into
 * the shared admin snapshot keys for a session that never reads them — the exact
 * coupling the coordinator/admin separation removed. Skipping is also invisible
 * to any reader: an absent key and a key holding `'[]'` both parse to `[]` via
 * `safeJsonParse(readSensitive(key), [])`.
 */
export function ensureNstpSeedData(forceSeed = false) {
  if (typeof window === 'undefined') return;

  const accountsRaw = readSensitive(ACCOUNTS_KEY);
  if (forceSeed || accountsRaw === null) {
    writeSensitive(ACCOUNTS_KEY, JSON.stringify(DEMO_ACCOUNTS_SEED));
  }
  const assessmentsRaw = readSensitive(ASSESSMENTS_KEY);
  if (forceSeed || assessmentsRaw === null) {
    writeSensitive(ASSESSMENTS_KEY, JSON.stringify(DEMO_ASSESSMENTS_SEED));
  }
  const modulesRaw = readSensitive(MODULES_KEY);
  if (forceSeed || modulesRaw === null) {
    writeSensitive(MODULES_KEY, JSON.stringify(DEMO_MODULES_SEED));
  }
  const studentsRaw = readSensitive(STUDENTS_KEY);
  if (forceSeed || studentsRaw === null) {
    writeSensitive(STUDENTS_KEY, JSON.stringify(DEMO_STUDENTS_SEED));
  }
  const pendingRaw = readSensitive(PENDING_REGISTRATIONS_KEY);
  if (forceSeed || pendingRaw === null) {
    writeSensitive(PENDING_REGISTRATIONS_KEY, JSON.stringify(DEMO_PENDING_REGISTRATIONS_SEED));
  }
  const gradesRaw = readSensitive(GRADES_KEY);
  if (forceSeed || gradesRaw === null) {
    writeSensitive(GRADES_KEY, JSON.stringify(DEMO_GRADES_SEED));
  }
  const attSessionsRaw = readSensitive(ATTENDANCE_SESSIONS_KEY);
  if (forceSeed || attSessionsRaw === null) {
    writeSensitive(ATTENDANCE_SESSIONS_KEY, JSON.stringify(DEMO_ATTENDANCE_SESSIONS_SEED));
  }
  const attRecordsRaw = readSensitive(ATTENDANCE_RECORDS_KEY);
  if (forceSeed || attRecordsRaw === null) {
    writeSensitive(ATTENDANCE_RECORDS_KEY, JSON.stringify(DEMO_ATTENDANCE_RECORDS_SEED));
  }
}

export function resetDemoSeedData() {
  ensureNstpSeedData(true);
}

export async function initializeFromApi() {
  if (typeof window === 'undefined') return;
  ensureNstpSeedData();
  await syncAllFromApi();
  ensureNstpSeedData();
}

export function loadAccounts(): NstpAccount[] {
  if (typeof window === 'undefined') return [];
  ensureNstpSeedData();
  return safeJsonParse<NstpAccount[]>(readSensitive(ACCOUNTS_KEY), []);
}

export async function saveAccounts(accounts: NstpAccount[]): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const versioned = incrementVersions(accounts);
  writeSensitive(ACCOUNTS_KEY, JSON.stringify(versioned));
  window.dispatchEvent(new CustomEvent('nstp-accounts-updated'));
  const ok = await syncToApi(ACCOUNTS_KEY, versioned);
  if (!ok) addToPendingSync(ACCOUNTS_KEY, versioned);
  return ok;
}

export function loadAssessments(): NstpAssessment[] {
  if (typeof window === 'undefined') return [];
  ensureNstpSeedData();
  return safeJsonParse<NstpAssessment[]>(readSensitive(ASSESSMENTS_KEY), []);
}

export async function saveAssessments(assessments: NstpAssessment[]): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const versioned = incrementVersions(assessments);
  writeSensitive(ASSESSMENTS_KEY, JSON.stringify(versioned));
  window.dispatchEvent(new CustomEvent('nstp-assessments-updated'));
  const ok = await syncToApi(ASSESSMENTS_KEY, versioned);
  if (!ok) addToPendingSync(ASSESSMENTS_KEY, versioned);
  return ok;
}

export function loadModules(): NstpModule[] {
  if (typeof window === 'undefined') return [];
  ensureNstpSeedData();
  return safeJsonParse<NstpModule[]>(readSensitive(MODULES_KEY), []);
}

export async function saveModules(modules: NstpModule[]): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const previous = readSensitive(MODULES_KEY);
  const versioned = incrementVersions(modules);
  writeSensitive(MODULES_KEY, JSON.stringify(versioned));
  window.dispatchEvent(new CustomEvent('nstp-modules-updated'));
  const ok = await syncToApi(MODULES_KEY, versioned);
  if (!ok) {
    if (previous === null) removeSensitive(MODULES_KEY);
    else writeSensitive(MODULES_KEY, previous);
    window.dispatchEvent(new CustomEvent('nstp-modules-updated'));
  }
  return ok;
}

export function replaceAssessmentsSnapshot(assessments: NstpAssessment[]) {
  if (typeof window === 'undefined') return;
  writeSensitive(ASSESSMENTS_KEY, JSON.stringify(assessments));
  window.dispatchEvent(new CustomEvent('nstp-assessments-updated'));
}

export function replaceModulesSnapshot(modules: NstpModule[]) {
  if (typeof window === 'undefined') return;
  writeSensitive(MODULES_KEY, JSON.stringify(modules));
  window.dispatchEvent(new CustomEvent('nstp-modules-updated'));
}

export function loadStudents(): NstpStudent[] {
  if (typeof window === 'undefined') return [];
  ensureNstpSeedData();
  return safeJsonParse<NstpStudent[]>(readSensitive(STUDENTS_KEY), []);
}

export async function saveStudents(students: NstpStudent[]): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const versioned = incrementVersions(students);
  writeSensitive(STUDENTS_KEY, JSON.stringify(versioned));
  window.dispatchEvent(new CustomEvent('nstp-students-updated'));
  const ok = await syncToApi(STUDENTS_KEY, versioned);
  if (!ok) addToPendingSync(STUDENTS_KEY, versioned);
  return ok;
}

export function loadComponentApplicationState(): ComponentApplicationState {
  if (typeof window === 'undefined') return DEFAULT_COMPONENT_APPLICATION_STATE;

  const saved = safeJsonParse<Partial<ComponentApplicationState>>(readSensitive(COMPONENT_APPLICATION_STATE_KEY), {});
  return {
    ...DEFAULT_COMPONENT_APPLICATION_STATE,
    ...saved,
    slotLimits: {
      ...DEFAULT_COMPONENT_APPLICATION_STATE.slotLimits,
      ...(saved.slotLimits || {}),
    },
    qualifyingScore: typeof saved.qualifyingScore === 'number' ? Math.max(0, Math.min(100, saved.qualifyingScore)) : DEFAULT_COMPONENT_APPLICATION_STATE.qualifyingScore,
    applicationClosed: typeof saved.applicationClosed === 'boolean' ? saved.applicationClosed : DEFAULT_COMPONENT_APPLICATION_STATE.applicationClosed,
  };
}

export async function saveComponentApplicationState(state: ComponentApplicationState): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const records = incrementVersions([state]);
  writeSensitive(COMPONENT_APPLICATION_STATE_KEY, JSON.stringify(records[0]));
  window.dispatchEvent(new CustomEvent('nstp-component-state-updated'));
  const ok = await syncToApi(COMPONENT_APPLICATION_STATE_KEY, records);
  if (!ok) addToPendingSync(COMPONENT_APPLICATION_STATE_KEY, records);
  return ok;
}

export function loadQualifyingExamResults(): QualifyingExamResult[] {
  if (typeof window === 'undefined') return [];
  return safeJsonParse<QualifyingExamResult[]>(readSensitive(QUALIFYING_RESULTS_KEY), []);
}

export async function saveQualifyingExamResults(results: QualifyingExamResult[]): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const versioned = incrementVersions(results);
  writeSensitive(QUALIFYING_RESULTS_KEY, JSON.stringify(versioned));
  window.dispatchEvent(new CustomEvent('nstp-qualifying-results-updated'));
  const ok = await syncToApi(QUALIFYING_RESULTS_KEY, versioned);
  if (!ok) addToPendingSync(QUALIFYING_RESULTS_KEY, versioned);
  return ok;
}

const hasStudentPortalAccess = (result: QualifyingExamResult) => {
  return Boolean(
    result.assignedComponent &&
    result.status &&
    !['waitlisted', 'not-qualified'].includes(result.status),
  );
};

export function syncStudentAccessFromQualifyingResult(result: QualifyingExamResult) {
  if (typeof window === 'undefined' || !hasStudentPortalAccess(result)) return;

  // The exam result is read from a browser-writable store, so the assigned
  // component is validated instead of cast. An unrecognised label must not be
  // able to create an *active* roster record under a component nobody assigned.
  const component = toNstpComponent(result.assignedComponent);
  if (!component) return;
  const accounts = loadAccounts();
  const nextAccounts = accounts.map((account) => (
    account.id === result.userId
      ? {
          ...account,
          generalEducationComplete: true,
          preferredComponent: result.preferredComponent,
          examTaken: true,
          examScore: result.score,
          component,
          componentAccessStatus: result.status,
        }
      : account
  ));
  saveAccounts(nextAccounts);

  const students = loadStudents();
  const existingStudent = students.find((student) => student.id === result.userId || student.email.toLowerCase() === result.userEmail.toLowerCase());
  const nextStudent: NstpStudent = {
    ...(existingStudent || createEmptyStudent()),
    id: result.userId,
    name: result.userName,
    email: result.userEmail,
    component,
    status: 'active',
    updatedAt: now(),
  };

  const nextStudents = existingStudent
    ? students.map((student) => (student.id === existingStudent.id ? nextStudent : student))
    : [nextStudent, ...students];

  saveStudents(nextStudents);

  const currentUser = safeJsonParse<NstpAccount | null>(readSensitive('session-user'), null);
  if (currentUser?.id === result.userId) {
    const updatedUser = nextAccounts.find((account) => account.id === result.userId) || currentUser;
    window.dispatchEvent(new CustomEvent('nstp-current-user-updated', { detail: updatedUser }));
  }
}

export function syncStudentAccessFromQualifyingResults(results: QualifyingExamResult[] = loadQualifyingExamResults()) {
  results.forEach(syncStudentAccessFromQualifyingResult);
}

export function autoAssignQualifyingResult(result: QualifyingExamResult, existingResults: QualifyingExamResult[] = loadQualifyingExamResults()) {
  const state = loadComponentApplicationState();
  const preferred = result.preferredComponent;
  const assignedToPreferred = existingResults.filter((row) => (
    row.userId !== result.userId &&
    row.assignedComponent === preferred &&
    row.status &&
    !['waitlisted', 'not-qualified'].includes(row.status)
  )).length;
  const preferredSlots = state.slotLimits[preferred] ?? 0;
  const passed = result.score >= state.qualifyingScore;

  if (passed && assignedToPreferred < preferredSlots) {
    return {
      ...result,
      assignedComponent: preferred,
      rank: assignedToPreferred + 1,
      status: 'assigned-preferred' as const,
    };
  }

  return {
    ...result,
    assignedComponent: null,
    rank: undefined,
    status: passed ? 'waitlisted' as const : 'not-qualified' as const,
  };
}

export function loadPendingStudentRegistrations(): PendingStudentRegistration[] {
  if (typeof window === 'undefined') return [];
  ensureNstpSeedData();
  return safeJsonParse<PendingStudentRegistration[]>(readSensitive(PENDING_REGISTRATIONS_KEY), []);
}

export async function savePendingStudentRegistrations(registrations: PendingStudentRegistration[]): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const versioned = incrementVersions(registrations);
  writeSensitive(PENDING_REGISTRATIONS_KEY, JSON.stringify(versioned));
  window.dispatchEvent(new CustomEvent('nstp-pending-registrations-updated'));
  const ok = await syncToApi(PENDING_REGISTRATIONS_KEY, versioned);
  if (!ok) addToPendingSync(PENDING_REGISTRATIONS_KEY, versioned);
  return ok;
}

export function loadGradeRecords(): NstpGradeRecord[] {
  if (typeof window === 'undefined') return [];
  ensureNstpSeedData();
  return safeJsonParse<Array<Partial<NstpGradeRecord>>>(readSensitive(GRADES_KEY), []).map((record, index) => ({
    ...record,
    id: record.id || `legacy-grade-${record.studentId || 'unknown'}-${index}`,
  })) as NstpGradeRecord[];
}

export async function saveGradeRecords(records: NstpGradeRecord[]): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const versioned = incrementVersions(records);
  writeSensitive(GRADES_KEY, JSON.stringify(versioned));
  window.dispatchEvent(new CustomEvent('nstp-grades-updated'));
  const ok = await syncToApi(GRADES_KEY, versioned);
  if (!ok) addToPendingSync(GRADES_KEY, versioned);
  return ok;
}

export function loadAttendanceRecords(): NstpAttendanceRecord[] {
  if (typeof window === 'undefined') return [];
  ensureNstpSeedData();
  return safeJsonParse<NstpAttendanceRecord[]>(readSensitive(ATTENDANCE_RECORDS_KEY), []);
}

export async function saveAttendanceRecords(records: NstpAttendanceRecord[]): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const versioned = incrementVersions(records);
  writeSensitive(ATTENDANCE_RECORDS_KEY, JSON.stringify(versioned));
  window.dispatchEvent(new CustomEvent('nstp-attendance-records-updated'));
  const ok = await syncToApi(ATTENDANCE_RECORDS_KEY, versioned);
  if (!ok) addToPendingSync(ATTENDANCE_RECORDS_KEY, versioned);
  return ok;
}

export function loadAttendanceSessions(): NstpAttendanceSession[] {
  if (typeof window === 'undefined') return [];
  ensureNstpSeedData();
  return safeJsonParse<NstpAttendanceSession[]>(readSensitive(ATTENDANCE_SESSIONS_KEY), []);
}

export async function saveAttendanceSessions(sessions: NstpAttendanceSession[]): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const versioned = incrementVersions(sessions);
  writeSensitive(ATTENDANCE_SESSIONS_KEY, JSON.stringify(versioned));
  window.dispatchEvent(new CustomEvent('nstp-attendance-sessions-updated'));
  const ok = await syncToApi(ATTENDANCE_SESSIONS_KEY, versioned);
  if (!ok) addToPendingSync(ATTENDANCE_SESSIONS_KEY, versioned);
  return ok;
}

export function loadTrainingGroups(): NstpTrainingGroup[] {
  if (typeof window === 'undefined') return [];
  ensureNstpSeedData();
  return safeJsonParse<NstpTrainingGroup[]>(readSensitive(TRAINING_GROUPS_KEY), []);
}

export async function saveTrainingGroups(groups: NstpTrainingGroup[]): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const versioned = incrementVersions(groups);
  writeSensitive(TRAINING_GROUPS_KEY, JSON.stringify(versioned));
  window.dispatchEvent(new CustomEvent('nstp-training-groups-updated'));
  const ok = await syncToApi(TRAINING_GROUPS_KEY, versioned);
  if (!ok) addToPendingSync(TRAINING_GROUPS_KEY, versioned);
  return ok;
}

export function createEmptyStudent(): NstpStudent {
  return {
    id: `student-${Math.random().toString(36).slice(2, 10)}`,
    studentId: '',
    surname: '',
    firstName: '',
    middleName: '',
    name: '',
    email: '',
    degreeProgram: '',
    yearLevel: '',
    major: '',
    gender: '',
    birthdate: '',
    houseStreetPurok: '',
    barangay: '',
    province: 'Biliran',
    currentAddress: '',
    cityAddress: '',
    provincialAddress: '',
    contactNumber: '',
    // A brand-new record has no component until somebody chooses one. Seeding
    // 'CWTS' here meant an administrator who never touched the field created a
    // CWTS student by accident.
    component: null,
    // No municipality until an administrator picks one. Seeding 'Naval' placed
    // every new record inside the Naval facilitator's roster scope.
    municipality: '',
    progress: 0,
    assessments: 0,
    status: 'pending',
    notes: '',
    updatedAt: now(),
  };
}

export function createEmptyModule(): NstpModule {
  return {
    id: `module-${Math.random().toString(36).slice(2, 10)}`,
    title: '',
    description: '',
    component: 'Common',
    hours: 3,
    order: 0,
    status: 'DRAFT',
    isPublished: false,
    difficulty: 'Beginner',
    documentLink: '',
    speaker: '',
    speakerPosition: '',
    scheduledDate: '',
    scheduledTime: '',
    updatedAt: now(),
  };
}

export function createEmptyAssessment(owner: AssessmentOwner, overrides: Partial<NstpAssessment> = {}): NstpAssessment {
  const questions = overrides.questions || [
    { id: `q-${Math.random().toString(36).slice(2, 9)}`, prompt: 'New question prompt', options: ['Option A', 'Option B', 'Option C', 'Option D'], correctIndex: 0 },
  ];
  return {
    id: `asmt-${Math.random().toString(36).slice(2, 10)}`,
    title: overrides.title || 'Untitled Assessment',
    type: overrides.type || 'quiz',
    description: overrides.description || '',
    moduleId: overrides.moduleId || '',
    timeLimit: overrides.timeLimit || 15,
    passingScore: overrides.passingScore || 70,
    questionsToShow: overrides.questionsToShow || questions.length,
    ownerId: owner.id,
    ownerName: owner.name,
    ownerRole: owner.role === 'facilitator' ? 'facilitator' : owner.role === 'coordinator' ? 'coordinator' : 'admin',
    status: overrides.status || 'draft',
    updatedAt: now(),
    questions,
  };
}
