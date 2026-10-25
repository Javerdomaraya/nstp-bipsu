import { apiGet, apiPost, apiPut, apiPatch, apiDel } from './apiClient';
import { modulePayload } from './modules';
import type { NstpAccount, NstpStudent, NstpModule, NstpAssessment, NstpGradeRecord, NstpTrainingGroup, NstpAttendanceRecord, NstpAttendanceSession, QualifyingExamResult, ComponentApplicationState, PendingStudentRegistration } from '../data/nstpData';

type AuditLogEntry = { id: string; actor: string; action: string; detail?: string; at: string };

const BASE = '/nstp/admin';

export async function fetchAccounts() {
  return apiGet<NstpAccount[]>(`${BASE}/accounts`, []);
}

export async function upsertAccount(payload: NstpAccount) {
  return apiPost<NstpAccount>(`${BASE}/accounts`, payload, null as unknown as NstpAccount);
}

export async function deleteAccount(id: string) {
  return apiDel<{ deleted: string }>(`${BASE}/accounts/${id}`, null as unknown as { deleted: string });
}

export async function fetchStudents() {
  return apiGet<NstpStudent[]>(`${BASE}/students`, []);
}

export async function upsertStudent(payload: NstpStudent) {
  return apiPost<NstpStudent>(`${BASE}/students`, payload, null as unknown as NstpStudent);
}

export async function deleteStudent(id: string) {
  return apiDel<{ deleted: string }>(`${BASE}/students/${id}`, null as unknown as { deleted: string });
}

export async function fetchModules() {
  return apiGet<NstpModule[]>(`${BASE}/modules`, []);
}

export async function upsertModule(payload: NstpModule) {
  const response = await apiPatch<{ success: boolean; data: NstpModule }>(`${BASE}/modules/${encodeURIComponent(payload.id)}`, modulePayload(payload));
  return response.data;
}

export async function deleteModule(id: string) {
  const response = await apiDel<{ success: boolean; data: { id: string; archived: boolean } }>(`${BASE}/modules/${encodeURIComponent(id)}`);
  return response.data;
}

export async function fetchAssessments() {
  return apiGet<NstpAssessment[]>(`${BASE}/assessments`, []);
}

export async function upsertAssessment(payload: NstpAssessment) {
  return apiPost<NstpAssessment>(`${BASE}/assessments`, payload, null as unknown as NstpAssessment);
}

export async function deleteAssessment(id: string) {
  return apiDel<{ deleted: string }>(`${BASE}/assessments/${id}`, null as unknown as { deleted: string });
}

export async function fetchGrades() {
  return apiGet<NstpGradeRecord[]>(`${BASE}/grades`, []);
}

export async function upsertGrade(payload: NstpGradeRecord) {
  return apiPost<NstpGradeRecord>(`${BASE}/grades`, payload, null as unknown as NstpGradeRecord);
}

export async function deleteGrade(gradeId: string) {
  return apiDel<{ deleted: string }>(`${BASE}/grades/${gradeId}`, null as unknown as { deleted: string });
}

export async function fetchTrainingGroups() {
  return apiGet<NstpTrainingGroup[]>(`${BASE}/training-groups`, []);
}

export async function upsertTrainingGroup(payload: NstpTrainingGroup) {
  return apiPost<NstpTrainingGroup>(`${BASE}/training-groups`, payload, null as unknown as NstpTrainingGroup);
}

export async function deleteTrainingGroup(id: string) {
  return apiDel<{ deleted: string }>(`${BASE}/training-groups/${id}`, null as unknown as { deleted: string });
}

export async function fetchAttendanceRecords() {
  return apiGet<NstpAttendanceRecord[]>(`${BASE}/attendance-records`, []);
}

export async function upsertAttendanceRecord(payload: NstpAttendanceRecord) {
  return apiPost<NstpAttendanceRecord>(`${BASE}/attendance-records`, payload, null as unknown as NstpAttendanceRecord);
}

export async function fetchAttendanceSessions() {
  return apiGet<NstpAttendanceSession[]>(`${BASE}/attendance-sessions`, []);
}

export async function upsertAttendanceSession(payload: NstpAttendanceSession) {
  return apiPost<NstpAttendanceSession>(`${BASE}/attendance-sessions`, payload, null as unknown as NstpAttendanceSession);
}

export async function fetchQualifyingResults() {
  return apiGet<QualifyingExamResult[]>(`${BASE}/qualifying-results`, []);
}

export async function fetchMyQualifyingResults() {
  return apiGet<any[]>('/nstp/students/me/qualifying-results', []);
}

export async function upsertQualifyingResult(payload: QualifyingExamResult) {
  return apiPost<QualifyingExamResult>(`${BASE}/qualifying-results`, payload, null as unknown as QualifyingExamResult);
}

export async function fetchComponentState() {
  return apiGet<ComponentApplicationState[]>(`${BASE}/component-state`, []);
}

export async function upsertComponentState(payload: ComponentApplicationState) {
  return apiPost<ComponentApplicationState>(`${BASE}/component-state`, payload, null as unknown as ComponentApplicationState);
}

export async function fetchPendingRegistrations() {
  return apiGet<PendingStudentRegistration[]>(`${BASE}/pending-registrations`, []);
}

export async function upsertPendingRegistration(payload: PendingStudentRegistration) {
  return apiPost<PendingStudentRegistration>(`${BASE}/pending-registrations`, payload, null as unknown as PendingStudentRegistration);
}

export async function deletePendingRegistration(id: string) {
  return apiDel<{ deleted: string }>(`${BASE}/pending-registrations/${id}`, null as unknown as { deleted: string });
}

export async function fetchCurrentUser() {
  return apiGet<{ success: boolean; data: Record<string, any> } | null>('/auth/me', null);
}

export async function logoutCurrentUser() {
  return apiPost<null>('/auth/logout', {}, null);
}

export async function updateCurrentUser(payload: Record<string, any>) {
  return apiPut<{ success: boolean; data: Record<string, any> } | null>('/auth/me', payload, null);
}

export async function fetchAuditLog() {
  return apiGet<AuditLogEntry[]>(`${BASE}/audit-log`, []);
}

export async function upsertAuditLogEntry(payload: AuditLogEntry) {
  return apiPost<AuditLogEntry>(`${BASE}/audit-log`, payload, null as unknown as AuditLogEntry);
}

export async function batchUpsert<T>(collection: string, records: T[]) {
  return apiPost<{ upserted: number }>(`${BASE}/${collection}/batch`, records, null as unknown as { upserted: number });
}

// --- Address API ---

export type Province = { code: string; name: string };
export type Municipality = { code: string; name: string; provinceCode: string };
export type Barangay = { code: string; name: string; municipalityCode: string };

export async function fetchProvinces() {
  return apiGet<{ success: boolean; data: Province[] }>('/address/provinces', { success: false, data: [] });
}

export async function fetchMunicipalities(provinceCode: string) {
  return apiGet<{ success: boolean; data: Municipality[] }>(`/address/municipalities?provinceCode=${encodeURIComponent(provinceCode)}`, { success: false, data: [] });
}

export async function searchBarangays(municipalityCode: string, query: string) {
  const params = new URLSearchParams({ municipalityCode });
  if (query) params.set('q', query);
  return apiGet<{ success: boolean; data: Barangay[] }>(`/address/barangays/search?${params.toString()}`, { success: false, data: [] });
}
