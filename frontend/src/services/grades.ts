import { apiGet, apiPatch, apiPost } from './apiClient';

export type AcademicSemester = 'FIRST' | 'SECOND';
export type GradeClassification = 'EXCELLENT' | 'OUTSTANDING' | 'VERY_GOOD' | 'GOOD' | 'FAIR' | 'POOR' | 'CONDITIONAL' | 'FAILED';
export type GradeInputType = 'PERCENT' | 'NUMERICAL';

export type SemesterGrade = {
  id: string;
  studentId: string;
  componentId: string;
  schoolYear: string;
  semester: AcademicSemester;
  percentGrade: number | null;
  numericalGrade: number | null;
  classification: GradeClassification;
  inputType: GradeInputType | null;
  inputValue: number | null;
  gradeScaleVersion: string | null;
  percentEquivalent: string;
  numericalEquivalent: string;
  remarks?: string | null;
  isReleased: boolean;
  releasedAt?: string | null;
  updatedAt: string;
  student?: { id: string; studentNumber: string; user: { name: string; email: string } };
  component?: { id: string; type: string; name: string };
};

type ApiEnvelope<T> = { success: boolean; data: T; meta?: { page: number; pageSize: number; total: number; totalPages: number } };
export type GradeInput = { inputType: GradeInputType; inputValue: number };
export type GradeDraft = Pick<SemesterGrade, 'studentId' | 'componentId' | 'schoolYear' | 'semester'> & { gradeInput: GradeInput; remarks?: string };
export type GradeRosterRow = {
  student: {
    id: string; studentNumber: string; componentId?: string | null;
    user: { name: string; email: string };
    component?: { id: string; type: string; name: string } | null;
  };
  grade: SemesterGrade | null;
};

export async function fetchAdminGrades(filters: { schoolYear: string; semester: AcademicSemester; page?: number; pageSize?: number; search?: string }) {
  const params = new URLSearchParams({ schoolYear: filters.schoolYear, semester: filters.semester, page: String(filters.page || 1), pageSize: String(filters.pageSize || 100) });
  if (filters.search) params.set('search', filters.search);
  return apiGet<ApiEnvelope<SemesterGrade[]>>(`/nstp/admin/grades?${params.toString()}`);
}

/**
 * GET /nstp/coordinators/grades — the server restricts the result to the
 * coordinator's own component ids and ignores any componentId sent by the
 * client, so no additional narrowing happens here.
 */
export async function fetchCoordinatorGrades(filters: { schoolYear: string; semester: AcademicSemester; page?: number; pageSize?: number; search?: string }) {
  const params = new URLSearchParams({ schoolYear: filters.schoolYear, semester: filters.semester, page: String(filters.page || 1), pageSize: String(filters.pageSize || 100) });
  if (filters.search) params.set('search', filters.search);
  return apiGet<ApiEnvelope<SemesterGrade[]>>(`/nstp/coordinators/grades?${params.toString()}`);
}

export async function fetchAdminGradeRoster(filters: { schoolYear: string; semester: AcademicSemester; page: number; pageSize: number; search?: string }) {  const params = new URLSearchParams({ schoolYear: filters.schoolYear, semester: filters.semester, page: String(filters.page), pageSize: String(filters.pageSize) });
  if (filters.search) params.set('search', filters.search);
  return apiGet<ApiEnvelope<GradeRosterRow[]>>(`/nstp/admin/grade-roster?${params.toString()}`);
}

export async function createAdminGrade(payload: GradeDraft) {
  return (await apiPost<ApiEnvelope<SemesterGrade>>('/nstp/admin/grades', payload)).data;
}

export async function updateAdminGrade(id: string, payload: Pick<GradeDraft, 'gradeInput' | 'remarks'>) {
  return (await apiPatch<ApiEnvelope<SemesterGrade>>(`/nstp/admin/grades/${encodeURIComponent(id)}`, payload)).data;
}

