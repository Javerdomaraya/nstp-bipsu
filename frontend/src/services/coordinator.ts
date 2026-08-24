// Coordinator-scoped reads.
//
// Every endpoint here is filtered server-side by the coordinator's component
// scope (see backend/src/modules/nstp/nstp.controller.js ->
// listCoordinatorStudents / listCoordinatorClasses /
// listCoordinatorTrainingGroupsController, all guarded by getCurrentCoordinator).
// The client must not request an unscoped collection and narrow it locally: the
// API is the authority on which records a coordinator may see, and these
// functions deliberately do no filtering of their own.

import { apiGet } from './apiClient';
import { toNstpComponent } from '../data/nstpData';
import type { NstpComponent, NstpStudent, NstpTrainingGroup } from '../data/nstpData';
import { COMPONENT_TYPE_LABELS, type FacilitatorRecord } from './staff';

type ApiEnvelope<T> = { success: boolean; data: T };

type ComponentRef = { id: string; type: string; name: string } | null;

type CoordinatorStudentAccount = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  data?: Record<string, unknown> | null;
};

type CoordinatorStudentRecord = {
  id: string;
  studentNumber?: string | null;
  yearLevel?: string | null;
  course?: string | null;
  sectionId?: string | null;
  componentId?: string | null;
  data?: Record<string, unknown> | null;
  user?: CoordinatorStudentAccount | null;
  component?: ComponentRef;
  section?: { id: string; code: string; name: string; schoolYear: string; semester: string } | null;
  _count?: { moduleProgress?: number; submissions?: number } | null;
  createdAt?: string;
  updatedAt?: string;
};

type CoordinatorClassRecord = {
  id: string;
  code: string;
  name: string;
  schoolYear: string;
  semester: string;
  componentId: string;
  instructorId?: string | null;
  component?: ComponentRef;
  instructor?: { id: string; user?: { id: string; name?: string | null; email?: string | null } | null } | null;
  _count?: { students?: number } | null;
};

export type CoordinatorClass = {
  id: string;
  code: string;
  name: string;
  schoolYear: string;
  semester: string;
  componentId: string;
  component: NstpComponent | '';
  componentType: string;
  facilitatorId: string | null;
  facilitatorName: string;
  studentCount: number;
};

/** A `training_group` row as the API returns it. */
type CoordinatorTrainingGroupRecord = {
  id: string;
  schoolYear?: string | null;
  semester?: string | null;
  component?: string | null;
  facilitatorName?: string | null;
  facilitatorId?: string | null;
  programHandles?: unknown;
  municipality?: string | null;
  studentCount?: number | null;
  maxRecommendedLoad?: number | null;
  sourceDocument?: string | null;
  createdAt?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * `completedModuleTarget` is the number of published modules inside the
 * coordinator's own scope, which the caller already holds. Passing 0 (or
 * omitting it) yields 0% rather than a guessed figure — progress is never
 * fabricated.
 */
export function toCoordinatorStudent(
  record: CoordinatorStudentRecord,
  completedModuleTarget = 0,
): NstpStudent {
  const account: CoordinatorStudentAccount = record.user || {};
  const profileData = { ...asRecord(record.data), ...asRecord(account.data) };
  const completedModules = record._count?.moduleProgress || 0;
  const submissions = record._count?.submissions || 0;
  const progress = completedModuleTarget > 0
    ? Math.min(100, Math.round((completedModules / completedModuleTarget) * 100))
    : 0;

  return {
    id: account.id || record.id,
    studentId: record.studentNumber || text(profileData.studentId),
    componentId: record.componentId || record.component?.id || '',
    surname: text(profileData.surname),
    firstName: text(profileData.firstName),
    middleName: text(profileData.middleName),
    name: account.name || text(profileData.name),
    email: account.email || text(profileData.email),
    school: text(profileData.school),
    department: text(profileData.department),
    degreeProgram: record.course || text(profileData.degreeProgram),
    yearLevel: record.yearLevel || text(profileData.yearLevel),
    major: text(profileData.major),
    gender: text(profileData.gender),
    birthdate: text(profileData.birthdate),
    houseStreetPurok: text(profileData.houseStreetPurok),
    barangay: text(profileData.barangay),
    province: text(profileData.province),
    currentAddress: text(profileData.currentAddress),
    cityAddress: text(profileData.cityAddress),
    provincialAddress: text(profileData.provincialAddress),
    contactNumber: text(profileData.contactNumber),
    // The component label comes from the joined row. There is no 'CWTS'
    // fallback: the server only returns students already inside this
    // coordinator's scope, so a blank label means the record genuinely has no
    // component rather than defaulting to the wrong one.
    component: toNstpComponent(record.component?.name),
    municipality: text(profileData.municipality),
    assignedMunicipality: text(profileData.assignedMunicipality),
    programSection: record.section?.code || text(profileData.programSection),
    facilitatorName: text(profileData.facilitatorName),
    progress,
    assessments: submissions,
    status: completedModules > 0 || submissions > 0 ? 'active' : 'pending',
    notes: '',
    updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
  };
}

