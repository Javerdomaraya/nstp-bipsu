import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import type { NstpAccount, NstpStudent, NstpModule, NstpAssessment, NstpGradeRecord, NstpTrainingGroup, NstpAttendanceRecord, NstpAttendanceSession, QualifyingExamResult, ComponentApplicationState, PendingStudentRegistration } from '../data/nstpData';

const STALE_TIME = 30_000;

function useGenericQuery<T>(key: string[], fetchFn: () => Promise<T>) {
  return useQuery<T>({ queryKey: key, queryFn: fetchFn, staleTime: STALE_TIME });
}

function useGenericMutation<T, V = T>(
  key: string[],
  mutationFn: (vars: V) => Promise<T>,
) {
  const qc = useQueryClient();
  return useMutation<T, Error, V>({
    mutationFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useAccounts() {
  return useGenericQuery(['accounts'], api.fetchAccounts);
}

export function useUpsertAccount() {
  return useGenericMutation(['accounts'], (data: NstpAccount) => api.upsertAccount(data));
}

export function useDeleteAccount() {
  return useGenericMutation(['accounts'], (id: string) => api.deleteAccount(id));
}

export function useStudents() {
  return useGenericQuery(['students'], api.fetchStudents);
}

export function useUpsertStudent() {
  return useGenericMutation(['students', 'accounts'], (data: NstpStudent) => api.upsertStudent(data));
}

export function useDeleteStudent() {
  return useGenericMutation(['students'], (id: string) => api.deleteStudent(id));
}

export function usePatchStudent() {
  return useGenericMutation(['students', 'accounts', 'summary'], ({ id, patch }: { id: string; patch: Partial<NstpStudent> }) => api.patchStudent(id, patch));
}

export function useModules(options?: { enabled?: boolean }) {
  return useQuery<NstpModule[]>({
    queryKey: ['modules'],
    queryFn: api.fetchModules,
    staleTime: STALE_TIME,
    enabled: options?.enabled,
  });
}

export function useUpsertModule() {
  return useGenericMutation(['modules'], (data: NstpModule) => api.upsertModule(data));
}

export function useDeleteModule() {
  return useGenericMutation(['modules'], (id: string) => api.deleteModule(id));
}

export function useAssessments(options?: { enabled?: boolean }) {
  return useQuery<NstpAssessment[]>({
    queryKey: ['assessments'],
    queryFn: api.fetchAssessments,
    staleTime: STALE_TIME,
    enabled: options?.enabled,
  });
}

export function useUpsertAssessment() {
  return useGenericMutation(['assessments'], (data: NstpAssessment) => api.upsertAssessment(data));
}

export function useDeleteAssessment() {
  return useGenericMutation(['assessments'], (id: string) => api.deleteAssessment(id));
}

export function useGrades() {
  return useGenericQuery(['grades'], api.fetchGrades);
}

export function useUpsertGrade() {
  return useGenericMutation(['grades'], (data: NstpGradeRecord) => api.upsertGrade(data));
}

export function useDeleteGrade() {
  return useGenericMutation(['grades'], (gradeId: string) => api.deleteGrade(gradeId));
}

export function useTrainingGroups() {
  return useGenericQuery(['training-groups'], api.fetchTrainingGroups);
}

export function useUpsertTrainingGroup() {
  return useGenericMutation(['training-groups'], (data: NstpTrainingGroup) => api.upsertTrainingGroup(data));
}

export function useDeleteTrainingGroup() {
  return useGenericMutation(['training-groups'], (id: string) => api.deleteTrainingGroup(id));
}

export function useAttendanceRecords() {
  return useGenericQuery(['attendance-records'], api.fetchAttendanceRecords);
}

export function useUpsertAttendanceRecord() {
  return useGenericMutation(['attendance-records'], (data: NstpAttendanceRecord) => api.upsertAttendanceRecord(data));
}

export function useAttendanceSessions() {
  return useGenericQuery(['attendance-sessions'], api.fetchAttendanceSessions);
}

export function useUpsertAttendanceSession() {
  return useGenericMutation(['attendance-sessions'], (data: NstpAttendanceSession) => api.upsertAttendanceSession(data));
}

export function useQualifyingResults() {
  return useGenericQuery(['qualifying-results'], api.fetchQualifyingResults);
}

export function useUpsertQualifyingResult() {
  return useGenericMutation(['qualifying-results'], (data: QualifyingExamResult) => api.upsertQualifyingResult(data));
}

export function useComponentState() {
  return useGenericQuery(['component-state'], api.fetchComponentState);
}

export function useUpsertComponentState() {
  return useGenericMutation(['component-state'], (data: ComponentApplicationState) => api.upsertComponentState(data));
}

export function useCurrentUser() {
  return useQuery<{ success: boolean; data: Record<string, any> } | null>({
    queryKey: ['currentUser'],
    queryFn: () => api.fetchCurrentUser(),
    staleTime: STALE_TIME,
  });
}

export function useUpdateCurrentUser() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean; data: Record<string, any> } | null, Error, Record<string, any>>({
    mutationFn: (data) => api.updateCurrentUser(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['currentUser'] }),
  });
}

export function usePendingRegistrations() {
  return useGenericQuery(['pending-registrations'], api.fetchPendingRegistrations);
}

export function useUpsertPendingRegistration() {
  return useGenericMutation(['pending-registrations', 'students'], (data: PendingStudentRegistration) => api.upsertPendingRegistration(data));
}

export function useDeletePendingRegistration() {
  return useGenericMutation(['pending-registrations'], (id: string) => api.deletePendingRegistration(id));
}

export function useAnnouncements() {
  return useGenericQuery(['announcements'], api.fetchAnnouncements);
}

export function useCreateAnnouncement() {
  return useGenericMutation(['announcements'], (data: { title: string; message: string; audience: string; priority: string }) => api.createAnnouncement(data));
}

export function useDeleteAnnouncement() {
  return useGenericMutation(['announcements'], (id: string) => api.deleteAnnouncement(id));
}