export async function setAdminGradeRelease(id: string, released: boolean) {
  return (await apiPost<ApiEnvelope<SemesterGrade>>(`/nstp/admin/grades/${encodeURIComponent(id)}/${released ? 'release' : 'hold'}`, {})).data;
}

export type InstructorClass = { id: string; code: string; name: string; schoolYear: string; semester: string; componentId: string };

export async function fetchInstructorClasses() {
  return (await apiGet<ApiEnvelope<InstructorClass[]>>('/nstp/instructors/classes')).data;
}

export async function fetchInstructorGradeRoster(classId: string, filters: { schoolYear: string; semester: AcademicSemester; page: number; pageSize: number; search?: string }) {
  const params = new URLSearchParams({ schoolYear: filters.schoolYear, semester: filters.semester, page: String(filters.page), pageSize: String(filters.pageSize) });
  if (filters.search) params.set('search', filters.search);
  return apiGet<ApiEnvelope<GradeRosterRow[]>>(`/nstp/instructors/classes/${encodeURIComponent(classId)}/grade-roster?${params.toString()}`);
}

export async function saveInstructorGrade(classId: string, payload: Omit<GradeDraft, 'componentId'>) {
  return (await apiPost<ApiEnvelope<SemesterGrade>>(`/nstp/instructors/classes/${encodeURIComponent(classId)}/grades`, payload)).data;
}

export type GradeConversionPreview = {
  percentEquivalent: string;
  numericalEquivalent: string;
  classification: GradeClassification;
};

const classificationForPercent = (value: number): GradeClassification => {
  if (value >= 95) return 'EXCELLENT';
  if (value >= 90) return 'OUTSTANDING';
  if (value >= 86) return 'VERY_GOOD';
  if (value >= 80) return 'GOOD';
  if (value >= 76) return 'FAIR';
  if (value === 75) return 'POOR';
  if (value >= 71) return 'CONDITIONAL';
  return 'FAILED';
};

export function previewGradeConversion(inputType: GradeInputType, inputValue: number): GradeConversionPreview | null {
  if (inputType === 'PERCENT') {
    if (!Number.isInteger(inputValue) || inputValue < 0 || inputValue > 100) return null;
    let numericalEquivalent = '3.1–4.0';
    if (inputValue >= 95) numericalEquivalent = '1.0';
    else if (inputValue >= 76) numericalEquivalent = ((105 - inputValue) / 10).toFixed(1);
    else if (inputValue === 75) numericalEquivalent = '3.0';
    else if (inputValue <= 70) numericalEquivalent = '5.0';
    return { percentEquivalent: `${inputValue}%`, numericalEquivalent, classification: classificationForPercent(inputValue) };
  }

  const singleDecimal = Number.isFinite(inputValue) && Math.abs(Math.round(inputValue * 10) - inputValue * 10) < Number.EPSILON * 10;
  if (!singleDecimal || inputValue < 1 || inputValue > 5 || (inputValue > 4 && inputValue < 5)) return null;
  let percentEquivalent: string;
  if (inputValue === 1) percentEquivalent = '95–100%';
  else if (inputValue >= 1.1 && inputValue <= 2.9) percentEquivalent = `${Math.round(105 - inputValue * 10)}%`;
  else if (inputValue === 3) percentEquivalent = '75%';
  else if (inputValue >= 3.1 && inputValue <= 4) percentEquivalent = '71–74%';
  else percentEquivalent = '70% or below';
  const classification = inputValue === 1 ? 'EXCELLENT'
    : inputValue <= 1.5 ? 'OUTSTANDING'
      : inputValue <= 1.9 ? 'VERY_GOOD'
        : inputValue <= 2.5 ? 'GOOD'
          : inputValue <= 2.9 ? 'FAIR'
            : inputValue === 3 ? 'POOR'
              : inputValue <= 4 ? 'CONDITIONAL' : 'FAILED';
  return { percentEquivalent, numericalEquivalent: inputValue.toFixed(1), classification };
}