export function toCoordinatorClass(record: CoordinatorClassRecord): CoordinatorClass {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    schoolYear: record.schoolYear,
    semester: record.semester,
    componentId: record.componentId,
    // Validated rather than cast. Component rows are created from the canonical
    // five names, so a value that fails validation is a data problem, not a
    // label this client should invent — and `componentType` below still carries
    // the enum for anything that needs to be precise.
    component: toNstpComponent(record.component?.name) ?? '',
    componentType: record.component?.type || '',
    facilitatorId: record.instructorId || record.instructor?.id || null,
    facilitatorName: record.instructor?.user?.name || 'Unassigned',
    studentCount: record._count?.students || 0,
  };
}

/**
 * Shapes a `training_group` row into the type the reports table already renders.
 * `programHandles` is a JSON column, so it is coerced to an array of strings
 * rather than trusted. The component label is passed through verbatim: the row
 * was already restricted to this coordinator's components by the query, and
 * inventing a label here would hide a data problem.
 */
export function toCoordinatorTrainingGroup(record: CoordinatorTrainingGroupRecord): NstpTrainingGroup {
  const rawComponent = text(record.component);
  const component = toNstpComponent(rawComponent)
    ?? COMPONENT_TYPE_LABELS[rawComponent as FacilitatorRecord['component']];
  if (!component) {
    throw new Error(`Coordinator training group ${record.id || '(unknown)'} has an invalid NSTP component.`);
  }
  return {
    id: record.id,
    schoolYear: text(record.schoolYear),
    semester: text(record.semester),
    component,
    facilitatorName: text(record.facilitatorName),
    ...(record.facilitatorId ? { facilitatorId: record.facilitatorId } : {}),
    programHandles: Array.isArray(record.programHandles) ? record.programHandles.map(text).filter(Boolean) : [],
    ...(record.municipality ? { municipality: record.municipality } : {}),
    studentCount: Number(record.studentCount) || 0,
    maxRecommendedLoad: Number(record.maxRecommendedLoad) || 0,
    sourceDocument: text(record.sourceDocument),
  };
}

/** GET /api/nstp/coordinators/component/students — scoped by the server. */
export async function fetchCoordinatorStudents(completedModuleTarget = 0): Promise<NstpStudent[]> {
  const response = await apiGet<ApiEnvelope<CoordinatorStudentRecord[]>>('/nstp/coordinators/component/students');
  const records = Array.isArray(response?.data) ? response.data : [];
  return records.map((record) => toCoordinatorStudent(record, completedModuleTarget));
}

/** GET /api/nstp/coordinators/component/classes — scoped by the server. */
export async function fetchCoordinatorClasses(): Promise<CoordinatorClass[]> {
  const response = await apiGet<ApiEnvelope<CoordinatorClassRecord[]>>('/nstp/coordinators/component/classes');
  const records = Array.isArray(response?.data) ? response.data : [];
  return records.map(toCoordinatorClass);
}

/**
 * GET /api/nstp/coordinators/component/training-groups — scoped by the server.
 *
 * The component restriction is applied in the backend query
 * (`listCoordinatorTrainingGroups`), so every row in the response already belongs
 * to this coordinator's program. As with the two reads above, no filtering is
 * repeated here; doing so would imply the browser was the authority.
 */
export async function fetchCoordinatorTrainingGroups(): Promise<NstpTrainingGroup[]> {
  const response = await apiGet<ApiEnvelope<CoordinatorTrainingGroupRecord[]>>('/nstp/coordinators/component/training-groups');
  const records = Array.isArray(response?.data) ? response.data : [];
  return records.map(toCoordinatorTrainingGroup);
}
