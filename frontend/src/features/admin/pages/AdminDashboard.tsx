import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Users, BookOpen, TrendingUp, Award, Search, ClipboardList, TriangleAlert, Siren, Target, Plus, Save, Pencil, Trash2, Mail, BarChart3, GraduationCap, BadgeCheck, X, UserRoundPlus, Eye, EyeOff, FileDown, FileUp, History, ArrowLeft, Bell, Building2, CalendarDays, Check, ChevronDown, Home, Settings, SunMedium, UserCheck, Printer, GripVertical, Menu, UserCog, ShieldCheck, Loader2, KeyRound } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, CartesianGrid, XAxis, YAxis, Bar, LineChart, Line, Legend } from 'recharts';
import ComponentAssignment from '../components/ComponentAssignment';
import AssessmentManager from '../../assessments/components/AssessmentManager';
import ModulesPage from '../../../pages/ModulesPage';

import CollapsibleRoleSidebar from '../../../components/layout/CollapsibleRoleSidebar';
import StudentProfileModal from '../components/StudentProfileModal';
import AdminGradesView from '../components/AdminGradesView';
import { createEmptyStudent, safeJsonParse, PendingStudentRegistration, NstpStudent, NstpAccount, NstpComponent, NstpRole, BiliranMunicipality, BILIRAN_MUNICIPALITIES, NSTP_COMPONENTS, toNstpComponent, AUDIT_LOG_KEY, type CoordinatorScope } from '../../../data/nstpData';
import { apiPost, apiPut, apiDel } from '../../../services/apiClient';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCurrentUser,
  useUpdateCurrentUser,
  useStudents,
  useAccounts,
  useUpsertAccount,
  useModules,
  useAssessments,
  useTrainingGroups,
  usePendingRegistrations,
  usePatchStudent,
  useUpsertStudent,
  useDeleteStudent,
} from '../../../hooks/index';
import { batchUpsert, patchStudent } from '../../../services/api';
import { parseStudentCsv, toCsv } from '../../../utils/spreadsheet';
import { ACCEPTED_COMPONENTS_HINT, validateStudentImportRows } from '../../../utils/studentImport';
import { createRegistrationApprovalClient, getRegistrationApprovalErrorMessage } from '../services/registrationApproval';
import {
  activateProfileTemplate, createTemplateBackup, fetchProfileTemplates, parseTemplateBackup,
  publishProfileTemplate, recordProfileExport, saveProfileTemplateDraft, validateProfileConfiguration,
  type ProfileExportConfiguration, type ProfileTemplateVersion,
} from '../../../services/profileTemplates';
import { createCoordinator, fetchAdminCoordinators, setCoordinatorStatus, updateCoordinator, type CoordinatorRecord } from '../../../services/staff';
import { getCurrentAcademicYear, getCurrentSchoolYear, getSchoolYearOptions } from '../../../utils/academicYear';

type AdminAuditEntry = {
  id: string;
  actor: string;
  action: string;
  detail: string;
  at: string;
};

type StudentFilterPreset = {
  id: string;
  name: string;
  filter: string;
  search: string;
  sortBy: string;
};

const FILTER_PRESETS_KEY = 'nstp-student-filter-presets';
const CURRENT_SCHOOL_YEAR = getCurrentSchoolYear();
const SCHOOL_YEARS = getSchoolYearOptions();

type OfficialProfileTemplate = ProfileExportConfiguration;

const PROFILE_FIELD_DEFINITIONS = [
  { key: 'surname', label: 'Surname' },
  { key: 'firstName', label: 'First Name' },
  { key: 'middleName', label: 'Middle Name' },
  { key: 'school', label: 'School / College / Department' },
  { key: 'degreeProgram', label: 'Degree Program' },
  { key: 'yearLevel', label: 'Year Level' },
  { key: 'major', label: 'Major' },
  { key: 'gender', label: 'Gender' },
  { key: 'birthdate', label: 'Birthdate' },
  { key: 'houseStreetPurok', label: 'House No. / Street / Purok' },
  { key: 'barangay', label: 'Barangay' },
  { key: 'currentAddress', label: 'Current Address' },
  { key: 'provincialAddress', label: 'Provincial Address' },
  { key: 'municipality', label: 'Municipality' },
  { key: 'province', label: 'Province' },
  { key: 'contactNumber', label: 'Contact Number' },
  { key: 'email', label: 'E-Mail Address' },
  { key: 'studentId', label: 'Student ID' },
];

const DEFAULT_PROFILE_FIELD_ORDER = PROFILE_FIELD_DEFINITIONS.map((field) => field.key);

const DEFAULT_FORM_TEMPLATE: OfficialProfileTemplate = {
  layout: 'classic',
  pageSize: 'a4',
  orientation: 'portrait',
  republicLine: 'Republic of the Philippines',
  schoolName: 'BILIRAN PROVINCE STATE UNIVERSITY',
  certificationLine: 'ISO 9001:2015 CERTIFIED',
  officeName: 'OFFICE OF THE NATIONAL SERVICE TRAINING PROGRAM',
  formTitle: 'STUDENT PROFILE',
  academicPeriod: `First Semester, Academic Year ${getCurrentAcademicYear()}`,
  fieldHeader: 'Field',
  valueHeader: 'Submitted Information',
  accentColor: '#1d4ed8',
  leftCopyLabel: "OFFICE'S COPY",
  rightCopyLabel: "STUDENT'S COPY",
  studentSignatureLabel: 'Signature over Printed Name',
  signatoryName: 'Dr. Reynold G. Bustillo',
  signatoryTitle: 'NSTP DIRECTOR',
  signatureSpacing: 48,
  fieldOrder: DEFAULT_PROFILE_FIELD_ORDER,
  showFieldBorders: true,
  repeatHeader: true,
};

const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace('#', '');
  const value = /^[0-9a-fA-F]{6}$/.test(normalized) ? normalized : '1d4ed8';
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
};

const getStudentSchoolYear = (student: NstpStudent) => {
  const match = (student.studentId || '').match(/^(20\d{2})/);
  const year = match ? Number(match[1]) : Number.NaN;
  if (!Number.isFinite(year)) return CURRENT_SCHOOL_YEAR;
  return `SY ${year}-${year + 1}`;
};

const emptyLookup = () => ({
  total: 0,
  active: 0,
  pending: 0,
  graduated: 0,
});

type AdminDashboardView = 'overview' | 'enrollment' | 'students' | 'tools' | 'modules' | 'assessments' | 'facilitators' | 'coordinators' | 'municipalities' | 'assignments' | 'exports' | 'settings' | 'account';

type AdminDashboardProps = {
  initialView?: AdminDashboardView;
  onNavigateApp?: (target: string) => void;
  onLogout?: () => void;
  embedded?: boolean;
};

export default function AdminDashboard({ initialView = 'overview', onNavigateApp, onLogout, embedded = false }: AdminDashboardProps) {
  const [view, setView] = useState<AdminDashboardView>(initialView);
  const [adminMobileSidebarOpen, setAdminMobileSidebarOpen] = useState(false);
  const [students, setStudents] = useState<NstpStudent[]>([]);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [studentForm, setStudentForm] = useState<NstpStudent | null>(null);
  const [spotlightStudentId, setSpotlightStudentId] = useState<string | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentDetailId, setStudentDetailId] = useState<string | null>(null);
  // Pre-selected value of the bulk-reassign dropdown, not an inferred value: the
  // administrator sees CWTS selected and must press the action to apply it.
  const [bulkComponent, setBulkComponent] = useState<NstpComponent>('CWTS');
  const [auditLog, setAuditLog] = useState<AdminAuditEntry[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [filterPresets, setFilterPresets] = useState<StudentFilterPreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const registrationApprovalClientRef = useRef(createRegistrationApprovalClient());
  const [pendingRegistrations, setPendingRegistrations] = useState<PendingStudentRegistration[]>([]);
  const [approvingRegistrationIds, setApprovingRegistrationIds] = useState<string[]>([]);
  const [registrationApprovalErrors, setRegistrationApprovalErrors] = useState<Record<string, string>>({});
  const [trainingGroups, setTrainingGroups] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('risk');
  const [studentPage, setStudentPage] = useState(1);
  const [studentsPerPage, setStudentsPerPage] = useState(10);
  const [accountVersion, setAccountVersion] = useState(0);
  const [adminSearch, setAdminSearch] = useState('');
  const [schoolYear, setSchoolYear] = useState(CURRENT_SCHOOL_YEAR);
  const [adminTheme, setAdminTheme] = useState<'light' | 'dark'>(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [noticeDigest, setNoticeDigest] = useState(true);
  const [autoAssignMunicipality, setAutoAssignMunicipality] = useState(true);
  const [compactAdminCards, setCompactAdminCards] = useState(false);
  const [municipalitySearch, setMunicipalitySearch] = useState('');
  const [municipalityStatusFilter, setMunicipalityStatusFilter] = useState('all');
  const [municipalitySort, setMunicipalitySort] = useState('name');
  const [openMunicipalityManage, setOpenMunicipalityManage] = useState<string | null>(null);
  const [exportSettingsOpen, setExportSettingsOpen] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pendingHeaderCrop, setPendingHeaderCrop] = useState<{ dataUrl: string; name: string } | null>(null);
  const [headerCrop, setHeaderCrop] = useState({ x: 0, y: 0, width: 100, height: 38 });
  const [headerCropDrag, setHeaderCropDrag] = useState<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [layoutDragStartY, setLayoutDragStartY] = useState<number | null>(null);
  const [formTemplate, setFormTemplate] = useState<OfficialProfileTemplate>(DEFAULT_FORM_TEMPLATE);
  const [activeProfileTemplate, setActiveProfileTemplate] = useState<ProfileTemplateVersion | null>(null);
  const [profileTemplateVersions, setProfileTemplateVersions] = useState<ProfileTemplateVersion[]>([]);
  const [savedProfileTemplateDraft, setSavedProfileTemplateDraft] = useState<ProfileTemplateVersion | null>(null);
  const [profileTemplateName, setProfileTemplateName] = useState('Official Student Profile');
  const [profileTemplateSaving, setProfileTemplateSaving] = useState(false);
  const [profileTemplateError, setProfileTemplateError] = useState<string | null>(null);
  const [profileTemplateDirty, setProfileTemplateDirty] = useState(false);

  const { data: serverStudents = [], isLoading: studentsLoading, refetch: refetchStudents } = useStudents();
  const { data: serverAccounts = [], isLoading: accountsLoading } = useAccounts();
  const { data: serverModules = [], isLoading: modulesLoading } = useModules();
  const { data: serverAssessments = [], isLoading: assessmentsLoading } = useAssessments();
  const { data: serverTrainingGroups = [] } = useTrainingGroups();
  const { data: serverPendingRegistrations = [] } = usePendingRegistrations();
  const patchStudentMutation = usePatchStudent();
  const upsertStudentMutation = useUpsertStudent();
  const deleteStudentMutation = useDeleteStudent();
  const upsertAccountMutation = useUpsertAccount();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (serverStudents) {
      setStudents(serverStudents);
    }
  }, [serverStudents]);

  useEffect(() => {
    if (serverPendingRegistrations) {
      setPendingRegistrations(serverPendingRegistrations);
    }
  }, [serverPendingRegistrations]);

  useEffect(() => {
    if (serverTrainingGroups) {
      setTrainingGroups(serverTrainingGroups);
    }
  }, [serverTrainingGroups]);

  useEffect(() => {
    setAuditLog(safeJsonParse<AdminAuditEntry[]>(localStorage.getItem(AUDIT_LOG_KEY), []));
    setFilterPresets(safeJsonParse<StudentFilterPreset[]>(localStorage.getItem(FILTER_PRESETS_KEY), []));
    setFormTemplate(DEFAULT_FORM_TEMPLATE);

    fetchProfileTemplates().then((collection) => {
      setActiveProfileTemplate(collection.active);
      setProfileTemplateVersions(collection.versions);
      const editable = collection.latestDraft || collection.active;
      setSavedProfileTemplateDraft(collection.latestDraft);
      if (editable) {
        setFormTemplate(validateProfileConfiguration(editable.configuration));
        setProfileTemplateName(editable.name);
      }
      setProfileTemplateDirty(false);
      setProfileTemplateError(null);
    }).catch((error) => setProfileTemplateError(error instanceof Error ? error.message : 'Unable to load the official profile layout.'));
  }, []);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (exportSettingsOpen) setExportSettingsOpen(false);
      else if (pdfPreviewOpen) setPdfPreviewOpen(false);
      else if (pendingHeaderCrop) setPendingHeaderCrop(null);
      else if (studentDetailId) setStudentDetailId(null);
      else if (studentForm) cancelStudentEdit();
      else if (openMunicipalityManage) setOpenMunicipalityManage(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [exportSettingsOpen, pdfPreviewOpen, pendingHeaderCrop, studentDetailId, studentForm, openMunicipalityManage]);

  useEffect(() => {
    if (studentForm) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [studentForm]);

  const assessments = serverAssessments;
  const publishedAssessmentCount = assessments.filter((assessment) => assessment.status === 'published').length;
  const modules = serverModules;
  const facilitatorAccounts = useMemo(() => serverAccounts.filter((account) => account.role === 'facilitator'), [serverAccounts]);
  const coordinatorAccounts = useMemo(() => serverAccounts.filter((account) => account.role === 'coordinator'), [serverAccounts]);
  const currentAdmin = useMemo(() => serverAccounts.find((account) => account.role === 'admin') || null, [serverAccounts]);

  const persistStudents = (nextStudents: NstpStudent[]) => {
    setStudents(nextStudents);
  };

  const persistPendingRegistrations = (nextRegistrations: PendingStudentRegistration[]) => {
    setPendingRegistrations(nextRegistrations);
  };

  const persistAuditLog = (nextLog: AdminAuditEntry[]) => {
    localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(nextLog));
    setAuditLog(nextLog);
  };

  const logAudit = (action: string, detail: string) => {
    const entry: AdminAuditEntry = {
      id: `audit-${Math.random().toString(36).slice(2, 10)}`,
      actor: 'Administrator',
      action,
      detail,
      at: new Date().toISOString(),
    };
    const nextLog = [entry, ...auditLog].slice(0, 120);
    persistAuditLog(nextLog);
  };

  const persistFilterPresets = (nextPresets: StudentFilterPreset[]) => {
    localStorage.setItem(FILTER_PRESETS_KEY, JSON.stringify(nextPresets));
    setFilterPresets(nextPresets);
  };

  const saveCurrentFilterPreset = () => {
    const name = presetName.trim();
    if (!name) return;

    const nextPreset: StudentFilterPreset = {
      id: `preset-${Math.random().toString(36).slice(2, 10)}`,
      name,
      filter,
      search,
      sortBy,
    };
    const nextPresets = [nextPreset, ...filterPresets];
    persistFilterPresets(nextPresets);
    setPresetName('');
    logAudit('Saved filter preset', `${name} (${filter}, ${sortBy})`);
  };

  const applyFilterPreset = (presetId: string) => {
    const preset = filterPresets.find((item) => item.id === presetId);
    if (!preset) return;
    setFilter(preset.filter);
    setSearch(preset.search);
    setSortBy(preset.sortBy);
    logAudit('Applied filter preset', preset.name);
  };

  const removeFilterPreset = (presetId: string) => {
    const preset = filterPresets.find((item) => item.id === presetId);
    const nextPresets = filterPresets.filter((item) => item.id !== presetId);
    persistFilterPresets(nextPresets);
    if (preset) {
      logAudit('Deleted filter preset', preset.name);
    }
  };

  const downloadTextFile = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportAuditLogCsv = () => {
    if (auditLog.length === 0) return;
    const header = ['timestamp', 'actor', 'action', 'detail'];
    const rows = auditLog.map((entry) => [
      entry.at,
      entry.actor,
      entry.action,
      entry.detail.replace(/\n/g, ' '),
    ]);
    const csv = toCsv(header, rows);
    downloadTextFile(`nstp-admin-audit-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8;');
    logAudit('Exported audit log', `${auditLog.length} entries exported`);
  };

  const clearAuditLog = () => {
    const shouldClear = window.confirm('Clear the admin audit log? This cannot be undone.');
    if (!shouldClear) return;
    persistAuditLog([]);
  };

  const handleImportCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const importedRows = await parseStudentCsv(file);

      // The component decides which coordinator owns a student, so a blank or
      // unrecognised value is a validation failure and never a guess: an
      // inferred component would turn bad import data into legitimate scoped
      // data for whichever coordinator owns that component. The whole batch is
      // validated before anything is persisted, so a single bad row cannot
      // leave a half-imported roster behind — see `validateStudentImportRows`,
      // which returns no rows at all when any row is invalid.
      const { errors: rowErrors, rows: validatedRows } = validateStudentImportRows(importedRows);

      if (rowErrors.length > 0) {
        logAudit('Rejected student CSV import', `${rowErrors.length} invalid value(s); nothing was imported. ${rowErrors.join(' ')}`);
        const shown = rowErrors.slice(0, 5).join('\n');
        const remaining = rowErrors.length > 5 ? `\n+${rowErrors.length - 5} more issue(s) recorded in the audit log.` : '';
        toast.error(`Import cancelled — no records were saved. Fix ${rowErrors.length} invalid value(s) and upload again.`, {
          description: `${shown}${remaining}\n${ACCEPTED_COMPONENTS_HINT}`,
        });
        return;
      }

      const importedStudents: NstpStudent[] = validatedRows.map(({ row, index, component, status }) => ({
        id: row.id || `student-import-${Date.now()}-${index}`,
        name: row.name,
        email: row.email,
        component,
        progress: row.progress,
        assessments: row.assessments,
        status: status ?? (row.progress === 100 ? 'graduated' : row.progress >= 70 ? 'active' : 'pending'),
        notes: row.notes,
        updatedAt: new Date().toISOString(),
      }));

      const merged = [...students];
      importedStudents.forEach((incoming) => {
        const existingIndex = merged.findIndex((student) => student.id === incoming.id || student.email.toLowerCase() === incoming.email.toLowerCase());
        if (existingIndex >= 0) {
          merged[existingIndex] = { ...merged[existingIndex], ...incoming, updatedAt: new Date().toISOString() };
        } else {
          merged.unshift(incoming);
        }
      });

      await batchUpsert('students', importedStudents);
      refetchStudents();
      logAudit('Imported student CSV', `${importedStudents.length} rows processed`);
      toast.success(`${importedStudents.length} student records imported.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to import the CSV file.');
    } finally {
      event.target.value = '';
    }
  };

  const approveRegistration = async (registration: PendingStudentRegistration) => {
    if (approvingRegistrationIds.includes(registration.id)) return;
    setApprovingRegistrationIds((current) => [...current, registration.id]);
    setRegistrationApprovalErrors((current) => {
      const next = { ...current };
      delete next[registration.id];
      return next;
    });

    try {
      await registrationApprovalClientRef.current.approve(registration.id);
      setPendingRegistrations((current) => current.filter((item) => item.id !== registration.id));
      logAudit('Approved registration', `${registration.name} (${registration.studentId || registration.email})`);
      toast.success(`${registration.name}'s registration was approved.`);

      try {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['accounts'] }),
          queryClient.invalidateQueries({ queryKey: ['students'] }),
          queryClient.invalidateQueries({ queryKey: ['pending-registrations'] }),
        ]);
        setAccountVersion((version) => version + 1);
      } catch {
        toast.warning('Approval succeeded, but the updated roster could not be refreshed. Reload the page to retrieve the confirmed server data.');
      }
    } catch (error) {
      const message = getRegistrationApprovalErrorMessage(error);
      setRegistrationApprovalErrors((current) => ({ ...current, [registration.id]: message }));
      toast.error(message);
    } finally {
      setApprovingRegistrationIds((current) => current.filter((id) => id !== registration.id));
    }
  };

  const rejectRegistration = async (registrationId: string) => {
    const shouldReject = window.confirm('Reject this student registration request?');
    if (!shouldReject) return;
    const registration = pendingRegistrations.find((item) => item.id === registrationId);
    try {
      await apiDel(`/nstp/admin/pending-registrations/${registrationId}`, null);
      persistPendingRegistrations(pendingRegistrations.filter((item) => item.id !== registrationId));
      if (registration) {
        logAudit('Rejected registration', `${registration.name} (${registration.email})`);
      }
      toast.success('Registration request rejected.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to reject registration on server.');
    }
  };

  const startNewStudent = () => {
    setEditingStudentId('new');
    setStudentForm(createEmptyStudent());
  };

  const startEditStudent = (student: NstpStudent) => {
    setView('students');
    setEditingStudentId(student.id);
    setStudentForm({ ...student });
  };

  const cancelStudentEdit = () => {
    setEditingStudentId(null);
    setStudentForm(null);
  };

  const saveStudent = async () => {
    if (!studentForm) return;

    if (studentForm.status === 'active' && !studentForm.component) {
      toast.error('Select an NSTP component before setting this student to active.');
      return;
    }

    const nextStudent = { ...studentForm, progress: Math.max(0, Math.min(100, Number(studentForm.progress) || 0)), assessments: Math.max(0, Number(studentForm.assessments) || 0), updatedAt: new Date().toISOString() };

    try {
      if (editingStudentId === 'new') {
        await upsertStudentMutation.mutateAsync(nextStudent);
        setStudents((prev) => [nextStudent, ...prev]);
        logAudit('Created student', `${nextStudent.name} (${nextStudent.email})`);
      } else {
        await patchStudentMutation.mutateAsync({ id: nextStudent.id, patch: nextStudent });
        setStudents((prev) => prev.map((student) => (student.id === nextStudent.id ? nextStudent : student)));
        logAudit('Updated student', `${nextStudent.name} (${nextStudent.email})`);
      }
      toast.success(editingStudentId === 'new' ? 'Student record created.' : 'Student record updated.');
      cancelStudentEdit();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save student record.');
    }
  };

  const deleteStudent = async (studentId: string) => {
    try {
      await deleteStudentMutation.mutateAsync(studentId);
      setStudents((prev) => prev.filter((student) => student.id !== studentId));
      if (editingStudentId === studentId) {
        cancelStudentEdit();
      }
      toast.success('Student record deleted.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete student record.');
    }
  };

  const requestDeleteStudent = (student: NstpStudent) => {
    const shouldDelete = window.confirm(`Delete ${student.name}'s record? This action cannot be undone.`);
    if (!shouldDelete) return;
    deleteStudent(student.id);
    logAudit('Deleted student', `${student.name} (${student.email})`);
  };

  const getProfileFieldValue = (profile: Partial<PendingStudentRegistration & NstpStudent>, fieldKey: string) => {
    const value = (profile as Record<string, any>)[fieldKey];
    return value == null ? '' : String(value);
  };

  const getProfileFieldLabel = (fieldKey: string) => PROFILE_FIELD_DEFINITIONS.find((field) => field.key === fieldKey)?.label || fieldKey;

  const getTemplateFieldOrder = (template = formTemplate) => {
    const savedOrder = template.fieldOrder?.length ? template.fieldOrder : DEFAULT_PROFILE_FIELD_ORDER;
    const knownFields = new Set(PROFILE_FIELD_DEFINITIONS.map((field) => field.key));
    const ordered = savedOrder.filter((field) => knownFields.has(field));
    const missing = DEFAULT_PROFILE_FIELD_ORDER.filter((field) => !ordered.includes(field));
    return [...ordered, ...missing];
  };

  const getOfficialProfileRows = (profile: Partial<PendingStudentRegistration & NstpStudent>, template = formTemplate) => (
    getTemplateFieldOrder(template).map((fieldKey) => [getProfileFieldLabel(fieldKey), getProfileFieldValue(profile, fieldKey)])
  );

  const getProfileFileName = (profile: Partial<PendingStudentRegistration & NstpStudent>, extension: 'pdf' | 'docx') => {
    const baseName = (profile.name || profile.studentId || 'student-profile').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `nstp-profile-${baseName || 'student'}.${extension}`;
  };

  const getImageTypeFromDataUrl = (dataUrl?: string) => dataUrl?.includes('image/jpeg') || dataUrl?.includes('image/jpg') ? 'JPEG' : 'PNG';

  const dataUrlToUint8Array = (dataUrl: string) => {
    const base64 = dataUrl.split(',')[1] || '';
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  };

  const updateFormTemplate = (field: keyof OfficialProfileTemplate, value: string | boolean | string[] | number) => {
    setFormTemplate((current) => ({ ...current, [field]: value }) as OfficialProfileTemplate);
    setProfileTemplateDirty(true);
  };

  const clampHeaderCrop = (crop: typeof headerCrop) => {
    const width = Math.max(8, Math.min(100, crop.width));
    const height = Math.max(8, Math.min(100, crop.height));
    return {
      width,
      height,
      x: Math.max(0, Math.min(100 - width, crop.x)),
      y: Math.max(0, Math.min(100 - height, crop.y)),
    };
  };

  const updateHeaderCrop = (patch: Partial<typeof headerCrop>) => {
    setHeaderCrop((current) => clampHeaderCrop({ ...current, ...patch }));
  };

  const handleHeaderFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      window.alert('Please upload a PNG or JPG file for the document header.');
      event.target.value = '';
      return;
    }
    if (file.size > 1_000_000) {
      window.alert('Header images must be 1 MB or smaller.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPendingHeaderCrop({ dataUrl: String(reader.result || ''), name: file.name });
      setHeaderCrop({ x: 0, y: 0, width: 92, height: 38 });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const applyHeaderCrop = () => {
    if (!pendingHeaderCrop) return;
    const image = new Image();
    image.onload = () => {
      const cropX = Math.round((headerCrop.x / 100) * image.naturalWidth);
      const cropY = Math.round((headerCrop.y / 100) * image.naturalHeight);
      const cropW = Math.max(1, Math.round((headerCrop.width / 100) * image.naturalWidth));
      const cropH = Math.max(1, Math.round((headerCrop.height / 100) * image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 190;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
      setFormTemplate((current) => ({
        ...current,
        headerImageDataUrl: canvas.toDataURL('image/png'),
        headerImageName: pendingHeaderCrop.name,
      }));
      setProfileTemplateDirty(true);
      logAudit('Uploaded and cropped profile export header', pendingHeaderCrop.name);
      setPendingHeaderCrop(null);
    };
    image.src = pendingHeaderCrop.dataUrl;
  };

  const moveTemplateField = (fromIndex: number, toIndex: number) => {
    const fieldOrder = getTemplateFieldOrder();
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= fieldOrder.length || toIndex >= fieldOrder.length) return;
    const nextOrder = [...fieldOrder];
    const [field] = nextOrder.splice(fromIndex, 1);
    nextOrder.splice(toIndex, 0, field);
    updateFormTemplate('fieldOrder', nextOrder);
  };

  const exportFormTemplate = () => {
    const backup = createTemplateBackup(validateProfileConfiguration(formTemplate), profileTemplateName);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'nstp-profile-layout-backup.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const importFormTemplate = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('Template backups must be 1 MB or smaller.');
      const text = await file.text();
      const parsed = parseTemplateBackup(JSON.parse(text));
      setFormTemplate(parsed.configuration);
      setProfileTemplateName(parsed.templateName);
      setProfileTemplateDirty(true);
      setProfileTemplateError(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Template import failed. Please upload a valid profile layout backup.');
    } finally {
      event.target.value = '';
    }
  };

  const refreshProfileTemplateVersions = async (preferredId?: string) => {
    const collection = await fetchProfileTemplates();
    setActiveProfileTemplate(collection.active);
    setProfileTemplateVersions(collection.versions);
    const preferred = preferredId ? collection.versions.find((version) => version.id === preferredId) : null;
    return preferred || collection.latestDraft || collection.active;
  };

  const saveProfileLayoutDraft = async () => {
    setProfileTemplateSaving(true);
    try {
      const configuration = validateProfileConfiguration(formTemplate);
      const saved = await saveProfileTemplateDraft(profileTemplateName.trim() || 'Official Student Profile', configuration);
      await refreshProfileTemplateVersions(saved.id);
      setSavedProfileTemplateDraft(saved);
      setProfileTemplateDirty(false);
      setProfileTemplateError(null);
      toast.success(`Draft version ${saved.version} saved.`);
      return saved;
    } catch (error) {
      setProfileTemplateError(error instanceof Error ? error.message : 'Unable to save the profile layout draft.');
      return null;
    } finally {
      setProfileTemplateSaving(false);
    }
  };

  const saveAndPublishProfileLayout = async () => {
    setProfileTemplateSaving(true);
    try {
      const configuration = validateProfileConfiguration(formTemplate);
      const draft = !profileTemplateDirty && savedProfileTemplateDraft
        ? savedProfileTemplateDraft
        : await saveProfileTemplateDraft(profileTemplateName.trim() || 'Official Student Profile', configuration);
      setSavedProfileTemplateDraft(draft);
      setProfileTemplateDirty(false);
      const published = await publishProfileTemplate(draft.id);
      await refreshProfileTemplateVersions(published.id);
      setActiveProfileTemplate(published);
      setSavedProfileTemplateDraft(null);
      setFormTemplate(published.configuration);
      setProfileTemplateDirty(false);
      setProfileTemplateError(null);
      toast.success(`Profile layout version ${published.version} is now active.`);
    } catch (error) {
      setProfileTemplateError(error instanceof Error ? error.message : 'Unable to publish the profile layout.');
    } finally {
      setProfileTemplateSaving(false);
    }
  };

  const restoreProfileTemplateVersion = async (version: ProfileTemplateVersion) => {
    setProfileTemplateSaving(true);
    try {
      const activated = await activateProfileTemplate(version.id);
      await refreshProfileTemplateVersions(activated.id);
      setActiveProfileTemplate(activated);
      setSavedProfileTemplateDraft(null);
      setFormTemplate(activated.configuration);
      setProfileTemplateName(activated.name);
      setProfileTemplateDirty(false);
      setProfileTemplateError(null);
      toast.success(`Version ${activated.version} restored as the active layout.`);
    } catch (error) {
      setProfileTemplateError(error instanceof Error ? error.message : 'Unable to restore this template version.');
    } finally {
      setProfileTemplateSaving(false);
    }
  };

  const resetProfileLayout = () => {
    if (!window.confirm('Restore the editor to the default profile layout? This will remain a draft until published.')) return;
    setFormTemplate(DEFAULT_FORM_TEMPLATE);
    setProfileTemplateName('Official Student Profile');
    setProfileTemplateDirty(true);
  };

  const printOfficialProfile = (profile: Partial<PendingStudentRegistration & NstpStudent>) => {
    const fullName = profile.name || [profile.firstName, profile.middleName, profile.surname].filter(Boolean).join(' ');
    const template = activeProfileTemplate?.configuration || DEFAULT_FORM_TEMPLATE;
    const rows = getOfficialProfileRows(profile, template);
    const escapeHtml = (value: string) => String(value || '').replace(/[<>&"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[char] || char));
    const layoutClass = template.layout === 'compact' ? 'compact' : template.layout === 'formal' ? 'formal' : 'classic';
    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) return;
    void recordProfileExport(String(profile.id || profile.studentId || 'unknown'), 'PRINT').catch(() => {
      toast.error('The profile opened, but its export audit event could not be recorded.');
    });
    const safeAccent = /^#[0-9a-fA-F]{3,8}$/.test(template.accentColor) ? template.accentColor : '#2563eb';
    win.document.write(`
      <html>
        <head>
          <title>NSTP Student Profile - ${escapeHtml(fullName)}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
            .sheet { border: 1px solid #cbd5e1; padding: 28px; max-width: 820px; margin: auto; }
            .header { text-align: center; border-bottom: 3px solid ${safeAccent}; padding-bottom: 16px; margin-bottom: 24px; }
            .header-image { display: block; width: 100%; max-height: 94px; object-fit: contain; margin-bottom: 12px; }
            .header h1 { font-size: 18px; margin: 4px 0; letter-spacing: 0.08em; }
            .header p { margin: 2px 0; font-size: 12px; }
            h2 { font-size: 20px; text-align: center; margin: 16px 0 24px; }
            table { width: 100%; border-collapse: collapse; }
            td { border: 1px solid #cbd5e1; padding: 11px 12px; font-size: 13px; }
            td:first-child { width: 34%; font-weight: 700; background: #f8fafc; }
            .compact .sheet { padding: 20px; }
            .compact td { padding: 8px 10px; font-size: 12px; }
            .formal .sheet { border: 0; padding: 36px; }
            .formal .header { border-bottom-width: 1px; }
            .copies { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 22px; }
            .signature { margin-top: 42px; display: flex; justify-content: space-between; gap: 30px; font-size: 12px; }
            .line { border-top: 1px solid #111827; padding-top: 6px; text-align: center; flex: 1; }
            @media print { body { margin: 12mm; } .no-print { display: none; } .sheet { border: 0; padding: 0; } }
          </style>
        </head>
        <body class="${layoutClass}">
          <button class="no-print" onclick="window.print()" style="margin-bottom:16px;padding:10px 16px;border-radius:10px;border:1px solid ${safeAccent};background:${safeAccent};color:white;font-weight:700;">Print official profile</button>
          <div class="sheet">
            <div class="header">
              ${template.headerImageDataUrl ? `<img class="header-image" src="${template.headerImageDataUrl}" alt="Document header" />` : `
                <p>${escapeHtml(template.republicLine)}</p>
                <h1>${escapeHtml(template.schoolName)}</h1>
                <p>${escapeHtml(template.certificationLine)}</p>
                <p>${escapeHtml(template.officeName)}</p>
              `}
            </div>
            <h2>${escapeHtml(template.formTitle)}<br/><span style="font-size:13px;font-weight:400;">${escapeHtml(template.academicPeriod)}</span></h2>
            <table>${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(String(value || ''))}</td></tr>`).join('')}</table>
            <div class="copies">
              <strong>${escapeHtml(template.leftCopyLabel)}</strong>
              <strong>${escapeHtml(template.rightCopyLabel)}</strong>
            </div>
            <div class="signature">
              <div class="line">${escapeHtml(template.studentSignatureLabel)}</div>
              <div class="line">${escapeHtml(template.signatoryName)}<br/>${escapeHtml(template.signatoryTitle)}</div>
            </div>
          </div>
        </body>
      </html>
    `);
    win.document.close();
  };

  const exportOfficialProfilePdf = async (profile: Partial<PendingStudentRegistration & NstpStudent>) => {
    try {
      await recordProfileExport(String(profile.id || profile.studentId || 'unknown'), 'PDF');
    } catch {
      toast.error('The PDF export audit event could not be recorded.');
    }
    const [jspdfModule, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const JsPDF = jspdfModule.default;
    const autoTable = autoTableModule.default;
    const template = activeProfileTemplate?.configuration || DEFAULT_FORM_TEMPLATE;
    const doc = new JsPDF({ unit: 'pt', format: template.pageSize || 'a4', orientation: template.orientation || 'portrait' });
    const fullName = profile.name || [profile.firstName, profile.middleName, profile.surname].filter(Boolean).join(' ');
    const accentRgb = hexToRgb(template.accentColor);
    const topY = template.layout === 'compact' ? 34 : template.layout === 'formal' ? 52 : 42;
    const hasHeaderImage = Boolean(template.headerImageDataUrl);
    const tableY = hasHeaderImage ? 196 : template.layout === 'compact' ? 166 : template.layout === 'formal' ? 210 : 184;
    const tablePadding = template.layout === 'compact' ? 5 : 8;

    if (template.headerImageDataUrl) {
      doc.addImage(template.headerImageDataUrl, getImageTypeFromDataUrl(template.headerImageDataUrl), 48, topY - 8, 499, 78);
    } else {
      doc.setFontSize(10);
      doc.text(template.republicLine, 306, topY, { align: 'center' });
      doc.setFontSize(13);
      doc.text(template.schoolName, 306, topY + 18, { align: 'center' });
      doc.setFontSize(9);
      doc.text(template.certificationLine, 306, topY + 34, { align: 'center' });
      doc.text(template.officeName, 306, topY + 49, { align: 'center' });
    }
    doc.setDrawColor(...accentRgb);
    doc.setLineWidth(template.layout === 'formal' ? 1 : 2);
    doc.line(48, topY + 62, 547, topY + 62);
    doc.setFontSize(16);
    doc.text(template.formTitle, 306, topY + 94, { align: 'center' });
    doc.setFontSize(10);
    doc.text(template.academicPeriod, 306, topY + 112, { align: 'center' });

    autoTable(doc, {
      startY: tableY,
      head: [[template.fieldHeader, template.valueHeader]],
      body: getOfficialProfileRows(profile, template),
      styles: { fontSize: template.layout === 'compact' ? 9 : 10, cellPadding: tablePadding },
      headStyles: { fillColor: accentRgb },
      theme: template.showFieldBorders ? 'grid' : 'plain',
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 160 }, 1: { cellWidth: 330 } },
    });

    const finalY = ((doc as any).lastAutoTable?.finalY || 520) + (template.signatureSpacing || 48);
    doc.setFontSize(9);
    doc.line(70, finalY, 245, finalY);
    doc.text(template.studentSignatureLabel, 157, finalY + 14, { align: 'center' });
    doc.line(330, finalY, 525, finalY);
    doc.text(template.signatoryName, 427, finalY + 14, { align: 'center' });
    doc.text(template.signatoryTitle, 427, finalY + 28, { align: 'center' });
    doc.save(getProfileFileName({ ...profile, name: fullName }, 'pdf'));
  };

  const exportOfficialProfileDocx = async (profile: Partial<PendingStudentRegistration & NstpStudent>) => {
    try {
      await recordProfileExport(String(profile.id || profile.studentId || 'unknown'), 'DOCX');
    } catch {
      toast.error('The DOCX export audit event could not be recorded.');
    }
    const docx = await import('docx');
    const { AlignmentType, Document, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = docx;
    const template = activeProfileTemplate?.configuration || DEFAULT_FORM_TEMPLATE;
    const rows = getOfficialProfileRows(profile, template);
    const fullName = profile.name || [profile.firstName, profile.middleName, profile.surname].filter(Boolean).join(' ');
    const titleSize = template.layout === 'compact' ? 28 : 32;
    const afterHeader = template.layout === 'compact' ? 160 : template.layout === 'formal' ? 360 : 260;
    const headerNodes = template.headerImageDataUrl
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 220 },
            children: [
              new ImageRun({
                type: 'png',
                data: dataUrlToUint8Array(template.headerImageDataUrl),
                transformation: { width: 620, height: 96 },
              }),
            ],
          }),
        ]
      : [
          new Paragraph({ text: template.republicLine, alignment: AlignmentType.CENTER }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: template.schoolName, bold: true })] }),
          new Paragraph({ text: template.certificationLine, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: template.officeName, alignment: AlignmentType.CENTER, spacing: { after: afterHeader } }),
        ];
    const profileDocument = new Document({
      sections: [{
        children: [
          ...headerNodes,
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: template.formTitle, bold: true, size: titleSize })] }),
          new Paragraph({ text: template.academicPeriod, alignment: AlignmentType.CENTER, spacing: { after: afterHeader } }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ width: { size: 32, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: template.fieldHeader, bold: true })] })] }),
                  new TableCell({ width: { size: 68, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: template.valueHeader, bold: true })] })] }),
                ],
              }),
              ...rows.map(([label, value]) => new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })] }),
                  new TableCell({ children: [new Paragraph(String(value || ''))] }),
                ],
              })),
            ],
          }),
          new Paragraph({ text: '', spacing: { after: 600 } }),
          new Paragraph({ text: '______________________________                         ______________________________', alignment: AlignmentType.CENTER }),
          new Paragraph({ text: `${template.studentSignatureLabel}                              ${template.signatoryName}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: template.signatoryTitle, alignment: AlignmentType.RIGHT }),
        ],
      }],
    });
    const blob = await Packer.toBlob(profileDocument);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = getProfileFileName({ ...profile, name: fullName }, 'docx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const schoolYearStudents = useMemo(() => students.filter((student) => getStudentSchoolYear(student) === schoolYear), [students, schoolYear]);
  const totalStudents = schoolYearStudents.length;
  const avgProgress = totalStudents === 0 ? 0 : Math.round(schoolYearStudents.reduce((acc, s) => acc + s.progress, 0) / totalStudents);
  const completionRate = totalStudents === 0 ? 0 : Math.round((schoolYearStudents.filter(s => s.progress === 100).length / totalStudents) * 100);

  const componentCounts: Record<string, number> = useMemo(() => ({
    'CWTS': schoolYearStudents.filter((s) => s.component === 'CWTS').length,
    'CWTS (Coast Guard)': schoolYearStudents.filter((s) => s.component === 'CWTS (Coast Guard)').length,
    'LTS': schoolYearStudents.filter((s) => s.component === 'LTS').length,
    'MTS (Army)': schoolYearStudents.filter((s) => s.component === 'MTS (Army)').length,
    'MTS (Navy)': schoolYearStudents.filter((s) => s.component === 'MTS (Navy)').length,
  }), [schoolYearStudents]);

  const filteredStudents = schoolYearStudents.filter((student) => {
    const matchesFilter = filter === 'all' || student.component === filter;
    const matchesSearch = student.name.toLowerCase().includes(search.toLowerCase()) ||
      student.email.toLowerCase().includes(search.toLowerCase()) ||
      student.status.toLowerCase().includes(search.toLowerCase()) ||
      (student.studentId || '').toLowerCase().includes(search.toLowerCase()) ||
      (student.school || '').toLowerCase().includes(search.toLowerCase()) ||
      (student.degreeProgram || '').toLowerCase().includes(search.toLowerCase()) ||
      (student.municipality || '').toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  }).sort((a, b) => {
    if (sortBy === 'progress-high') return b.progress - a.progress;
    if (sortBy === 'progress-low') return a.progress - b.progress;
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'status') return a.status.localeCompare(b.status);
    return a.progress - b.progress;
  });

  const studentTotalPages = Math.max(1, Math.ceil(filteredStudents.length / studentsPerPage));
  const visibleStudentPage = Math.min(studentPage, studentTotalPages);
  const paginatedStudents = filteredStudents.slice((visibleStudentPage - 1) * studentsPerPage, visibleStudentPage * studentsPerPage);
  const studentPageStart = filteredStudents.length === 0 ? 0 : (visibleStudentPage - 1) * studentsPerPage + 1;
  const studentPageEnd = Math.min(filteredStudents.length, visibleStudentPage * studentsPerPage);

  useEffect(() => {
    setStudentPage(1);
  }, [search, filter, sortBy, schoolYear, studentsPerPage]);

  const studentsNeedingSupport = schoolYearStudents.filter((s) => s.progress < 70).length;
  const selectedStudents = students.filter((student) => selectedStudentIds.includes(student.id));
  const studentDetail = students.find((student) => student.id === studentDetailId) || null;
  const topPerformer = [...schoolYearStudents].sort((a, b) => b.progress - a.progress)[0];
  const spotlightStudent = schoolYearStudents.find((student) => student.id === spotlightStudentId) || topPerformer || schoolYearStudents[0] || null;
  const highRiskStudents = schoolYearStudents.filter((student) => student.progress < 70).slice(0, 5);
  const moduleCompletionAvg = modules.length > 0
    ? Math.round(modules.reduce((accumulator, module) => {
      const completed = schoolYearStudents.reduce((count, student) => {
        const saved = localStorage.getItem(`progress-${student.id}`);
        if (!saved) return count;
        const parsed = safeJsonParse<Record<string, boolean>>(saved, {});
        return count + (parsed[module.id] ? 100 : 0);
      }, 0);
      return accumulator + (schoolYearStudents.length > 0 ? Math.round(completed / schoolYearStudents.length) : 0);
    }, 0) / modules.length)
    : 0;
  const statusCounts = schoolYearStudents.reduce((counts, student) => {
    counts[student.status] += 1;
    return counts;
  }, emptyLookup());

  const filteredAuditLog = useMemo(() => {
    const query = auditSearch.trim().toLowerCase();
    if (!query) return auditLog;
    return auditLog.filter((entry) =>
      entry.action.toLowerCase().includes(query) ||
      entry.detail.toLowerCase().includes(query) ||
      entry.actor.toLowerCase().includes(query)
    );
  }, [auditLog, auditSearch]);

  const componentChartData = useMemo(() => (Object.entries(componentCounts).map(([name, value]) => ({ name, value }))), [componentCounts]);

  const statusChartData = useMemo(() => ([
    { name: 'Active', value: statusCounts.active },
    { name: 'Pending', value: statusCounts.pending },
    { name: 'Graduated', value: statusCounts.graduated },
  ]), [statusCounts]);

  const progressBandData = useMemo(() => ([
    { band: '0-49', students: schoolYearStudents.filter((student) => student.progress < 50).length },
    { band: '50-69', students: schoolYearStudents.filter((student) => student.progress >= 50 && student.progress < 70).length },
    { band: '70-89', students: schoolYearStudents.filter((student) => student.progress >= 70 && student.progress < 90).length },
    { band: '90-100', students: schoolYearStudents.filter((student) => student.progress >= 90).length },
  ]), [schoolYearStudents]);

  const progressTrendData = useMemo(() => {
    return BILIRAN_MUNICIPALITIES.map((municipality) => {
      const rows = schoolYearStudents.filter((student) => (student.assignedMunicipality || student.municipality) === municipality);
      const averageProgress = rows.length ? Math.round(rows.reduce((sum, student) => sum + student.progress, 0) / rows.length) : 0;
      const averageAssessments = rows.length ? Math.round(rows.reduce((sum, student) => sum + student.assessments, 0) / rows.length) : 0;
      return { name: municipality, progress: averageProgress, assessments: averageAssessments, students: rows.length };
    }).filter((row) => row.students > 0);
  }, [schoolYearStudents]);

  const municipalityStats = useMemo(() => (
    BILIRAN_MUNICIPALITIES.map((municipality) => ({
      municipality,
      facilitators: facilitatorAccounts.filter((account) => account.municipalities?.includes(municipality)).length,
      students: schoolYearStudents.filter((student) => (student.assignedMunicipality || student.municipality) === municipality).length,
    })).sort((a, b) => b.students - a.students)
  ), [facilitatorAccounts, schoolYearStudents]);

  const facilitatorLoadData = useMemo(() => (
    facilitatorAccounts.map((facilitator) => ({
      name: facilitator.name.split(' ').slice(-1)[0] || facilitator.name,
      students: schoolYearStudents.filter((student) => student.facilitatorId === facilitator.id || facilitator.municipalities?.includes(student.assignedMunicipality || student.municipality || 'Naval')).length,
      municipalities: facilitator.municipalities?.length || 0,
    })).sort((a, b) => b.students - a.students).slice(0, 8)
  ), [facilitatorAccounts, schoolYearStudents]);

  const municipalityAssignmentRows = useMemo(() => (
    BILIRAN_MUNICIPALITIES.map((municipality) => {
      const assigned = facilitatorAccounts.filter((account) => account.municipalities?.includes(municipality));
      const studentCount = schoolYearStudents.filter((student) => student.municipality === municipality).length;
      const status = assigned.length === 0 ? 'unassigned' : assigned.length === 1 ? 'partial' : 'assigned';
      return { municipality, assigned, studentCount, status };
    })
      .filter((row) => row.municipality.toLowerCase().includes(municipalitySearch.toLowerCase()))
      .filter((row) => municipalityStatusFilter === 'all' || row.status === municipalityStatusFilter)
      .sort((a, b) => {
        if (municipalitySort === 'students') return b.studentCount - a.studentCount;
        if (municipalitySort === 'facilitators') return b.assigned.length - a.assigned.length;
        return a.municipality.localeCompare(b.municipality);
      })
  ), [facilitatorAccounts, municipalitySearch, municipalitySort, municipalityStatusFilter, schoolYearStudents]);

  const municipalityOverviewRows = useMemo(() => {
    const total = BILIRAN_MUNICIPALITIES.length;
    const assigned = municipalityAssignmentRows.filter((row) => row.status === 'assigned').length;
    const partial = municipalityAssignmentRows.filter((row) => row.status === 'partial').length;
    const unassigned = municipalityAssignmentRows.filter((row) => row.status === 'unassigned').length;
    return [
      { name: 'Assigned', value: assigned, color: '#10b981', percent: total ? Math.round((assigned / total) * 100) : 0 },
      { name: 'Partial', value: partial, color: '#2563eb', percent: total ? Math.round((partial / total) * 100) : 0 },
      { name: 'Unassigned', value: unassigned, color: '#f59e0b', percent: total ? Math.round((unassigned / total) * 100) : 0 },
    ];
  }, [municipalityAssignmentRows]);

  const facilitatorOverviewData = useMemo(() => {
    const rows = [
      { name: 'Active', value: facilitatorAccounts.length, color: '#10b981' },
      { name: 'Inactive', value: 0, color: '#2563eb' },
      { name: 'Pending', value: 0, color: '#f59e0b' },
      { name: 'On Leave', value: 0, color: '#8b5cf6' },
    ];
    const visibleRows = rows.filter((row) => row.value > 0 || row.name === 'Active');
    const total = visibleRows.reduce((sum, row) => sum + row.value, 0);
    return visibleRows.map((row) => ({
      ...row,
      percent: total > 0 ? Math.round((row.value / total) * 1000) / 10 : 0,
    }));
  }, [facilitatorAccounts.length]);

  const sparklineData = useMemo(() => progressTrendData.length ? progressTrendData : [
    { name: 'W1', progress: 40, assessments: 1 },
    { name: 'W2', progress: 54, assessments: 2 },
    { name: 'W3', progress: 49, assessments: 3 },
    { name: 'W4', progress: 68, assessments: 4 },
  ], [progressTrendData]);

  const currentUserQuery = useCurrentUser();
  const adminProfile = currentUserQuery?.data?.data || null;
  const adminInitials = adminProfile?.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || 'AD';
  const adminDisplayName = adminProfile?.data?.title || adminProfile?.name || 'Dr. Reynold G. Bustillo';
  const adminDisplayRole = adminProfile?.data?.subtitle || 'NSTP Director';

  const updateFacilitatorMunicipality = async (facilitatorId: string, municipality: BiliranMunicipality, checked: boolean) => {
    const facilitator = serverAccounts.find((account) => account.id === facilitatorId);
    if (!facilitator || facilitator.role !== 'facilitator') return;
    const currentMunicipalities = facilitator.municipalities || [];
    if (checked && currentMunicipalities.length >= 3) return;
    const nextMunicipalities = checked
      ? Array.from(new Set([...currentMunicipalities, municipality]))
      : currentMunicipalities.filter((item) => item !== municipality);
    const updated = { ...facilitator, municipalities: nextMunicipalities };
    try {
      await upsertAccountMutation.mutateAsync(updated);
      setAccountVersion((version) => version + 1);
      logAudit('Updated municipality assignment', `${municipality} ${checked ? 'assigned to' : 'removed from'} facilitator account`);
      toast.success('Facilitator municipality updated.');
    } catch {
      toast.error('Failed to update facilitator municipality.');
    }
  };

  const setTheme = () => {
    const nextTheme = adminTheme === 'dark' ? 'light' : 'dark';
    setAdminTheme(nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    localStorage.setItem('nstp-theme', nextTheme);
  };

  const runAdminSearch = () => {
    const query = adminSearch.trim().toLowerCase();
    if (!query) return;
    if (query.includes('facilitator') || query.includes('teacher')) setView('facilitators');
    else if (query.includes('municip')) setView('municipalities');
    else if (query.includes('enroll') || query.includes('approval') || query.includes('request')) setView('enrollment');
    else if (query.includes('student') || query.includes('roster')) setView('students');
    else if (query.includes('module')) setView('modules');
    else if (query.includes('assessment') || query.includes('exam')) setView('assessments');
    else if (query.includes('grade') || query.includes('assign')) setView('assignments');
    else if (query.includes('report') || query.includes('analytic')) setView('tools');
    else if (query.includes('setting') || query.includes('system')) setView('settings');
  };

  const openQuickAction = (action: 'facilitator' | 'municipality' | 'enrollment' | 'reports') => {
    if (action === 'facilitator') setView('facilitators');
    if (action === 'municipality') setView('municipalities');
    if (action === 'enrollment') setView('enrollment');
    if (action === 'reports') setView('tools');
  };

  const updateStudent = async (studentId: string, patch: Partial<NstpStudent>) => {
    const prevStudents = students;
    const nextStudents = students.map((student) => (student.id === studentId ? { ...student, ...patch, updatedAt: new Date().toISOString() } : student));
    setStudents(nextStudents);

    try {
      await patchStudentMutation.mutateAsync({ id: studentId, patch });
      const updatedStudent = nextStudents.find((student) => student.id === studentId);
      const assignedComponent = updatedStudent?.component ?? null;
      if (updatedStudent?.status === 'active' && assignedComponent) {
        logAudit('Component assigned', `${updatedStudent.name} assigned to ${assignedComponent}`);
      }
      toast.success('Student updated.');
    } catch (error) {
      setStudents(prevStudents);
      toast.error('Failed to update student record.');
    }
  };

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds((current) => current.includes(studentId)
      ? current.filter((id) => id !== studentId)
      : [...current, studentId]);
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = filteredStudents.map((student) => student.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedStudentIds.includes(id));

    if (allVisibleSelected) {
      setSelectedStudentIds((current) => current.filter((id) => !visibleIds.includes(id)));
      return;
    }

    setSelectedStudentIds((current) => Array.from(new Set([...current, ...visibleIds])));
  };

  const applyBulkPatch = async (patch: Partial<NstpStudent>) => {
    if (selectedStudentIds.length === 0) return;
    const nextStudents = students.map((student) => {
      if (!selectedStudentIds.includes(student.id)) return student;
      return { ...student, ...patch, updatedAt: new Date().toISOString() };
    });
    setStudents(nextStudents);
    try {
      await Promise.all(selectedStudentIds.map((id) => patchStudentMutation.mutateAsync({ id, patch })));
      logAudit('Bulk student update', `${selectedStudentIds.length} selected records updated`);
      toast.success(`${selectedStudentIds.length} records updated.`);
    } catch {
      toast.error('Failed to apply bulk update.');
      refetchStudents();
    }
  };

  const applyBulkProgressDelta = async (delta: number) => {
    if (selectedStudentIds.length === 0) return;
    const nextStudents = students.map((student) => {
      if (!selectedStudentIds.includes(student.id)) return student;
      const nextProgress = Math.max(0, Math.min(100, student.progress + delta));
      const nextStatus: NstpStudent['status'] = nextProgress === 100 ? 'graduated' : nextProgress >= 70 ? 'active' : 'pending';
      return {
        ...student,
        progress: nextProgress,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      };
    });
    setStudents(nextStudents);
    try {
      await Promise.all(
        nextStudents
          .filter((s) => selectedStudentIds.includes(s.id))
          .map((s) => patchStudentMutation.mutateAsync({ id: s.id, patch: { progress: s.progress, status: s.status } }))
      );
      logAudit('Bulk progress adjustment', `${selectedStudentIds.length} records changed by ${delta}`);
      toast.success('Progress adjusted.');
    } catch {
      toast.error('Failed to adjust progress.');
      refetchStudents();
    }
  };

  const exportStudentsCsv = (rows: NstpStudent[]) => {
    const header = ['id', 'studentId', 'surname', 'firstName', 'middleName', 'name', 'email', 'school', 'degreeProgram', 'municipality', 'contactNumber', 'component', 'progress', 'assessments', 'status', 'notes', 'updatedAt'];
    const csvRows = rows.map((row) => [
      row.id,
      row.studentId || '',
      row.surname || '',
      row.firstName || '',
      row.middleName || '',
      row.name,
      row.email,
      row.school || '',
      row.degreeProgram || '',
      row.municipality || '',
      row.contactNumber || '',
      row.component,
      String(row.progress),
      String(row.assessments),
      row.status,
      row.notes.replace(/\n/g, ' '),
      row.updatedAt,
    ]);

    const csv = toCsv(header, csvRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nstp-students-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    logAudit('Exported student CSV', `${rows.length} rows exported`);
  };

  const exportComplianceSnapshot = () => {
    const snapshot = {
      generatedAt: new Date().toISOString(),
      totals: {
        students: totalStudents,
        active: statusCounts.active,
        pending: statusCounts.pending,
        graduated: statusCounts.graduated,
      },
      performance: {
        averageProgress: avgProgress,
        completionRate,
        atRiskCount: studentsNeedingSupport,
        moduleCompletionAverage: moduleCompletionAvg,
      },
      componentDistribution: componentCounts,
      topPerformer: topPerformer
        ? {
          id: topPerformer.id,
          name: topPerformer.name,
          component: topPerformer.component,
          progress: topPerformer.progress,
        }
        : null,
      highRiskStudents: highRiskStudents.map((student) => ({
        id: student.id,
        name: student.name,
        email: student.email,
        component: student.component,
        progress: student.progress,
        status: student.status,
      })),
    };

    const json = JSON.stringify(snapshot, null, 2);
    downloadTextFile(`nstp-compliance-snapshot-${new Date().toISOString().slice(0, 10)}.json`, json, 'application/json;charset=utf-8;');
    logAudit('Exported compliance snapshot', `Snapshot generated for ${totalStudents} students`);
  };

  const bumpProgress = (studentId: string, delta: number) => {
    const student = students.find((item) => item.id === studentId);
    if (!student) return;
    const nextProgress = Math.max(0, Math.min(100, student.progress + delta));
    updateStudent(studentId, { progress: nextProgress, status: nextProgress === 100 ? 'graduated' : nextProgress >= 70 ? 'active' : 'pending' });
  };

  const assignSpotlightComponent = (component: NstpStudent['component']) => {
    if (!spotlightStudent) return;
    updateStudent(spotlightStudent.id, { component });
  };

  // `null` is accepted so an administrator can clear an assignment (component)
  // instead of the form silently keeping a stale or guessed value.
  const updateForm = (field: keyof NstpStudent, value: string | number | null) => {
    if (!studentForm) return;
    setStudentForm({ ...studentForm, [field]: value });
  };

  if (false && view === 'assignments') {
    return (
      <div className="size-full flex flex-col bg-[#fcfaf6] dark:bg-slate-950">
        <div className="bg-white border-b border-slate-200 px-8 py-4 dark:border-slate-800 dark:bg-slate-900">
          <button
            onClick={() => setView('overview')}
            className="text-blue-700 hover:text-blue-800 font-medium dark:text-blue-300 dark:hover:text-blue-200"
          >
            ← Back to Dashboard
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          <ComponentAssignment />
        </div>
      </div>
    );
  }

  if (false && view === 'tools') {
    return (
      <div className="size-full overflow-auto bg-[#fcfaf6] dark:bg-slate-950">
        <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] font-semibold text-blue-700 dark:text-blue-300">Admin Reports</p>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Analytics and Data Visualizations</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Decision-ready insights for enrollment, progress, and completion.</p>
            </div>
            <button
              onClick={() => setView('overview')}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Back to Overview
            </button>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Total students</p>
              <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-slate-100">{students.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Average progress</p>
              <p className="mt-1 text-3xl font-bold text-blue-700 dark:text-blue-300">{avgProgress}%</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Completion rate</p>
              <p className="mt-1 text-3xl font-bold text-emerald-600 dark:text-emerald-300">{completionRate}%</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Module completion avg</p>
              <p className="mt-1 text-3xl font-bold text-amber-600 dark:text-amber-300">{moduleCompletionAvg}%</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Status Distribution</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <BarChart data={statusChartData}>
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
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Component Distribution</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <PieChart>
                    <Pie data={componentChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={84} label>
                      {componentChartData.map((entry, index) => {
                        const palette = ['#2563eb', '#f59e0b', '#10b981', '#ef4444'];
                        return <Cell key={`component-${entry.name}`} fill={palette[index % palette.length]} />;
                      })}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Progress Bands</h3>
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
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Cohort Trend Snapshot</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <LineChart data={progressTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" />
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

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Report Insights</h3>
              <div className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
                <p>Top performer: <strong>{topPerformer?.name || 'N/A'}</strong> at <strong>{topPerformer?.progress || 0}%</strong>.</p>
                <p>At-risk cohort: <strong>{studentsNeedingSupport}</strong> students below 70% progress.</p>
                <p>Pending registration approvals: <strong>{pendingRegistrations.length}</strong>.</p>
                <p>Latest audit entries captured: <strong>{auditLog.length}</strong>.</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Export Reports</h3>
              <div className="grid sm:grid-cols-2 gap-2">
                <button
                  onClick={() => exportStudentsCsv(students)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Export full roster CSV
                </button>
                <button
                  onClick={() => exportStudentsCsv(filteredStudents)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Export filtered CSV
                </button>
                <button
                  onClick={exportComplianceSnapshot}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Export compliance JSON
                </button>
                <button
                  onClick={exportAuditLogCsv}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  disabled={auditLog.length === 0}
                >
                  Export audit log CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderExportLayoutView = () => (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-slate-800 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700 dark:text-blue-300">System Settings / Student Profile Layout</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">Student Profile Layout</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Create a draft, preview it, and publish a version used by official PDF, DOCX, and print exports.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 font-semibold ${profileTemplateDirty ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{profileTemplateDirty ? 'Unsaved changes' : 'Saved'}</span>
            <span className="text-slate-500">Active version: {activeProfileTemplate ? `v${activeProfileTemplate.version}` : 'Default layout'}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setPdfPreviewOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
            <Eye className="h-4 w-4" />
            Preview PDF
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
            <FileUp className="h-4 w-4" />
            Restore Layout Backup
            <input type="file" accept="application/json,.json" onChange={importFormTemplate} className="hidden" />
          </label>
          <button onClick={exportFormTemplate} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
            <FileDown className="h-4 w-4" />
            Download Layout Backup
          </button>
          <button onClick={resetProfileLayout} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            Restore Default Layout
          </button>
          <button onClick={saveProfileLayoutDraft} disabled={profileTemplateSaving || !profileTemplateDirty} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950 dark:text-blue-200">
            <Save className="h-4 w-4" />
            Save Draft
          </button>
          <button onClick={saveAndPublishProfileLayout} disabled={profileTemplateSaving} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-900/20 hover:bg-blue-800 disabled:opacity-50">
            {profileTemplateSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
            Save and Publish Layout
          </button>
        </div>
      </div>

      {profileTemplateError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{profileTemplateError}</div>}

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 lg:grid-cols-[minmax(240px,0.65fr)_minmax(0,1.35fr)]">
        <label className="space-y-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <span>Layout name</span>
          <input value={profileTemplateName} maxLength={120} onChange={(event) => { setProfileTemplateName(event.target.value); setProfileTemplateDirty(true); }} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900" />
        </label>
        <div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Published version history</p>
          <div className="mt-2 flex max-h-28 flex-wrap gap-2 overflow-auto">
            {profileTemplateVersions.filter((version) => version.status === 'PUBLISHED').map((version) => (
              <button key={version.id} type="button" onClick={() => restoreProfileTemplateVersion(version)} disabled={version.isActive || profileTemplateSaving} className="rounded-xl border border-slate-200 px-3 py-2 text-left text-xs disabled:cursor-default disabled:bg-emerald-50 disabled:text-emerald-700 dark:border-slate-700">
                <strong>v{version.version}</strong> · {version.name}{version.isActive ? ' · Active' : ' · Restore'}
              </button>
            ))}
            {profileTemplateVersions.every((version) => version.status !== 'PUBLISHED') && <span className="text-xs text-slate-500">No published versions yet.</span>}
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[18rem_minmax(820px,1fr)] 2xl:grid-cols-[20rem_minmax(980px,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <p className="font-semibold text-slate-950 dark:text-white">Drag & Drop Fields</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Drag fields to the document area.</p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Student Information</p>
          <div className="mt-3 max-h-[38rem] space-y-2 overflow-auto pr-1">
            {getTemplateFieldOrder().map((fieldKey, index) => (
              <div
                key={fieldKey}
                draggable
                onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  moveTemplateField(Number(event.dataTransfer.getData('text/plain')), index);
                }}
                className="flex cursor-grab items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 active:cursor-grabbing dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <GripVertical className="h-4 w-4 text-slate-400" />
                <span className="min-w-0 flex-1 truncate">{getProfileFieldLabel(fieldKey)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
            Tip: drag fields to reorder the PDF table.
          </div>
        </aside>

        <main className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950 dark:text-white">Document Header</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Upload a header file that will appear at the top of every page.</p>
              </div>
              {formTemplate.headerImageDataUrl && (
                <button onClick={() => { setFormTemplate((current) => ({ ...current, headerImageDataUrl: undefined, headerImageName: undefined })); setProfileTemplateDirty(true); }} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-200">
                  <Trash2 className="inline h-4 w-4" />
                </button>
              )}
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-dashed border-blue-300 bg-slate-50 p-3 text-sm text-slate-700 hover:bg-blue-50 dark:border-blue-500/30 dark:bg-slate-900 dark:text-slate-200">
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-blue-700 shadow-sm dark:bg-blue-500/10 dark:text-blue-200"><FileUp className="h-5 w-5" /></span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{formTemplate.headerImageName || 'Upload header_nstp_official.png'}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">PNG or JPG, used in print and exports</span>
                </span>
              </span>
              <span className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-blue-700 shadow-sm dark:bg-slate-950 dark:text-blue-200">Change File</span>
              <input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={handleHeaderFileUpload} className="hidden" />
            </label>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="rounded-2xl border border-dashed border-blue-300 bg-white p-5 dark:border-blue-500/30 dark:bg-slate-900">
              <div className="relative rounded-xl border border-blue-100 p-5 dark:border-blue-500/20">
                <GripVertical className="absolute left-1/2 top-1 h-5 w-5 -translate-x-1/2 rounded bg-blue-50 p-1 text-blue-600 dark:bg-blue-500/10 dark:text-blue-200" />
                <div className="border-b pb-3 text-center dark:border-slate-800" style={{ borderColor: formTemplate.accentColor }}>
                  {formTemplate.headerImageDataUrl ? (
                    <img src={formTemplate.headerImageDataUrl} alt="Document header preview" className="mx-auto max-h-28 w-full rounded-xl object-contain" />
                  ) : (
                    <>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{formTemplate.republicLine}</p>
                      <p className="mt-1 text-base font-semibold uppercase tracking-[0.08em] text-slate-950 dark:text-white">{formTemplate.schoolName}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{formTemplate.certificationLine}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{formTemplate.officeName}</p>
                    </>
                  )}
                </div>
                <div className="py-4 text-center">
                  <p className="text-2xl font-semibold text-slate-950 dark:text-white">{formTemplate.formTitle}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{formTemplate.academicPeriod}</p>
                </div>
                <div className={`mx-auto max-w-4xl overflow-hidden rounded-xl text-sm ${formTemplate.showFieldBorders ? 'border border-slate-200 dark:border-slate-800' : ''}`}>
                  <div className="grid grid-cols-[0.38fr_0.62fr] text-white" style={{ backgroundColor: formTemplate.accentColor }}>
                    <span className="p-3 font-semibold">{formTemplate.fieldHeader}</span>
                    <span className="p-3 font-semibold">{formTemplate.valueHeader}</span>
                  </div>
                  {getTemplateFieldOrder().slice(0, 10).map((fieldKey) => (
                    <div key={fieldKey} className={`grid grid-cols-[0.38fr_0.62fr] ${formTemplate.showFieldBorders ? 'border-t border-slate-200 dark:border-slate-800' : ''}`}>
                      <span className="bg-slate-50 p-3 font-semibold dark:bg-slate-950">{getProfileFieldLabel(fieldKey)}</span>
                      <span className="p-3 text-slate-500 dark:text-slate-400">Student data</span>
                    </div>
                  ))}
                </div>
                <div
                  draggable
                  onDragStart={(event) => setLayoutDragStartY(event.clientY)}
                  onDragEnd={(event) => {
                    if (layoutDragStartY === null) return;
                    const nextSpacing = Math.max(20, Math.min(160, (formTemplate.signatureSpacing || 48) + event.clientY - layoutDragStartY));
                    updateFormTemplate('signatureSpacing', nextSpacing);
                    setLayoutDragStartY(null);
                  }}
                  className="mx-auto my-3 flex cursor-ns-resize items-center justify-center gap-2 rounded-xl border border-dashed border-blue-200 bg-blue-50/60 px-3 py-2 text-xs font-semibold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200"
                  style={{ height: `${Math.max(24, Math.min(88, formTemplate.signatureSpacing || 48))}px` }}
                  title="Drag up or down to adjust spacing before signatories"
                >
                  <GripVertical className="h-4 w-4" />
                  Drag spacing before signatories
                </div>
                <div className="grid grid-cols-2 gap-4 text-center text-xs text-slate-500 dark:text-slate-400">
                  <span className="border-t pt-2 dark:border-slate-800">{formTemplate.studentSignatureLabel}<br /><strong className="text-slate-800 dark:text-slate-100">Juan Dela Cruz</strong><br />STUDENT</span>
                  <span className="border-t pt-2 dark:border-slate-800"><strong className="text-slate-800 dark:text-slate-100">{formTemplate.signatoryName}</strong><br />{formTemplate.signatoryTitle}</span>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-center gap-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                <span>100%</span>
                <span>Drag to move</span>
                <span>Click settings to edit</span>
              </div>
            </div>
          </section>
        </main>

        {false && <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <p className="mb-4 font-semibold text-slate-950 dark:text-white">Template Settings</p>
          <div className="space-y-3">
            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>Page Size</span>
              <select value={formTemplate.pageSize || 'a4'} onChange={(event) => updateFormTemplate('pageSize', event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                <option value="a4">A4 (210 x 297 mm)</option>
                <option value="letter">Letter</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>Layout Style</span>
              <select value={formTemplate.layout} onChange={(event) => updateFormTemplate('layout', event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                <option value="classic">Classic boxed form</option>
                <option value="compact">Compact form</option>
                <option value="formal">Formal letterhead</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>Accent Color</span>
              <input type="color" value={formTemplate.accentColor} onChange={(event) => updateFormTemplate('accentColor', event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-950" />
            </label>
            {[
              ['formTitle', 'Form Title'],
              ['academicPeriod', 'Academic Period'],
              ['fieldHeader', 'Left Table Header'],
              ['valueHeader', 'Right Table Header'],
              ['studentSignatureLabel', 'Student Signature Label'],
              ['signatoryName', 'Signatory Name'],
              ['signatoryTitle', 'Signatory Title'],
            ].map(([field, label]) => (
              <label key={field} className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                <span>{label}</span>
                <input value={String(formTemplate[field as keyof OfficialProfileTemplate] || '')} onChange={(event) => updateFormTemplate(field as keyof OfficialProfileTemplate, event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
              </label>
            ))}
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <input type="checkbox" checked={formTemplate.showFieldBorders ?? true} onChange={(event) => updateFormTemplate('showFieldBorders', event.target.checked)} />
              Show field borders in preview
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <input type="checkbox" checked={formTemplate.repeatHeader ?? true} onChange={(event) => updateFormTemplate('repeatHeader', event.target.checked)} />
              Repeat header on each page
            </label>
          </div>
        </aside>}
      </div>

      <button onClick={() => setExportSettingsOpen(true)} className="fixed bottom-4 right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-2xl shadow-blue-900/30 transition hover:-translate-y-0.5 hover:bg-blue-800 max-sm:left-4 max-sm:w-auto sm:bottom-6 sm:right-6 sm:w-auto sm:px-5 lg:bottom-8 lg:right-8" title="Open student profile layout settings">
        <Settings className="h-5 w-5" />
        <span className="sr-only sm:not-sr-only sm:ml-2 sm:text-sm sm:font-semibold">Layout Settings</span>
      </button>

      {exportSettingsOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" onMouseDown={() => setExportSettingsOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="profile-layout-dialog-title" onMouseDown={(event) => event.stopPropagation()} className="max-h-[92dvh] w-full max-w-3xl overflow-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Student Profile Layout</p>
                <h3 id="profile-layout-dialog-title" className="text-2xl font-semibold text-slate-950 dark:text-white">Layout controls</h3>
              </div>
              <button onClick={() => setExportSettingsOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4">
              <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                <span>Page Size</span>
                <select value={formTemplate.pageSize || 'a4'} onChange={(event) => updateFormTemplate('pageSize', event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                  <option value="a4">A4 (210 x 297 mm)</option>
                  <option value="letter">Letter</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                <span>Layout Style</span>
                <select value={formTemplate.layout} onChange={(event) => updateFormTemplate('layout', event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                  <option value="classic">Classic boxed form</option>
                  <option value="compact">Compact form</option>
                  <option value="formal">Formal letterhead</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                <span>Accent Color</span>
                <input type="color" value={formTemplate.accentColor} onChange={(event) => updateFormTemplate('accentColor', event.target.value)} className="h-12 w-full rounded-xl border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-950" />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                <span>Space Before Signatories</span>
                <input type="range" min={20} max={160} value={formTemplate.signatureSpacing || 48} onChange={(event) => updateFormTemplate('signatureSpacing', Number(event.target.value))} className="w-full" />
                <span className="text-xs text-slate-500 dark:text-slate-400">{formTemplate.signatureSpacing || 48}px. You can also drag the spacer inside the preview.</span>
              </label>
              {[
                ['formTitle', 'Form Title'],
                ['academicPeriod', 'Academic Period'],
                ['fieldHeader', 'Left Table Header'],
                ['valueHeader', 'Right Table Header'],
                ['studentSignatureLabel', 'Student Signature Label'],
                ['signatoryName', 'Signatory Name'],
                ['signatoryTitle', 'Signatory Title'],
              ].map(([field, label]) => (
                <label key={field} className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  <span>{label}</span>
                  <input value={String(formTemplate[field as keyof OfficialProfileTemplate] || '')} onChange={(event) => updateFormTemplate(field as keyof OfficialProfileTemplate, event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
                </label>
              ))}
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <input type="checkbox" checked={formTemplate.showFieldBorders ?? true} onChange={(event) => updateFormTemplate('showFieldBorders', event.target.checked)} />
                Show field borders in preview
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <input type="checkbox" checked={formTemplate.repeatHeader ?? true} onChange={(event) => updateFormTemplate('repeatHeader', event.target.checked)} />
                Repeat header on each page
              </label>
              {profileTemplateError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">{profileTemplateError}</p>}
              <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white pt-4 dark:border-slate-800 dark:bg-slate-950">
                <button type="button" disabled={profileTemplateSaving || !profileTemplateDirty} onClick={saveProfileLayoutDraft} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200">
                  {profileTemplateSaving ? 'Saving…' : 'Save Draft'}
                </button>
                <button type="button" disabled={profileTemplateSaving} onClick={saveAndPublishProfileLayout} className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-blue-800">
                  {profileTemplateSaving ? 'Publishing…' : 'Save and Publish'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {pdfPreviewOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" onMouseDown={() => setPdfPreviewOpen(false)}>
          <div onMouseDown={(event) => event.stopPropagation()} className="max-h-[92dvh] w-full max-w-4xl overflow-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">PDF Preview</p>
                <h3 className="text-2xl font-semibold text-slate-950 dark:text-white">{formTemplate.formTitle}</h3>
              </div>
              <div className="flex gap-2">
                <button onClick={() => exportOfficialProfilePdf(students[0] || pendingRegistrations[0] || {})} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Download PDF</button>
                <button onClick={() => setPdfPreviewOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b pb-4 text-center" style={{ borderColor: formTemplate.accentColor }}>
                {formTemplate.headerImageDataUrl ? <img src={formTemplate.headerImageDataUrl} alt="Header preview" className="mx-auto max-h-28 w-full object-contain" /> : <><p className="text-xs text-slate-500">{formTemplate.republicLine}</p><p className="font-semibold tracking-[0.08em]">{formTemplate.schoolName}</p><p className="text-xs text-slate-500">{formTemplate.certificationLine}</p><p className="text-xs text-slate-500">{formTemplate.officeName}</p></>}
              </div>
              <div className="py-5 text-center"><p className="text-2xl font-semibold">{formTemplate.formTitle}</p><p className="text-sm text-slate-500">{formTemplate.academicPeriod}</p></div>
              <div className={`overflow-hidden rounded-xl text-sm ${formTemplate.showFieldBorders ? 'border border-slate-200 dark:border-slate-800' : ''}`}>
                <div className="grid grid-cols-[0.38fr_0.62fr] text-white" style={{ backgroundColor: formTemplate.accentColor }}><span className="p-3 font-semibold">{formTemplate.fieldHeader}</span><span className="p-3 font-semibold">{formTemplate.valueHeader}</span></div>
                {getOfficialProfileRows(students[0] || pendingRegistrations[0] || {}).map(([label, value]) => <div key={label} className={`grid grid-cols-[0.38fr_0.62fr] ${formTemplate.showFieldBorders ? 'border-t border-slate-200 dark:border-slate-800' : ''}`}><span className="bg-slate-50 p-3 font-semibold dark:bg-slate-950">{label}</span><span className="p-3 text-slate-600 dark:text-slate-300">{String(value || '')}</span></div>)}
              </div>
              <div style={{ height: `${formTemplate.signatureSpacing || 48}px` }} />
              <div className="grid grid-cols-2 gap-8 text-center text-xs text-slate-500 dark:text-slate-400"><span className="border-t pt-2 dark:border-slate-800">{formTemplate.studentSignatureLabel}<br /><strong className="text-slate-900 dark:text-white">Student Name</strong></span><span className="border-t pt-2 dark:border-slate-800"><strong className="text-slate-900 dark:text-white">{formTemplate.signatoryName}</strong><br />{formTemplate.signatoryTitle}</span></div>
            </div>
          </div>
        </div>
      )}

      {pendingHeaderCrop && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4" onMouseDown={() => setPendingHeaderCrop(null)}>
          <div onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-4xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Crop Header</p><h3 className="text-2xl font-semibold text-slate-950 dark:text-white">Select header area</h3><p className="text-sm text-slate-500 dark:text-slate-400">Adjust the crop box used in the exported document header.</p></div>
              <button onClick={() => setPendingHeaderCrop(null)} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 p-3 dark:border-slate-800 dark:bg-slate-900">
                <div
                  className="relative mx-auto aspect-[6.3/1] max-w-3xl overflow-hidden rounded-xl bg-white"
                  onPointerMove={(event) => {
                    if (!headerCropDrag) return;
                    const bounds = event.currentTarget.getBoundingClientRect();
                    const deltaX = ((event.clientX - headerCropDrag.startX) / bounds.width) * 100;
                    const deltaY = ((event.clientY - headerCropDrag.startY) / bounds.height) * 100;
                    updateHeaderCrop({ x: headerCropDrag.originX + deltaX, y: headerCropDrag.originY + deltaY });
                  }}
                  onPointerUp={(event) => {
                    if (headerCropDrag) event.currentTarget.releasePointerCapture(headerCropDrag.pointerId);
                    setHeaderCropDrag(null);
                  }}
                  onPointerCancel={(event) => {
                    if (headerCropDrag) event.currentTarget.releasePointerCapture(headerCropDrag.pointerId);
                    setHeaderCropDrag(null);
                  }}
                >
                  <img src={pendingHeaderCrop.dataUrl} alt="Header crop source" className="h-full w-full select-none object-cover opacity-80" draggable={false} />
                  <div className="absolute inset-0 bg-slate-950/20" />
                  <div
                    role="slider"
                    aria-label="Header crop area"
                    tabIndex={0}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setHeaderCropDrag({ pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: headerCrop.x, originY: headerCrop.y });
                    }}
                    onKeyDown={(event) => {
                      const step = event.shiftKey ? 5 : 1;
                      if (event.key === 'ArrowLeft') updateHeaderCrop({ x: headerCrop.x - step });
                      if (event.key === 'ArrowRight') updateHeaderCrop({ x: headerCrop.x + step });
                      if (event.key === 'ArrowUp') updateHeaderCrop({ y: headerCrop.y - step });
                      if (event.key === 'ArrowDown') updateHeaderCrop({ y: headerCrop.y + step });
                    }}
                    className="absolute cursor-grab touch-none rounded-xl border-2 border-dashed border-blue-600 bg-white/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)] outline-none ring-4 ring-blue-500/10 active:cursor-grabbing"
                    style={{ left: `${headerCrop.x}%`, top: `${headerCrop.y}%`, width: `${headerCrop.width}%`, height: `${headerCrop.height}%` }}
                  >
                    <div className="grid h-full place-items-center text-xs font-semibold text-white drop-shadow">
                      Drag crop area
                    </div>
                    <span className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-blue-600" />
                    <span className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full bg-blue-600" />
                    <span className="absolute -bottom-1.5 -left-1.5 h-3 w-3 rounded-full bg-blue-600" />
                    <span className="absolute -bottom-1.5 -right-1.5 h-3 w-3 rounded-full bg-blue-600" />
                  </div>
                </div>
                <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">Drag the crop box, or use arrow keys/sliders for precise placement.</p>
              </div>
              <div className="space-y-4">
                {[
                  ['x', 'Horizontal position'],
                  ['y', 'Vertical position'],
                  ['width', 'Crop width'],
                  ['height', 'Crop height'],
                ].map(([field, label]) => (
                  <label key={field} className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    <span>{label}</span>
                    <input type="range" min={field === 'height' ? 18 : field === 'width' ? 24 : 0} max={100} value={headerCrop[field as keyof typeof headerCrop]} onChange={(event) => updateHeaderCrop({ [field]: Number(event.target.value) } as Partial<typeof headerCrop>)} className="mt-2 w-full" />
                  </label>
                ))}
                <button onClick={applyHeaderCrop} className="w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800">Apply Cropped Header</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );

  if (['overview', 'enrollment', 'students', 'facilitators', 'coordinators', 'municipalities', 'modules', 'assessments', 'tools', 'assignments', 'exports', 'settings', 'account'].includes(view)) {
    return (
      <div className={`${embedded ? 'min-h-0 bg-transparent' : 'min-h-dvh overflow-x-hidden bg-[#f4f8fd]'} text-slate-950 dark:bg-slate-950 dark:text-slate-100`}>
        <div className={embedded ? 'min-h-0' : 'min-h-dvh'}>
          {!embedded && (
            <CollapsibleRoleSidebar
              open={adminMobileSidebarOpen}
              onClose={() => setAdminMobileSidebarOpen(false)}
              portalLabel="Admin Portal"
              closeLabel="Close admin navigation"
              groups={[
                {
                  label: 'Main Navigation',
                  items: [
                    { label: 'Dashboard', icon: Home, onClick: () => setView('overview'), active: view === 'overview' },
                    { label: 'Student Approvals', icon: UserCheck, onClick: () => setView('enrollment'), active: view === 'enrollment' },
                    { label: 'Coordinators', icon: UserCog, onClick: () => setView('coordinators'), active: view === 'coordinators' },
                    { label: 'Facilitators', icon: Users, onClick: () => setView('facilitators'), active: view === 'facilitators' },
                    { label: 'NSTP Components', icon: Building2, onClick: () => setView('municipalities'), active: view === 'municipalities' },
                    { label: 'Students', icon: GraduationCap, onClick: () => setView('students'), active: view === 'students' },
                    { label: 'Modules', icon: BookOpen, onClick: () => setView('modules'), active: view === 'modules' },
                    { label: 'Assessments', icon: ClipboardList, onClick: () => setView('assessments'), active: view === 'assessments' },
                    { label: 'Grades', icon: Award, onClick: () => setView('assignments'), active: view === 'assignments' },
                    { label: 'Reports', icon: BarChart3, onClick: () => setView('tools'), active: view === 'tools' },
                    { label: 'Student Profile Layout', icon: FileDown, onClick: () => setView('exports'), active: view === 'exports' },
                    { label: 'Account Settings', icon: UserCog, onClick: () => setView('account'), active: view === 'account' },
                    { label: 'Settings', icon: Settings, onClick: () => setView('settings'), active: view === 'settings' },
                  ],
                },
              ]}
              avatarLabel={adminInitials}
              accountLabel="Administrator"
              accountTitle={adminDisplayName}
              accountSubtitle={adminDisplayRole}
              onLogout={onLogout}
            />
          )}

          <main className={`min-w-0 overflow-auto rounded-2xl sm:rounded-[2rem] border border-slate-200 bg-white/90 shadow-xl shadow-slate-200/50 backdrop-blur transition-all duration-300 dark:border-slate-800 dark:bg-slate-900/85 dark:shadow-none ${embedded ? '' : 'm-2 sm:m-3 lg:ml-[76px]'}`}>
            <header className="relative flex flex-col gap-3 border-b border-slate-200 p-3.5 sm:p-5 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
              {/* Row 1 on mobile, Left side on desktop */}
              <div className="flex min-w-0 items-center justify-between gap-2.5 sm:gap-3">
                <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                  {!embedded && (
                    <button
                      type="button"
                      onClick={() => setAdminMobileSidebarOpen(true)}
                      className="grid h-9 w-9 sm:h-10 sm:w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 lg:hidden"
                      aria-label="Open admin navigation"
                    >
                      <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
                    </button>
                  )}
                  <div className="min-w-0">
                    <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Administration</p>
                    <h1 className="truncate text-lg sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
                      {view === 'enrollment' ? 'Student Approvals' :
                       view === 'coordinators' ? 'Coordinators' :
                       view === 'facilitators' ? 'Facilitators' :
                       view === 'municipalities' ? 'Municipalities' :
                       view === 'students' ? 'Student Roster' :
                       view === 'modules' ? 'Module Library' :
                       view === 'assessments' ? 'Assessment Bank' :
                       view === 'assignments' ? 'Semester Grades' :
                       view === 'tools' ? 'Reports & Analytics' :
                       view === 'exports' ? 'Student Profile Layout' :
                       view === 'account' ? 'Account Settings' :
                       view === 'settings' ? 'System Settings' :
                       'Dashboard'}
                    </h1>
                  </div>
                </div>

                {/* Mobile top utility icons */}
                <div className="flex shrink-0 items-center gap-1.5 sm:hidden">
                  <button onClick={setTheme} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" title="Toggle theme">
                    <SunMedium className="h-4 w-4" />
                  </button>
                  <button onClick={() => setNotificationsOpen((open) => !open)} className="relative grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" title="Notifications">
                    <Bell className="h-4 w-4" />
                    {pendingRegistrations.length ? <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[10px] font-semibold text-white">{pendingRegistrations.length}</span> : null}
                  </button>
                  <button onClick={() => setProfileOpen((open) => !open)} className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-blue-700 text-xs font-semibold text-white">{adminInitials}</span>
                    <ChevronDown className="h-3 w-3 text-slate-400" />
                  </button>
                </div>
              </div>

              {/* Row 2 on mobile: Search + School Year + Desktop Utilities */}
              <div className="flex min-w-0 items-center gap-2 sm:gap-3 lg:justify-end">
                <label className="flex h-9 sm:h-12 min-w-0 flex-1 items-center gap-2 sm:gap-2.5 rounded-xl sm:rounded-2xl border border-slate-200 bg-white px-2.5 sm:px-4 text-xs sm:text-sm shadow-sm dark:border-slate-700 dark:bg-slate-950 lg:w-64 xl:w-72">
                  <Search className="h-4 w-4 shrink-0 text-slate-400" />
                  <input value={adminSearch} onChange={(event) => setAdminSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && runAdminSearch()} placeholder="Search anything..." className="w-full min-w-0 bg-transparent text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100" />
                </label>

                <select value={schoolYear} onChange={(event) => setSchoolYear(event.target.value)} className="h-9 sm:h-12 shrink-0 rounded-xl sm:rounded-2xl border border-slate-200 bg-white px-2.5 sm:px-4 text-xs sm:text-sm font-medium text-slate-700 shadow-sm outline-none hover:border-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  {SCHOOL_YEARS.map((year) => <option key={year}>{year}</option>)}
                </select>

                {/* Tablet & Desktop utility buttons */}
                <div className="hidden sm:flex shrink-0 items-center gap-2">
                  <button onClick={setTheme} className="grid h-10 w-10 sm:h-12 sm:w-12 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" title="Toggle theme">
                    <SunMedium className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>
                  <button onClick={() => setNotificationsOpen((open) => !open)} className="relative grid h-10 w-10 sm:h-12 sm:w-12 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                    <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
                    {pendingRegistrations.length ? <span className="absolute -right-1 -top-1 grid h-5 w-5 sm:h-6 sm:w-6 place-items-center rounded-full bg-rose-500 text-[10px] sm:text-xs font-semibold text-white">{pendingRegistrations.length}</span> : null}
                  </button>
                  <button onClick={() => setProfileOpen((open) => !open)} className="flex h-10 sm:min-h-12 items-center gap-2 sm:gap-3 rounded-2xl border border-slate-200 bg-white px-2.5 sm:px-3 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                    <span className="grid h-7 w-7 sm:h-9 sm:w-9 place-items-center rounded-full bg-blue-700 text-xs sm:text-sm font-semibold text-white">{adminInitials}</span>
                    <span className="hidden text-sm font-medium text-slate-800 dark:text-slate-100 sm:block">{adminDisplayName}</span>
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  </button>
                </div>
              </div>

              {/* Anchored Dropdown Menu */}
              {(notificationsOpen || profileOpen) && (
                <div className="absolute right-3 top-14 sm:right-5 sm:top-24 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-slate-950">
                  {notificationsOpen ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">Notifications</p>
                      <button onClick={() => { setNotificationsOpen(false); setView('enrollment'); }} className="mt-3 w-full rounded-xl bg-blue-50 p-3 text-left text-sm text-slate-800 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-slate-100">Review {pendingRegistrations.length} enrollment request{pendingRegistrations.length === 1 ? '' : 's'}</button>
                      <button onClick={() => { setNotificationsOpen(false); setView('tools'); }} className="mt-2 w-full rounded-xl bg-slate-50 p-3 text-left text-sm text-slate-800 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-100">Generate monthly analytics snapshot</button>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">Signed in</p>
                      <p className="mt-2 font-semibold text-slate-950 dark:text-white">Dr. Reynold G. Bustillo</p>
                      <button onClick={() => { setProfileOpen(false); setView('settings'); }} className="mt-3 w-full rounded-xl bg-blue-50 p-3 text-left text-sm font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">System Settings</button>
                      <button onClick={onLogout} className="mt-2 w-full rounded-xl bg-rose-50 p-3 text-left text-sm font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">Logout</button>
                    </div>
                  )}
                </div>
              )}
            </header>

            <div className={`grid gap-4 sm:gap-5 p-3.5 sm:p-5 ${view === 'overview' ? 'xl:grid-cols-[minmax(0,1fr)_15rem]' : 'xl:grid-cols-1'}`}>
              <div className="min-w-0 space-y-5">
                {view === 'enrollment' ? (
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Enrollment Module</p>
                        <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">Student Approvals</h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Approve, reject, and monitor student enrollment from the main admin body.</p>
                      </div>
                      <div className="rounded-2xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">{pendingRegistrations.length} pending request{pendingRegistrations.length === 1 ? '' : 's'}</div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1120px] text-sm">
                        <thead>
                          <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                            <th className="px-4 py-3">Student</th>
                            <th className="px-4 py-3">Email / ID</th>
                            <th className="px-4 py-3">Program</th>
                            <th className="px-4 py-3">Year Level</th>
                            <th className="px-4 py-3">Major</th>
                            <th className="px-4 py-3">Municipality</th>
                            <th className="px-4 py-3">Assigned Facilitator</th>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingRegistrations.map((registration) => {
                            const targetMun = registration.assignedMunicipality || registration.municipality || 'Naval';
                            const assignedFacilitator = facilitatorAccounts.find((account) => account.municipalities?.includes(targetMun));
                            const isApproving = approvingRegistrationIds.includes(registration.id);
                            const approvalError = registrationApprovalErrors[registration.id];
                            return (
                              <tr key={registration.id} className="border-b border-slate-100 dark:border-slate-800">
                                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{registration.name}</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{registration.studentId || registration.email}</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{registration.degreeProgram || 'Not set'}</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{registration.yearLevel || 'Not set'}</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{registration.major || 'Not applicable'}</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{registration.municipality || 'Naval'}</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{assignedFacilitator?.name || 'Unassigned'}</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{new Date(registration.createdAt).toLocaleDateString()}</td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-wrap gap-2">
                                    <button onClick={() => printOfficialProfile(registration)} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
                                      <Printer className="h-4 w-4" />
                                      Print
                                    </button>
                                    <button onClick={() => exportOfficialProfilePdf(registration)} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                                      PDF
                                    </button>
                                    <button onClick={() => exportOfficialProfileDocx(registration)} className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
                                      DOCX
                                    </button>
                                    <button disabled={isApproving} onClick={() => approveRegistration(registration)} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                                      {isApproving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                                      {isApproving ? 'Approving…' : 'Approve'}
                                    </button>
                                    <button disabled={isApproving} onClick={() => rejectRegistration(registration.id)} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">Reject</button>
                                  </div>
                                  {approvalError && <p role="alert" className="mt-2 max-w-sm text-xs font-medium text-rose-700 dark:text-rose-300">{approvalError}</p>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {pendingRegistrations.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No pending enrollment requests right now.</div>
                      )}
                    </div>
                  </section>
                ) : view === 'students' ? (
                  <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Students Module</p>
                        <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">Student Roster and Performance</h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">View approved students, monitor component placement, update progress, and export the active school-year roster.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={startNewStudent} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800">
                          <Plus className="h-4 w-4" />
                          Add Student
                        </button>
                        <button onClick={() => exportStudentsCsv(filteredStudents)} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
                          <FileDown className="h-4 w-4" />
                          Export Visible
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        { label: 'Approved Students', value: totalStudents, detail: schoolYear, icon: GraduationCap },
                        { label: 'Average Progress', value: `${avgProgress}%`, detail: 'Across active roster', icon: TrendingUp },
                        { label: 'At Risk', value: studentsNeedingSupport, detail: 'Below 70% progress', icon: TriangleAlert },
                        { label: 'Completed', value: statusCounts.graduated, detail: 'Graduated records', icon: BadgeCheck },
                      ].map((stat) => {
                        const Icon = stat.icon;
                        return (
                          <article key={stat.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex items-start gap-3">
                              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200"><Icon className="h-5 w-5" /></span>
                              <div>
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{stat.label}</p>
                                <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">{stat.value}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{stat.detail}</p>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_12rem_12rem_10rem]">
                      <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <Search className="h-4 w-4 text-slate-400" />
                        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student name, email, or status..." className="w-full bg-transparent outline-none dark:text-slate-100" />
                      </label>
                      <select value={filter} onChange={(event) => setFilter(event.target.value)} className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
                        <option value="all">All Components</option>
                        <option value="CWTS">CWTS</option>
                        <option value="CWTS (Coast Guard)">CWTS Coast Guard</option>
                        <option value="LTS">LTS</option>
                        <option value="MTS (Army)">MTS Army</option>
                        <option value="MTS (Navy)">MTS Navy</option>
                      </select>
                      <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
                        <option value="risk">Risk First</option>
                        <option value="progress-high">Highest Progress</option>
                        <option value="progress-low">Lowest Progress</option>
                        <option value="name">Name</option>
                        <option value="status">Status</option>
                      </select>
                      <select value={studentsPerPage} onChange={(event) => setStudentsPerPage(Number(event.target.value))} className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
                        {[10, 25, 50, 100].map((count) => <option key={count} value={count}>{count} / page</option>)}
                      </select>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                      <table className="min-w-[800px] w-full text-sm">
                        <colgroup>
                          <col className="w-[22%]" />
                          <col className="w-[12%]" />
                          <col className="w-[13%]" />
                          <col className="w-[15%]" />
                          <col className="w-[12%]" />
                          <col className="w-[10%]" />
                          <col className="w-[16%]" />
                        </colgroup>
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                          <tr>
                            <th className="px-3 py-3">Student</th>
                            <th className="px-3 py-3">Municipality</th>
                            <th className="px-3 py-3">Facilitator</th>
                            <th className="px-3 py-3">Component</th>
                            <th className="px-3 py-3">Progress</th>
                            <th className="px-3 py-3">Status</th>
                            <th className="px-3 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {studentsLoading ? (
                            Array.from({ length: 5 }).map((_, idx) => (
                              <tr key={`skeleton-${idx}`} className="border-t border-slate-100 dark:border-slate-800 animate-pulse">
                                <td className="px-3 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-28 mb-1" /><div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-20" /></td>
                                <td className="px-3 py-4"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-16" /></td>
                                <td className="px-3 py-4"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-20" /></td>
                                <td className="px-3 py-4"><div className="h-8 bg-slate-100 dark:bg-slate-800 rounded-xl w-32" /></td>
                                <td className="px-3 py-4"><div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full w-24" /></td>
                                <td className="px-3 py-4"><div className="h-5 bg-slate-100 dark:bg-slate-800 rounded-full w-14" /></td>
                                <td className="px-3 py-4 text-right"><div className="h-8 bg-slate-100 dark:bg-slate-800 rounded-xl w-16 ml-auto" /></td>
                              </tr>
                            ))
                          ) : (
                            paginatedStudents.map((student) => (
                            <tr key={student.id} className="border-t border-slate-100 hover:bg-blue-50/60 dark:border-slate-800 dark:hover:bg-slate-900">
                              <td className="px-3 py-3">
                                <p className="truncate font-semibold text-slate-950 dark:text-white">{student.name}</p>
                                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{student.studentId || student.email}</p>
                              </td>
                              <td className="px-3 py-3 text-slate-600 dark:text-slate-300"><span className="block truncate">{student.municipality || 'Unassigned'}</span></td>
                              <td className="px-3 py-3 text-slate-600 dark:text-slate-300"><span className="block truncate">{student.facilitatorName || 'Unassigned'}</span></td>
                              <td className="px-3 py-3">
                                <select
                                  value={student.component ?? ''}
                                  onChange={(event) => updateStudent(student.id, { component: toNstpComponent(event.target.value) })}
                                  className="w-full rounded-xl border border-blue-100 bg-blue-50 px-2 py-2 text-xs font-semibold text-blue-700 outline-none hover:border-blue-300 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200"
                                  title="Reroute student to another component"
                                >
                                  <option value="">Not yet assigned</option>
                                  {NSTP_COMPONENTS.map((component) => <option key={component} value={component}>{component}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="h-2 min-w-0 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
                                    <div className="h-2 rounded-full bg-gradient-to-r from-blue-700 to-cyan-500" style={{ width: `${student.progress}%` }} />
                                  </div>
                                  <span className="w-9 text-right text-xs font-medium text-slate-700 dark:text-slate-200">{student.progress}%</span>
                                </div>
                              </td>
                              <td className="px-3 py-3"><span className={`inline-block max-w-full truncate rounded-full px-2 py-1 text-[11px] font-semibold ${student.status === 'graduated' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200' : student.status === 'active' ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>{student.status}</span></td>
                              <td className="px-3 py-3">
                                <div className="flex justify-end gap-1">
                                  <button type="button" title="View student details" aria-label={`View ${student.name}`} onClick={(event) => { event.stopPropagation(); setStudentDetailId(student.id); }} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200">
                                    <Eye className="h-4 w-4" />
                                  </button>
                                  <button type="button" title="Export PDF" aria-label={`Export ${student.name} PDF`} onClick={(event) => { event.stopPropagation(); void exportOfficialProfilePdf(student); }} className="grid h-9 w-9 place-items-center rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-200">
                                    <FileDown className="h-4 w-4" />
                                  </button>
                                  <button type="button" title="Edit student" aria-label={`Edit ${student.name}`} onClick={(event) => { event.stopPropagation(); startEditStudent(student); }} className="grid h-9 w-9 place-items-center rounded-xl bg-blue-700 text-white hover:bg-blue-800">
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button type="button" title="Delete student" aria-label={`Delete ${student.name}`} onClick={(event) => { event.stopPropagation(); requestDeleteStudent(student); }} className="grid h-9 w-9 place-items-center rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-200">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )))}
                        </tbody>
                      </table>
                      {!studentsLoading && filteredStudents.length === 0 && <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">No students match the current filters.</div>}
                    </div>
                    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                      <span>Showing {studentPageStart} to {studentPageEnd} of {filteredStudents.length} students</span>
                      <div className="flex items-center gap-2">
                        <button type="button" aria-label="Previous student page" onClick={() => setStudentPage((page) => Math.max(1, page - 1))} disabled={visibleStudentPage === 1} className="grid h-10 min-w-14 place-items-center rounded-xl border border-slate-200 bg-white px-3 text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">Prev</button>
                        <span className="rounded-xl bg-blue-700 px-4 py-2 font-semibold text-white">{visibleStudentPage} / {studentTotalPages}</span>
                        <button type="button" aria-label="Next student page" onClick={() => setStudentPage((page) => Math.min(studentTotalPages, page + 1))} disabled={visibleStudentPage === studentTotalPages} className="grid h-10 min-w-14 place-items-center rounded-xl border border-slate-200 bg-white px-3 text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">Next</button>
                      </div>
                    </div>

                    {studentDetail && (
                      <StudentProfileModal
                        student={studentDetail}
                        onClose={() => setStudentDetailId(null)}
                        onEdit={() => { setStudentDetailId(null); startEditStudent(studentDetail); }}
                        onExportPdf={() => exportOfficialProfilePdf(studentDetail)}
                        onExportDocx={() => exportOfficialProfileDocx(studentDetail)}
                      />
                    )}

                    {studentForm && (
                      <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" onMouseDown={cancelStudentEdit}>
                        <section onMouseDown={(event) => event.stopPropagation()} className="max-h-[92dvh] w-full max-w-5xl overflow-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
                          <div className="mb-5 flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">{editingStudentId === 'new' ? 'Create Student' : 'Edit Student'}</p>
                              <h3 className="text-2xl font-semibold text-slate-950 dark:text-white">{studentForm.name || 'Student Record'}</h3>
                              <p className="text-sm text-slate-500 dark:text-slate-400">Update identity, municipality, component placement, status, and progress.</p>
                            </div>
                            <button type="button" onClick={cancelStudentEdit} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300"><X className="h-4 w-4" /></button>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200"><span>Name</span><input value={studentForm.name} onChange={(e) => updateForm('name', e.target.value)} placeholder="Enter your name" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" /></label>
                            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200"><span>Email</span><input value={studentForm.email} onChange={(e) => updateForm('email', e.target.value)} placeholder="Enter your email" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" /></label>
                            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200"><span>Student ID</span><input value={studentForm.studentId || ''} onChange={(e) => updateForm('studentId', e.target.value)} placeholder="Enter student ID" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" /></label>
                            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200"><span>Municipality</span><select value={studentForm.municipality || ''} onChange={(e) => updateForm('municipality', e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><option value="">Unassigned</option>{BILIRAN_MUNICIPALITIES.map((municipality) => <option key={municipality} value={municipality}>{municipality}</option>)}</select></label>
                            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200"><span>Component</span><select value={studentForm.component ?? ''} onChange={(e) => updateForm('component', toNstpComponent(e.target.value))} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><option value="">Not yet assigned</option>{NSTP_COMPONENTS.map((component) => <option key={component} value={component}>{component}</option>)}</select></label>
                            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200"><span>Status</span><select value={studentForm.status} onChange={(e) => updateForm('status', e.target.value as NstpStudent['status'])} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><option value="active">Active</option><option value="pending">Pending</option><option value="graduated">Graduated</option></select></label>
                            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200"><span>Progress</span><input type="number" min="0" max="100" value={studentForm.progress} onChange={(e) => updateForm('progress', Number(e.target.value))} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" /></label>
                            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200"><span>Assessments</span><input type="number" min="0" value={studentForm.assessments} onChange={(e) => updateForm('assessments', Number(e.target.value))} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" /></label>
                            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200 md:col-span-2"><span>Notes</span><textarea value={studentForm.notes || ''} onChange={(e) => updateForm('notes', e.target.value)} rows={3} placeholder="Enter notes (optional)" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" /></label>
                          </div>
                          <div className="mt-5 flex flex-wrap justify-end gap-3">
                            {editingStudentId !== 'new' && <button type="button" onClick={() => requestDeleteStudent(studentForm)} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-5 py-3 font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-200"><Trash2 className="h-4 w-4" />Delete</button>}
                            <button type="button" onClick={cancelStudentEdit} className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200">Cancel</button>
                            <button type="button" onClick={saveStudent} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800"><Save className="h-4 w-4" />Save Student</button>
                          </div>
                        </section>
                      </div>
                    )}
                  </section>
                ) : view === 'coordinators' ? (
                  <CoordinatorManagementView
                    admin={currentAdmin || { id: 'admin-1', name: 'Administrator', email: 'bipsu_nstp_admin', password: '', role: 'admin' }}
                    coordinators={coordinatorAccounts}
                    onRefresh={() => setAccountVersion((v) => v + 1)}
                  />
                ) : view === 'facilitators' ? (
                  <section className="space-y-5">
                    <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Facilitators</p>
                        <h2 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">Facilitator Overview</h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Facilitators are now managed by component coordinators.</p>
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                      <table className="w-full min-w-[600px] text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                          <tr>
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">Email</th>
                            <th className="px-4 py-3">Municipalities</th>
                            <th className="px-4 py-3">Students</th>
                          </tr>
                        </thead>
                        <tbody>
                          {facilitatorAccounts.map((fac) => (
                            <tr key={fac.id} className="border-t border-slate-100 dark:border-slate-800">
                              <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{fac.name}</td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fac.email}</td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {(fac.municipalities || []).slice(0, 3).map((m) => <span key={m} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">{m}</span>)}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{students.filter((s) => s.facilitatorId === fac.id || fac.municipalities?.includes(s.assignedMunicipality || s.municipality || '')).length}</td>
                            </tr>
                          ))}
                          {facilitatorAccounts.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">No facilitators found.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ) : view === 'municipalities' ? (
                  <section className="space-y-5">
                    <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Municipality Module</p>
                        <h2 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">Municipality Assignments</h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Assign one or more municipalities to each facilitator. Students are grouped by municipality once enrollment is approved.</p>
                      </div>
                    </div>

                    <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 md:grid-cols-4">
                      {[
                        { label: 'Municipalities', value: BILIRAN_MUNICIPALITIES.length, detail: 'All municipalities assigned', icon: Building2, tone: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200' },
                        { label: 'Facilitators', value: facilitatorAccounts.length, detail: 'Active facilitators', icon: Users, tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200' },
                        { label: 'Coverage', value: `${Math.round((municipalityAssignmentRows.filter((row) => row.assigned.length > 0).length / Math.max(1, BILIRAN_MUNICIPALITIES.length)) * 100)}%`, detail: 'Students covered', icon: BadgeCheck, tone: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-200' },
                        { label: 'Unassigned', value: municipalityAssignmentRows.filter((row) => row.assigned.length === 0).length, detail: 'Municipalities', icon: TriangleAlert, tone: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200' },
                      ].map((stat) => {
                        const Icon = stat.icon;
                        return (
                          <article key={stat.label} className="border-b border-slate-200 p-5 dark:border-slate-800 md:border-b-0 md:border-r md:last:border-r-0">
                            <div className="flex items-center gap-4">
                              <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${stat.tone}`}>
                                <Icon className="h-6 w-6" />
                              </span>
                              <div>
                                <p className="text-2xl font-semibold text-slate-950 dark:text-white">{stat.value}</p>
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{stat.label}</p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{stat.detail}</p>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_20rem]">
                      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(13rem,1fr)_9.5rem_9.5rem_7.5rem]">
                          <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm dark:border-slate-800 dark:bg-slate-900">
                            <Search className="h-4 w-4 text-slate-400" />
                            <input value={municipalitySearch} onChange={(event) => setMunicipalitySearch(event.target.value)} placeholder="Search municipality..." className="w-full bg-transparent outline-none dark:text-slate-100" />
                          </label>
                          <select value={municipalityStatusFilter} onChange={(event) => setMunicipalityStatusFilter(event.target.value)} className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
                            <option value="all">Status: All</option>
                            <option value="assigned">Assigned</option>
                            <option value="partial">Partial</option>
                            <option value="unassigned">Unassigned</option>
                          </select>
                          <select value={municipalitySort} onChange={(event) => setMunicipalitySort(event.target.value)} className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
                            <option value="name">Sort: A - Z</option>
                            <option value="students">Students</option>
                            <option value="facilitators">Facilitators</option>
                          </select>
                          <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-blue-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
                            <FileDown className="h-4 w-4" />
                            Export
                          </button>
                        </div>

                        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                          <table className="min-w-[700px] w-full text-sm">
                            <colgroup>
                              <col className="w-[25%]" />
                              <col className="w-[14%]" />
                              <col className="w-[32%]" />
                              <col className="w-[17%]" />
                              <col className="w-[12%]" />
                            </colgroup>
                            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                              <tr>
                                <th className="px-3 py-3">Municipality</th>
                                <th className="px-3 py-3">Students</th>
                                <th className="px-3 py-3">Facilitators</th>
                                <th className="px-3 py-3">Status</th>
                                <th className="px-3 py-3 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {municipalityAssignmentRows.map((row) => (
                                <tr key={row.municipality} className="border-t border-slate-100 hover:bg-blue-50/60 dark:border-slate-800 dark:hover:bg-slate-900">
                                  <td className="px-3 py-3">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-50 text-[11px] font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">{row.municipality.slice(0, 3).toUpperCase()}</span>
                                      <span className="min-w-0 truncate font-semibold text-slate-950 dark:text-white">{row.municipality}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3"><p className="font-semibold text-slate-900 dark:text-slate-100">{row.studentCount}</p><p className="text-xs text-slate-500 dark:text-slate-400">students</p></td>
                                  <td className="px-3 py-3">
                                    <div className="flex min-w-0 items-center gap-1.5">
                                      {row.assigned.slice(0, 3).map((facilitator) => (
                                        <span key={facilitator.id} title={facilitator.name} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700 ring-2 ring-white dark:bg-indigo-500/10 dark:text-indigo-200 dark:ring-slate-950">{facilitator.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
                                      ))}
                                      {row.assigned.length > 3 && <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">+{row.assigned.length - 3}</span>}
                                      <span className="ml-1 min-w-0 truncate text-xs text-slate-500 dark:text-slate-400">{row.assigned.length} facilitator{row.assigned.length === 1 ? '' : 's'}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3">
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.status === 'assigned' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200' : row.status === 'partial' ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200'}`}>{row.status === 'assigned' ? 'Assigned' : row.status === 'partial' ? 'Partial' : 'Unassigned'}</span>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{row.assigned.length ? 'Complete' : 'Needs assignment'}</p>
                                  </td>
                                  <td className="px-3 py-3">
                                    <div className="relative flex justify-end">
                                      <button title={`Manage ${row.municipality} facilitators`} onClick={() => setOpenMunicipalityManage((current) => current === row.municipality ? null : row.municipality)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-blue-700 hover:bg-blue-50 dark:border-slate-700 dark:text-blue-200 xl:w-auto xl:px-3">
                                        <Users className="h-4 w-4" />
                                        <span className="sr-only xl:not-sr-only xl:ml-2 xl:text-xs xl:font-semibold">Manage</span>
                                      </button>
                                      {openMunicipalityManage === row.municipality && (
                                        <>
                                          <button aria-label="Close municipality assignment menu" onClick={() => setOpenMunicipalityManage(null)} className="fixed inset-0 z-10 cursor-default bg-transparent" />
                                          <div className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-950">
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Assign facilitators</p>
                                              <button onClick={() => setOpenMunicipalityManage(null)} className="grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"><X className="h-3.5 w-3.5" /></button>
                                            </div>
                                            <div className="grid max-h-64 gap-2 overflow-auto pr-1">
                                              {facilitatorAccounts.map((facilitator) => {
                                                const checked = Boolean(facilitator.municipalities?.includes(row.municipality));
                                                return (
                                                  <label key={facilitator.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900">
                                                    <span><span className="block font-medium text-slate-900 dark:text-slate-100">{facilitator.name}</span><span className="text-xs text-slate-500 dark:text-slate-400">{facilitator.email}</span></span>
                                                    <input type="checkbox" checked={checked} onChange={(event) => updateFacilitatorMunicipality(facilitator.id, row.municipality, event.target.checked)} className="h-5 w-5 rounded border-slate-300 text-blue-700" />
                                                  </label>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-4 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                          <span>Showing {municipalityAssignmentRows.length} of {BILIRAN_MUNICIPALITIES.length} municipalities</span>
                          <div className="flex gap-2"><button className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-400 dark:border-slate-800">‹</button><button className="grid h-9 w-9 place-items-center rounded-xl bg-blue-700 text-white">1</button><button className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-400 dark:border-slate-800">›</button></div>
                        </div>
                      </section>

                      <aside className="space-y-5">
                        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                          <h3 className="text-lg font-semibold text-slate-950 dark:text-white">Municipality Overview</h3>
                          <div className="mt-4 grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)] xl:grid-cols-1">
                            <div className="h-40 min-h-40">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie data={municipalityOverviewRows} dataKey="value" innerRadius={45} outerRadius={70} paddingAngle={2}>{municipalityOverviewRows.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie>
                                  <Tooltip />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="space-y-3">
                              {municipalityOverviewRows.map((row) => (
                                <div key={row.name} className="flex items-center justify-between gap-3 text-sm">
                                  <span className="flex items-center gap-2 text-slate-700 dark:text-slate-200"><span className="h-3 w-3 rounded-full" style={{ background: row.color }} />{row.name}</span>
                                  <span className="font-semibold text-slate-900 dark:text-white">{row.value} ({row.percent}%)</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </section>
                        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                          <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold text-slate-950 dark:text-white">Recent Activity</h3></div>
                          <div className="space-y-3">
                            <p className="text-sm text-slate-500 dark:text-slate-400">No recent activity.</p>
                          </div>
                        </section>
                      </aside>
                    </div>
                  </section>
                ) : false && view === 'municipalities' ? (
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <div className="mb-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Municipality Module</p>
                      <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">Biliran Municipality Assignments</h2>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Assign one or more municipalities to each facilitator. Students are grouped by municipality once enrollment is approved.</p>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      {BILIRAN_MUNICIPALITIES.map((municipality) => {
                        const assigned = facilitatorAccounts.filter((account) => account.municipalities?.includes(municipality));
                        const studentCount = students.filter((student) => student.municipality === municipality).length;
                        const municipalityGroups = trainingGroups.filter((group: any) => group.municipality === municipality || group.programHandles?.some((handle: string) => handle.toLowerCase().includes(municipality.toLowerCase())));
                        return (
                          <article key={municipality} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                            <div className="mb-4 flex items-start justify-between gap-3">
                              <div>
                                <h3 className="text-lg font-semibold text-slate-950 dark:text-white">{municipality}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{studentCount} student{studentCount === 1 ? '' : 's'} • {assigned.length} facilitator{assigned.length === 1 ? '' : 's'}</p>
                              </div>
                              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">{assigned.length ? 'Assigned' : 'Needs facilitator'}</span>
                            </div>
                            {facilitatorAccounts.length > 3 ? (
                              <details className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                                <summary className="cursor-pointer text-sm font-semibold text-blue-700 dark:text-blue-200">
                                  Manage facilitator checklist ({assigned.length} selected)
                                </summary>
                                <div className="mt-3 grid max-h-56 gap-2 overflow-auto pr-1">
                                  {facilitatorAccounts.map((facilitator) => {
                                    const checked = Boolean(facilitator.municipalities?.includes(municipality));
                                    return (
                                      <label key={facilitator.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                                        <span>
                                          <span className="block font-medium text-slate-900 dark:text-slate-100">{facilitator.name}</span>
                                          <span className="text-xs text-slate-500 dark:text-slate-400">{facilitator.email}</span>
                                        </span>
                                        <input type="checkbox" checked={checked} onChange={(event) => updateFacilitatorMunicipality(facilitator.id, municipality, event.target.checked)} className="h-5 w-5 rounded border-slate-300 text-blue-700" />
                                      </label>
                                    );
                                  })}
                                </div>
                              </details>
                            ) : (
                              <div className="grid gap-2">
                                {facilitatorAccounts.map((facilitator) => {
                                  const checked = Boolean(facilitator.municipalities?.includes(municipality));
                                  return (
                                    <label key={facilitator.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                                      <span>
                                        <span className="block font-medium text-slate-900 dark:text-slate-100">{facilitator.name}</span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400">{facilitator.email}</span>
                                      </span>
                                      <input type="checkbox" checked={checked} onChange={(event) => updateFacilitatorMunicipality(facilitator.id, municipality, event.target.checked)} className="h-5 w-5 rounded border-slate-300 text-blue-700" />
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                            {municipalityGroups.length > 0 && (
                              <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-950 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-100">
                                <p className="mb-2 font-semibold uppercase tracking-[0.12em]">Training groups</p>
                                <div className="space-y-1">
                                  {municipalityGroups.slice(0, 3).map((group) => (
                                    <p key={group.id}>{group.facilitatorName}: {group.programHandles.slice(0, 2).join(', ')} • {group.studentCount} students</p>
                                  ))}
                                </div>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ) : view === 'modules' ? (
                  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <div className="border-b border-slate-200 p-5 dark:border-slate-800">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Modules</p>
                      <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">Module Library</h2>
                    </div>
                    <div className="overflow-visible">
                      <ModulesPage user={(currentAdmin || { id: 'admin-1', name: 'Administrator', email: 'bipsu_nstp_admin', password: '', role: 'admin' }) as NstpAccount} role="admin" onBack={() => setView('overview')} />
                    </div>
                  </section>
                ) : view === 'assessments' ? (
                  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Assessment Module</p>
                    <h2 className="mb-4 text-2xl font-semibold text-slate-950 dark:text-white">Assessment Bank</h2>
                    <AssessmentManager user={(currentAdmin || { id: 'admin-1', name: 'Administrator', email: 'bipsu_nstp_admin', password: '', role: 'admin' }) as NstpAccount} role="admin" />
                  </section>
                ) : view === 'assignments' ? (
                  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <AdminGradesView />
                  </section>
                ) : view === 'tools' ? (
                  <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Reports and Analytics</p>
                        <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">Program Analytics</h2>
                        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Monitor enrollment movement, municipality coverage, component distribution, and learning completion from one decision-ready view.</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-blue-100 bg-blue-50/70 p-2 dark:border-blue-500/20 dark:bg-blue-500/10">
                        <button onClick={() => exportStudentsCsv(students)} className="rounded-xl bg-blue-700 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-800">Roster</button>
                        <button onClick={exportComplianceSnapshot} className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-200">Snapshot</button>
                        <button onClick={exportAuditLogCsv} className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:bg-slate-900 dark:text-blue-200" disabled={auditLog.length === 0}>Audit</button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        { label: 'Average Progress', value: `${avgProgress}%`, detail: `${studentsNeedingSupport} need support`, icon: TrendingUp, tone: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200' },
                        { label: 'Completion Rate', value: `${completionRate}%`, detail: 'Students at 100%', icon: BadgeCheck, tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200' },
                        { label: 'Module Completion', value: `${moduleCompletionAvg}%`, detail: 'Average lesson progress', icon: BookOpen, tone: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-200' },
                        { label: 'Pending Requests', value: pendingRegistrations.length, detail: 'Enrollment approvals', icon: UserCheck, tone: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200' },
                      ].map((metric) => {
                        const Icon = metric.icon;
                        return (
                          <article key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{metric.label}</p>
                                <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">{metric.value}</p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{metric.detail}</p>
                              </div>
                              <span className={`grid h-11 w-11 place-items-center rounded-2xl ${metric.tone}`}><Icon className="h-5 w-5" /></span>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="font-semibold text-slate-950 dark:text-white">Cohort Trend Snapshot</h3>
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">Progress vs. assessments</span>
                        </div>
                        <div className="h-72 min-w-0">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                            <LineChart data={progressTrendData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis dataKey="name" />
                              <YAxis />
                              <Tooltip />
                              <Legend />
                              <Line type="monotone" dataKey="progress" stroke="#1d4ed8" strokeWidth={3} dot={{ r: 3 }} />
                              <Line type="monotone" dataKey="assessments" stroke="#06b6d4" strokeWidth={3} dot={{ r: 3 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </article>

                      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="font-semibold text-slate-950 dark:text-white">Component Distribution</h3>
                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">NSTP</span>
                        </div>
                        <div className="h-72 min-w-0">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                            <PieChart>
                              <Pie data={componentChartData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                                {componentChartData.map((entry, index) => {
                                  const palette = ['#10b981', '#2563eb', '#f59e0b', '#8b5cf6'];
                                  return <Cell key={`component-${entry.name}`} fill={palette[index % palette.length]} />;
                                })}
                              </Pie>
                              <Tooltip />
                              <Legend />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </article>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-3">
                      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:col-span-2">
                        <h3 className="mb-3 font-semibold text-slate-950 dark:text-white">Municipality Student Coverage</h3>
                        <div className="h-72 min-w-0">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                            <BarChart data={municipalityStats}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis dataKey="municipality" interval={0} tick={{ fontSize: 11 }} />
                              <YAxis allowDecimals={false} />
                              <Tooltip />
                              <Bar dataKey="students" fill="#2563eb" radius={[8, 8, 0, 0]} />
                              <Bar dataKey="facilitators" fill="#38bdf8" radius={[8, 8, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </article>

                      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <h3 className="font-semibold text-slate-950 dark:text-white">Director Insights</h3>
                        <div className="mt-4 space-y-3 text-sm">
                          <div className="rounded-2xl bg-blue-50 p-3 text-blue-950 dark:bg-blue-500/10 dark:text-blue-100">
                            <p className="font-semibold">Top performer</p>
                            <p className="mt-1">{topPerformer?.name || 'No student data'} {topPerformer ? `at ${topPerformer.progress}% progress` : ''}</p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 p-3 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            <p className="font-semibold">At-risk cohort</p>
                            <p className="mt-1">{studentsNeedingSupport} student{studentsNeedingSupport === 1 ? '' : 's'} below 70% progress.</p>
                          </div>
                          <div className="rounded-2xl bg-cyan-50 p-3 text-cyan-950 dark:bg-cyan-500/10 dark:text-cyan-100">
                            <p className="font-semibold">Audit readiness</p>
                            <p className="mt-1">{auditLog.length} system action{auditLog.length === 1 ? '' : 's'} recorded.</p>
                          </div>
                        </div>
                      </article>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <h3 className="mb-3 font-semibold text-slate-950 dark:text-white">Enrollment Status Distribution</h3>
                        <div className="h-64 min-w-0">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                            <BarChart data={statusChartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis dataKey="name" />
                              <YAxis allowDecimals={false} />
                              <Tooltip />
                              <Bar dataKey="value" fill="#1d4ed8" radius={[8, 8, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </article>

                      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <h3 className="mb-3 font-semibold text-slate-950 dark:text-white">Progress Bands</h3>
                        <div className="h-64 min-w-0">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                            <BarChart data={progressBandData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis dataKey="band" />
                              <YAxis allowDecimals={false} />
                              <Tooltip />
                              <Bar dataKey="students" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </article>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="font-semibold text-slate-950 dark:text-white">Facilitator Load Balance</h3>
                          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-200">Top 8</span>
                        </div>
                        <div className="h-64 min-w-0">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                            <BarChart data={facilitatorLoadData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis dataKey="name" />
                              <YAxis allowDecimals={false} />
                              <Tooltip />
                              <Legend />
                              <Bar dataKey="students" fill="#2563eb" radius={[8, 8, 0, 0]} />
                              <Bar dataKey="municipalities" fill="#38bdf8" radius={[8, 8, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </article>

                      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="font-semibold text-slate-950 dark:text-white">Official Semester Grades</h3>
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">{schoolYear}</span>
                        </div>
                        <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 p-6 text-center dark:border-blue-500/20 dark:bg-blue-500/10">
                          <Award className="h-9 w-9 text-blue-700 dark:text-blue-300" />
                          <p className="mt-3 font-semibold text-slate-900 dark:text-white">First and Second Semester records</p>
                          <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">Open the server-backed grade center to review drafts and release official results.</p>
                          <button type="button" onClick={() => setView('assignments')} className="mt-4 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Open Grade Center</button>
                        </div>
                      </article>
                    </div>
                  </section>
                ) : view === 'exports' ? (
                  renderExportLayoutView()
                ) : view === 'account' ? (
                  <AccountSettingsSection
                    profile={adminProfile}
                    onProfileUpdated={() => currentUserQuery.refetch()}
                  />
                ) : view === 'settings' ? (
                  <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-500 p-6 text-white shadow-lg shadow-blue-900/20">
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-100">System Settings</p>
                          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Director Control Center</h2>
                          <p className="mt-2 max-w-2xl text-sm text-blue-50">Tune display, routing, exports, and school-year scope from one place.</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white/12 p-2 text-center backdrop-blur">
                          <div className="rounded-xl bg-white/15 px-3 py-2"><p className="text-lg font-semibold">{schoolYearStudents.length}</p><p className="text-[11px] text-blue-100">Students</p></div>
                          <div className="rounded-xl bg-white/15 px-3 py-2"><p className="text-lg font-semibold">{facilitatorAccounts.length}</p><p className="text-[11px] text-blue-100">Facilitators</p></div>
                          <div className="rounded-xl bg-white/15 px-3 py-2"><p className="text-lg font-semibold">{auditLog.length}</p><p className="text-[11px] text-blue-100">Audit</p></div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
                      <div className="grid gap-3 md:grid-cols-2">
                        {[
                          { label: 'Theme', value: adminTheme === 'dark' ? 'Dark mode' : 'Light mode', icon: SunMedium, action: setTheme },
                          { label: 'Notification Digest', value: noticeDigest ? 'Director alerts enabled' : 'Digest disabled', icon: Bell, action: () => setNoticeDigest((state) => !state) },
                          { label: 'Auto Municipality Routing', value: autoAssignMunicipality ? 'Students route by municipality' : 'Manual review required', icon: Building2, action: () => setAutoAssignMunicipality((state) => !state) },
                          { label: 'Compact Cards', value: compactAdminCards ? 'Dense dashboard cards' : 'Comfortable dashboard spacing', icon: BarChart3, action: () => setCompactAdminCards((state) => !state) },
                          { label: 'Student Profile Layout', value: 'Open the versioned PDF/DOCX layout editor', icon: FileDown, action: () => setView('exports') },
                          { label: 'Notice Center', value: 'Open announcements workspace', icon: Mail, action: () => onNavigateApp?.('announcements') },
                        ].map((setting) => {
                          const Icon = setting.icon;
                          return (
                            <button key={setting.label} onClick={setting.action} className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
                              <div className="flex items-start gap-3">
                                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700 transition group-hover:bg-blue-700 group-hover:text-white dark:bg-blue-500/10 dark:text-blue-200"><Icon className="h-5 w-5" /></span>
                                <span>
                                  <span className="block font-semibold text-slate-950 dark:text-white">{setting.label}</span>
                                  <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">{setting.value}</span>
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <aside className="space-y-3">
                        <label className="block rounded-2xl border border-slate-200 bg-blue-50/60 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
                          <span className="flex items-center gap-2 font-semibold text-slate-950 dark:text-white"><CalendarDays className="h-5 w-5 text-blue-700 dark:text-blue-200" /> Active School Year</span>
                          <select value={schoolYear} onChange={(event) => setSchoolYear(event.target.value)} className="mt-3 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none dark:border-blue-500/20 dark:bg-slate-950 dark:text-slate-100">
                            {SCHOOL_YEARS.map((year) => <option key={year}>{year}</option>)}
                          </select>
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">This filters dashboard metrics, rosters, and analytics.</p>
                        </label>
                        <button onClick={() => exportStudentsCsv(schoolYearStudents)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left text-slate-800 hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
                          <FileDown className="h-5 w-5 text-blue-700 dark:text-blue-200" />
                          <span><span className="block font-semibold">Export Current Year</span><span className="text-xs text-slate-500 dark:text-slate-400">{schoolYearStudents.length} visible records</span></span>
                        </button>
                        <button onClick={exportAuditLogCsv} disabled={auditLog.length === 0} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left text-slate-800 hover:border-blue-300 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
                          <History className="h-5 w-5 text-blue-700 dark:text-blue-200" />
                          <span><span className="block font-semibold">Export Audit Log</span><span className="text-xs text-slate-500 dark:text-slate-400">{auditLog.length} audit entries</span></span>
                        </button>
                      </aside>
                    </div>

                    <div className="hidden rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Official Form Template</p>
                          <h3 className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">Student Profile Layout</h3>
                          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Change the header, academic period, signatories, layout style, and colors used by printed forms, PDF downloads, and DOCX downloads. Student data fields stay the same.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-500/30 dark:bg-slate-950 dark:text-blue-200">
                            <FileUp className="h-4 w-4" />
                            Restore Layout Backup
                            <input type="file" accept="application/json,.json" onChange={importFormTemplate} className="hidden" />
                          </label>
                          <button onClick={exportFormTemplate} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                            <FileDown className="h-4 w-4" />
                            Download Layout Backup
                          </button>
                          <button onClick={resetProfileLayout} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                            Restore Default Layout
                          </button>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4 xl:grid-cols-[16rem_minmax(0,1fr)_18rem]">
                        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                          <p className="text-sm font-semibold text-slate-950 dark:text-white">Drag & Drop Fields</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Drag fields to arrange the exported profile table.</p>
                          <div className="mt-4 max-h-[32rem] space-y-2 overflow-auto pr-1">
                            {getTemplateFieldOrder().map((fieldKey, index) => (
                              <div
                                key={fieldKey}
                                draggable
                                onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  moveTemplateField(Number(event.dataTransfer.getData('text/plain')), index);
                                }}
                                className="flex cursor-grab items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 active:cursor-grabbing dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                              >
                                <GripVertical className="h-4 w-4 text-slate-400" />
                                <span className="min-w-0 flex-1 truncate">{getProfileFieldLabel(fieldKey)}</span>
                              </div>
                            ))}
                          </div>
                        </aside>

                        <div className="space-y-4">
                          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-950 dark:text-white">Document Header</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Upload a school header image that appears at the top of every exported profile.</p>
                              </div>
                              {formTemplate.headerImageDataUrl && (
                                <button onClick={() => { setFormTemplate((current) => ({ ...current, headerImageDataUrl: undefined, headerImageName: undefined })); setProfileTemplateDirty(true); }} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-200">
                                  Remove
                                </button>
                              )}
                            </div>
                            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-dashed border-blue-300 bg-blue-50/50 p-3 text-sm text-slate-700 hover:bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-slate-200">
                              <span className="flex min-w-0 items-center gap-3">
                                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-blue-700 shadow-sm dark:bg-slate-950 dark:text-blue-200"><FileUp className="h-5 w-5" /></span>
                                <span className="min-w-0">
                                  <span className="block truncate font-semibold">{formTemplate.headerImageName || 'Upload header image'}</span>
                                  <span className="text-xs text-slate-500 dark:text-slate-400">PNG or JPG, used in print and exports</span>
                                </span>
                              </span>
                              <span className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-blue-700 shadow-sm dark:bg-slate-950 dark:text-blue-200">Choose File</span>
                              <input type="file" accept="image/png,image/jpeg,image/jpg" onChange={handleHeaderFileUpload} className="hidden" />
                            </label>
                          </div>

                          <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm dark:border-blue-500/20 dark:bg-slate-950">
                            <div className="mx-auto max-w-3xl rounded-2xl border border-dashed border-blue-300 bg-white p-4 dark:border-blue-500/30 dark:bg-slate-900">
                              <div className="border-b pb-3 text-center dark:border-slate-800" style={{ borderColor: formTemplate.accentColor }}>
                                {formTemplate.headerImageDataUrl ? (
                                  <img src={formTemplate.headerImageDataUrl} alt="Document header preview" className="mx-auto max-h-24 w-full rounded-xl object-contain" />
                                ) : (
                                  <>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{formTemplate.republicLine}</p>
                                    <p className="mt-1 text-sm font-semibold uppercase tracking-[0.08em] text-slate-950 dark:text-white">{formTemplate.schoolName}</p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{formTemplate.certificationLine}</p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{formTemplate.officeName}</p>
                                  </>
                                )}
                              </div>
                              <div className="py-4 text-center">
                                <p className="text-lg font-semibold text-slate-950 dark:text-white">{formTemplate.formTitle}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{formTemplate.academicPeriod}</p>
                              </div>
                              <div className={`overflow-hidden rounded-xl text-xs ${formTemplate.showFieldBorders ? 'border border-slate-200 dark:border-slate-800' : ''}`}>
                                <div className="grid grid-cols-[0.42fr_0.58fr] text-white" style={{ backgroundColor: formTemplate.accentColor }}>
                                  <span className="p-2 font-semibold">{formTemplate.fieldHeader}</span>
                                  <span className="p-2 font-semibold">{formTemplate.valueHeader}</span>
                                </div>
                                {getTemplateFieldOrder().slice(0, 9).map((fieldKey) => (
                                  <div key={fieldKey} className={`grid grid-cols-[0.42fr_0.58fr] ${formTemplate.showFieldBorders ? 'border-t border-slate-200 dark:border-slate-800' : ''}`}>
                                    <span className="bg-slate-50 p-2 font-semibold dark:bg-slate-950">{getProfileFieldLabel(fieldKey)}</span>
                                    <span className="p-2 text-slate-500 dark:text-slate-400">Student data</span>
                                  </div>
                                ))}
                              </div>
                              <div className="mt-6 grid grid-cols-2 gap-4 text-center text-xs text-slate-500 dark:text-slate-400">
                                <span className="border-t pt-2 dark:border-slate-800">{formTemplate.studentSignatureLabel}</span>
                                <span className="border-t pt-2 dark:border-slate-800">{formTemplate.signatoryName}<br />{formTemplate.signatoryTitle}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                          <p className="mb-4 font-semibold text-slate-950 dark:text-white">Template Settings</p>
                          <div className="space-y-3">
                            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                              <span>Page Size</span>
                              <select value={formTemplate.pageSize || 'a4'} onChange={(event) => updateFormTemplate('pageSize', event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                                <option value="a4">A4</option>
                                <option value="letter">Letter</option>
                              </select>
                            </label>
                            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                              <span>Layout Style</span>
                              <select value={formTemplate.layout} onChange={(event) => updateFormTemplate('layout', event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                                <option value="classic">Classic boxed form</option>
                                <option value="compact">Compact form</option>
                                <option value="formal">Formal letterhead</option>
                              </select>
                            </label>
                            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                              <span>Accent Color</span>
                              <input type="color" value={formTemplate.accentColor} onChange={(event) => updateFormTemplate('accentColor', event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-950" />
                            </label>
                            {[
                              ['formTitle', 'Form Title'],
                              ['academicPeriod', 'Academic Period'],
                              ['fieldHeader', 'Left Table Header'],
                              ['valueHeader', 'Right Table Header'],
                              ['studentSignatureLabel', 'Student Signature Label'],
                              ['signatoryName', 'Signatory Name'],
                              ['signatoryTitle', 'Signatory Title'],
                            ].map(([field, label]) => (
                              <label key={field} className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                                <span>{label}</span>
                                <input value={String(formTemplate[field as keyof OfficialProfileTemplate] || '')} onChange={(event) => updateFormTemplate(field as keyof OfficialProfileTemplate, event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
                              </label>
                            ))}
                            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                              <input type="checkbox" checked={formTemplate.showFieldBorders ?? true} onChange={(event) => updateFormTemplate('showFieldBorders', event.target.checked)} />
                              Show field borders
                            </label>
                            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                              <input type="checkbox" checked={formTemplate.repeatHeader ?? true} onChange={(event) => updateFormTemplate('repeatHeader', event.target.checked)} />
                              Repeat header on each page
                            </label>
                          </div>
                        </aside>
                      </div>
                    </div>
                  </section>
                ) : (
                <>
                <section className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
                  {[
                    { label: 'Total Students', value: totalStudents.toLocaleString(), detail: 'Enrolled students', icon: Users, tone: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-200' },
                    { label: 'Coordinators', value: coordinatorAccounts.length, detail: 'Component coordinators', icon: UserCog, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-200' },
                    { label: 'Facilitators', value: facilitatorAccounts.length, detail: 'Active facilitators', icon: Users, tone: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-200' },
                    { label: 'Municipalities', value: BILIRAN_MUNICIPALITIES.length, detail: 'With assigned facilitators', icon: Building2, tone: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-200' },
                    { label: 'Student Approvals', value: pendingRegistrations.length, detail: 'Pending approval', icon: UserCheck, tone: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-200' },
                  ].map((stat, idx) => {
                    const Icon = stat.icon;
                    return (
                      <article key={stat.label} className={`rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 ${idx === 4 ? 'col-span-2 md:col-span-1' : ''}`}>
                        <div className="flex items-start gap-3 sm:gap-4">
                          <span className={`grid h-10 w-10 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-xl sm:rounded-2xl ${stat.tone}`}>
                            <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{stat.label}</p>
                            <p className="mt-0.5 sm:mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">{stat.value}</p>
                            <p className="mt-0.5 hidden text-xs text-slate-500 dark:text-slate-400 sm:block">{stat.detail}</p>
                          </div>
                        </div>
                        <div className="mt-2.5 sm:mt-4 h-6 sm:h-8 min-w-0">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                            <LineChart data={sparklineData}>
                              <Line type="monotone" dataKey="progress" stroke="#2563eb" strokeWidth={2} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </article>
                    );
                  })}
                </section>

                {/* Mobile-elevated Quick Actions */}
                <section className="block xl:hidden rounded-2xl border border-blue-200 bg-white p-3.5 shadow-sm dark:border-blue-500/20 dark:bg-slate-950">
                  <div className="mb-2.5 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-950 dark:text-white">Quick Actions</h2>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">Jump</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { label: 'Create Coordinator', detail: 'Add new component coordinator', icon: UserCog, action: () => setView('coordinators') },
                      { label: 'Assign Municipalities', detail: 'Manage facilitator assignments', icon: Users, action: () => openQuickAction('municipality') },
                      { label: 'Student Approvals', detail: 'Review pending requests', icon: ClipboardList, action: () => openQuickAction('enrollment'), badge: pendingRegistrations.length },
                      { label: 'Generate Reports', detail: 'Download system reports', icon: FileDown, action: () => openQuickAction('reports') },
                    ].map((action) => {
                      const Icon = action.icon;
                      return (
                        <button key={action.label} onClick={action.action} className="relative flex flex-col items-center justify-center rounded-xl border border-blue-100 bg-blue-50/70 p-2.5 text-center text-blue-950 transition hover:border-blue-300 hover:bg-blue-100 active:scale-[0.98] dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-100">
                          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-200">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="mt-1.5 block text-xs font-semibold leading-tight">{action.label}</span>
                          {action.badge ? <span className="absolute right-1.5 top-1.5 rounded-full bg-blue-700 px-1.5 py-0.2 text-[9px] font-semibold text-white">{action.badge}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Facilitator Overview</h2>
                      <button onClick={() => setView('facilitators')} className="text-sm font-medium text-blue-700 dark:text-blue-300">View all facilitators</button>
                    </div>
                    <div className="grid gap-5 sm:grid-cols-[240px_minmax(0,1fr)]">
                      <div className="relative h-60 min-h-60 min-w-0">
                        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                          <PieChart>
                            <Pie data={facilitatorOverviewData} dataKey="value" nameKey="name" innerRadius={68} outerRadius={100} paddingAngle={2}>
                              {facilitatorOverviewData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                          <span>
                            <span className="block text-3xl font-semibold text-slate-950 dark:text-white">{facilitatorAccounts.length}</span>
                            <span className="text-sm text-slate-500 dark:text-slate-400">Total</span>
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col justify-center gap-4">
                        {facilitatorOverviewData.map((item) => (
                          <div key={item.name} className="flex items-center justify-between gap-3 text-sm">
                            <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                              {item.name}
                            </span>
                            <span className="font-semibold text-slate-900 dark:text-white">{item.value}</span>
                            <span className="text-slate-500 dark:text-slate-400">{item.percent}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Facilitators by Municipality</h2>
                      <button onClick={() => setView('municipalities')} className="text-sm font-medium text-blue-700 dark:text-blue-300">View report</button>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                          <tr>
                            <th className="px-4 py-3 text-left">Municipality</th>
                            <th className="px-4 py-3 text-left">Facilitators</th>
                            <th className="px-4 py-3 text-left">Students</th>
                          </tr>
                        </thead>
                        <tbody>
                          {municipalityStats.slice(0, 5).map((row) => (
                            <tr key={row.municipality} className="border-t border-slate-100 dark:border-slate-800">
                              <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{row.municipality}</td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.facilitators}</td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.students}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="text-base sm:text-lg font-semibold text-slate-950 dark:text-white">Pending Student Approvals</h2>
                    <button onClick={() => setView('enrollment')} className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-300">View all requests</button>
                  </div>

                  {/* Mobile Card List (under 768px) */}
                  <div className="space-y-3 md:hidden">
                    {pendingRegistrations.slice(0, 5).map((registration) => {
                      const isApproving = approvingRegistrationIds.includes(registration.id);
                      const approvalError = registrationApprovalErrors[registration.id];
                      return (
                        <div key={registration.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-slate-950 dark:text-white text-sm">{registration.name}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{registration.degreeProgram || 'No program specified'}</p>
                            </div>
                            <span className="rounded-md bg-blue-100/80 px-2 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-500/20 dark:text-blue-300">
                              {registration.municipality || 'Naval'}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>{new Date(registration.createdAt).toLocaleDateString()}</span>
                            <span>Facilitator - {registration.municipality || 'Naval'}</span>
                          </div>
                          <div className="mt-3 flex items-center gap-2 border-t border-slate-200/80 pt-2.5 dark:border-slate-700/80">
                            <button
                              disabled={isApproving}
                              onClick={() => approveRegistration(registration)}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                            >
                              {isApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                              <span>Approve</span>
                            </button>
                            <button
                              disabled={isApproving}
                              onClick={() => rejectRegistration(registration.id)}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-300"
                            >
                              <X className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Reject</span>
                            </button>
                          </div>
                          {approvalError && <p role="alert" className="mt-2 text-xs font-medium text-rose-700 dark:text-rose-300">{approvalError}</p>}
                        </div>
                      );
                    })}
                    {pendingRegistrations.length === 0 && (
                      <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">No pending student approvals.</p>
                    )}
                  </div>

                  {/* Desktop Table (md and up) */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full min-w-[820px] text-sm">
                      <thead>
                        <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                          <th className="px-4 py-3">Student</th>
                          <th className="px-4 py-3">Municipality</th>
                          <th className="px-4 py-3">Program</th>
                          <th className="px-4 py-3">Request Date</th>
                          <th className="px-4 py-3">Referred By</th>
                          <th className="px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingRegistrations.slice(0, 5).map((registration) => {
                          const isApproving = approvingRegistrationIds.includes(registration.id);
                          const approvalError = registrationApprovalErrors[registration.id];
                          return <tr key={registration.id} className="border-b border-slate-100 dark:border-slate-800">
                            <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{registration.name}</td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{registration.municipality || 'Naval'}</td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{registration.degreeProgram || '—'}</td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{new Date(registration.createdAt).toLocaleDateString()}</td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">Facilitator - {registration.municipality || 'Naval'}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                <button aria-label={`Approve ${registration.name}`} disabled={isApproving} onClick={() => approveRegistration(registration)} className="grid h-8 w-8 place-items-center rounded-full border border-emerald-200 text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/30 dark:hover:bg-emerald-500/10">
                                  {isApproving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                                </button>
                                <button aria-label={`Reject ${registration.name}`} disabled={isApproving} onClick={() => rejectRegistration(registration.id)} className="grid h-8 w-8 place-items-center rounded-full border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/30 dark:hover:bg-rose-500/10">
                                  <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </div>
                              {approvalError && <p role="alert" className="mt-2 max-w-xs text-xs font-medium text-rose-700 dark:text-rose-300">{approvalError}</p>}
                            </td>
                          </tr>
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
                </>
                )}
              </div>

              {view === 'overview' && (
              <aside className="space-y-5">
                <section className="hidden xl:block rounded-2xl border border-blue-200 bg-white p-3 shadow-sm dark:border-blue-500/20 dark:bg-slate-950">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-950 dark:text-white">Quick Actions</h2>
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">Jump</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Create Coordinator', detail: 'Add new component coordinator', icon: UserCog, action: () => setView('coordinators') },
                      { label: 'Assign Municipalities', detail: 'Manage facilitator assignments', icon: Users, action: () => openQuickAction('municipality') },
                      { label: 'Student Approvals', detail: 'Review pending requests', icon: ClipboardList, action: () => openQuickAction('enrollment'), badge: pendingRegistrations.length },
                      { label: 'Generate Reports', detail: 'Download system reports', icon: FileDown, action: () => openQuickAction('reports') },
                    ].map((action) => {
                      const Icon = action.icon;
                      return (
                        <button key={action.label} onClick={action.action} className="relative grid min-h-24 place-items-center rounded-xl border border-blue-100 bg-blue-50/80 p-2 text-center text-blue-950 transition hover:border-blue-300 hover:bg-blue-100 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-100">
                          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-200">
                            <Icon className="h-5 w-5" />
                          </span>
                          <span className="mt-2 block text-xs font-semibold leading-tight">{action.label}</span>
                          {action.badge ? <span className="absolute right-2 top-2 rounded-full bg-blue-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">{action.badge}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-semibold text-slate-950 dark:text-white">Recent Facilitators</h2>
                    <button onClick={() => setView('facilitators')} className="text-sm font-medium text-blue-700 dark:text-blue-300">View all</button>
                  </div>
                  <div className="space-y-3">
                    {facilitatorAccounts.slice(0, 5).map((facilitator) => (
                      <div key={facilitator.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-slate-50 dark:hover:bg-slate-900">
                        <span className="grid h-9 w-9 place-items-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
                          {facilitator.name.split(' ').slice(0, 2).map((part: string) => part[0]).join('')}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">{facilitator.name}</span>
                          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{facilitator.municipalities?.join(', ') || 'Unassigned'}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-semibold text-slate-950 dark:text-white">System Announcements</h2>
                    <button onClick={() => onNavigateApp?.('announcements')} className="text-sm font-medium text-blue-700 dark:text-blue-300">View all</button>
                  </div>
                  <div className="space-y-3">
                    {[
                      ['Schedule of Common Module Implementation', 'May 20, 2024'],
                      ['NSTP Orientation for Facilitators', 'May 18, 2024'],
                      ['Grade Submission Deadline Reminder', 'May 15, 2024'],
                    ].map(([title, date]) => (
                      <button key={title} onClick={() => onNavigateApp?.('announcements')} className="w-full rounded-xl p-2 text-left hover:bg-slate-50 dark:hover:bg-slate-900">
                        <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{title}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{date}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </aside>
              )}
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="size-full overflow-auto bg-[#fcfaf6] dark:bg-slate-950">
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setView('overview')}
            className="clickable-button inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Student Spotlight</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Review, update, and return to the admin home anytime.</p>
          </div>
        </div>
        <div className="grid lg:grid-cols-3 gap-4 mb-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:col-span-2">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Student Spotlight</h3>
              <select
                value={spotlightStudent?.id || ''}
                onChange={(e) => setSpotlightStudentId(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {students.map((student) => (
                  <option key={student.id} value={student.id}>{student.name}</option>
                ))}
              </select>
            </div>

            {spotlightStudent ? (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-xs uppercase tracking-[0.16em] font-semibold text-blue-700 dark:text-blue-300">Current Student</p>
                  <h4 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-2">{spotlightStudent.name}</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{spotlightStudent.email}</p>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Component: <strong className="text-slate-900 dark:text-slate-100">{spotlightStudent.component}</strong></p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">Status: <strong className="text-slate-900 dark:text-slate-100">{spotlightStudent.status}</strong></p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-xs uppercase tracking-[0.16em] font-semibold text-emerald-700 dark:text-emerald-300">Quick Actions</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => bumpProgress(spotlightStudent.id, 10)} className="rounded-xl bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:opacity-95">+10% progress</button>
                    <button onClick={() => bumpProgress(spotlightStudent.id, -10)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">-10% progress</button>
                    <button onClick={() => updateStudent(spotlightStudent.id, { status: 'active' })} className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">Mark active</button>
                    <button onClick={() => updateStudent(spotlightStudent.id, { status: 'pending' })} className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">Mark pending</button>
                    <button onClick={() => updateStudent(spotlightStudent.id, { status: 'graduated', progress: 100 })} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Graduate</button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => assignSpotlightComponent('CWTS')} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">CWTS</button>
                    <button onClick={() => assignSpotlightComponent('CWTS (Coast Guard)')} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">CWTS Coast Guard</button>
                    <button onClick={() => assignSpotlightComponent('LTS')} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">LTS</button>
                    <button onClick={() => assignSpotlightComponent('MTS (Army)')} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">MTS Army</button>
                    <button onClick={() => assignSpotlightComponent('MTS (Navy)')} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">MTS Navy</button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">No student records available.</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">At-Risk Queue</h3>
            <div className="space-y-3">
              {highRiskStudents.length > 0 ? highRiskStudents.map((student) => (
                <button
                  key={student.id}
                  onClick={() => setSpotlightStudentId(student.id)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-800"
                >
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{student.name}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{student.progress}% • {student.component}</p>
                </button>
              )) : (
                <p className="text-sm text-slate-600 dark:text-slate-300">No at-risk students right now.</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-8 shadow-sm transition-all hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2">
              <UserRoundPlus className="w-4 h-4 text-blue-700 dark:text-blue-300" />
              Student Registration Approvals
            </h3>
            <span className="inline-flex rounded-lg bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-100">
              {pendingRegistrations.length} pending
            </span>
          </div>

          {pendingRegistrations.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">No pending student registration requests.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Student</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Student ID / Email</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Requested</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRegistrations.map((registration) => {
                    const isApproving = approvingRegistrationIds.includes(registration.id);
                    const approvalError = registrationApprovalErrors[registration.id];
                    return <tr key={registration.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-4 px-4 font-medium text-slate-900 dark:text-slate-100">{registration.name}</td>
                      <td className="py-4 px-4 text-slate-700 dark:text-slate-200">
                        <span className="block font-semibold">{registration.studentId || 'Legacy request - assign on approval'}</span>
                        <span className="text-sm text-slate-500 dark:text-slate-400">{registration.email}</span>
                      </td>
                      <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-300">{new Date(registration.createdAt).toLocaleString()}</td>
                      <td className="py-4 px-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            disabled={isApproving}
                            onClick={() => approveRegistration(registration)}
                            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100 dark:hover:bg-emerald-500/20"
                          >
                            {isApproving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                            {isApproving ? 'Approving…' : 'Approve'}
                          </button>
                          <button
                            disabled={isApproving}
                            onClick={() => rejectRegistration(registration.id)}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-rose-600 hover:bg-rose-50 transition-colors disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-200 dark:hover:bg-rose-500/10"
                          >
                            Reject
                          </button>
                        </div>
                        {approvalError && <p role="alert" className="mt-2 max-w-sm text-xs font-medium text-rose-700 dark:text-rose-300">{approvalError}</p>}
                      </td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Admin Dashboard</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">Full control over students, facilitators, assessments, and assignments.</p>
          </div>
          <button
            onClick={() => setView('assignments')}
            className="bg-gradient-to-r from-blue-700 to-yellow-500 text-white px-6 py-3 rounded-xl hover:opacity-95 hover:-translate-y-0.5 transition-all font-medium flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <ClipboardList className="w-5 h-5" />
            Open Grade Center
          </button>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-5 h-5 text-blue-700" />
              <span className="text-sm text-slate-600 dark:text-slate-300">Total Students</span>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{totalStudents}</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <span className="text-sm text-slate-600 dark:text-slate-300">Avg Progress</span>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{avgProgress}%</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <div className="flex items-center gap-3 mb-2">
              <Award className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-slate-600 dark:text-slate-300">Completion Rate</span>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{completionRate}%</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <div className="flex items-center gap-3 mb-2">
              <BookOpen className="w-5 h-5 text-yellow-600" />
              <span className="text-sm text-slate-600 dark:text-slate-300">Active Modules</span>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{modules.length}</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <div className="flex items-center gap-3 mb-2">
              <Siren className="w-5 h-5 text-rose-600" />
              <span className="text-sm text-slate-600 dark:text-slate-300">At-Risk Students</span>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{studentsNeedingSupport}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <div className="flex items-center gap-3 mb-2">
              <ClipboardList className="w-5 h-5 text-blue-700" />
              <span className="text-sm text-slate-600 dark:text-slate-300">Assessments Managed</span>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{assessments.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-5 h-5 text-emerald-600" />
              <span className="text-sm text-slate-600 dark:text-slate-300">Facilitator Accounts</span>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{facilitatorAccounts.length}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 mb-2"><Users className="w-4 h-4 text-blue-700" />Active</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{statusCounts.active}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 mb-2"><BadgeCheck className="w-4 h-4 text-amber-600" />Pending</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{statusCounts.pending}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 mb-2"><GraduationCap className="w-4 h-4 text-emerald-600" />Graduated</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{statusCounts.graduated}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 mb-2"><BarChart3 className="w-4 h-4 text-rose-600" />Roster Coverage</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">100%</div>
          </div>
        </div>

        {view === 'students' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm mb-8 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-6 grid lg:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950 lg:col-span-2">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Student Performance Snapshot</h4>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <LineChart data={progressTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                      <XAxis dataKey="name" />
                      <YAxis yAxisId="left" domain={[0, 100]} />
                      <YAxis yAxisId="right" orientation="right" domain={[0, 10]} />
                      <Tooltip />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="progress" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                      <Line yAxisId="right" type="monotone" dataKey="assessments" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Status Distribution</h4>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <PieChart>
                      <Pie data={statusChartData} dataKey="value" nameKey="name" outerRadius={70} label>
                        <Cell fill="#2563eb" />
                        <Cell fill="#f59e0b" />
                        <Cell fill="#10b981" />
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="mb-6 grid lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Component Enrollment</h4>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <BarChart data={componentChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#0f766e" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Progress Bands</h4>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <BarChart data={progressBandData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                      <XAxis dataKey="band" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="students" fill="#f97316" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Student Roster</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">Create, update, and delete student records from one place.</p>
              </div>
              <button
                onClick={startNewStudent}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-yellow-500 px-5 py-3 text-white font-medium hover:opacity-95 transition-opacity cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Student
              </button>
            </div>

            <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Bulk actions ({selectedStudentIds.length} selected)</p>
                <button onClick={toggleSelectAllVisible} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Select visible</button>
                <button onClick={() => setSelectedStudentIds([])} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Clear</button>
                <button onClick={() => applyBulkProgressDelta(10)} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100 dark:hover:bg-blue-500/20">+10% progress</button>
                <button onClick={() => applyBulkProgressDelta(-10)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">-10% progress</button>
                <button onClick={() => applyBulkPatch({ status: 'active' })} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100 dark:hover:bg-emerald-500/20">Set active</button>
                <button onClick={() => applyBulkPatch({ status: 'pending' })} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 dark:hover:bg-amber-500/20">Set pending</button>
                <button onClick={() => applyBulkPatch({ status: 'graduated', progress: 100 })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Set graduated</button>
                <select value={bulkComponent} onChange={(e) => setBulkComponent(toNstpComponent(e.target.value) ?? bulkComponent)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  <option value="CWTS">CWTS</option>
                  <option value="CWTS (Coast Guard)">CWTS (Coast Guard)</option>
                  <option value="LTS">LTS</option>
                  <option value="MTS (Army)">MTS (Army)</option>
                  <option value="MTS (Navy)">MTS (Navy)</option>
                </select>
                <button onClick={() => applyBulkPatch({ component: bulkComponent })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Apply component</button>
                <button onClick={() => exportStudentsCsv(filteredStudents)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"><FileDown className="w-4 h-4" />Export CSV</button>
                <button onClick={() => csvInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"><FileUp className="w-4 h-4" />Import CSV</button>
                <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportCsv} />
                <select onChange={(e) => applyFilterPreset(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" defaultValue="">
                  <option value="" disabled>Apply preset</option>
                  {filterPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.name}</option>
                  ))}
                </select>
                <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Preset name" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                <button onClick={saveCurrentFilterPreset} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Save preset</button>
                <button onClick={exportComplianceSnapshot} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"><FileDown className="w-4 h-4" />Compliance snapshot</button>
                {filterPresets.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {filterPresets.map((preset) => (
                      <div key={preset.id} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white pl-2 pr-1 py-1 dark:border-slate-700 dark:bg-slate-900">
                        <button onClick={() => applyFilterPreset(preset.id)} className="text-sm text-slate-700 hover:text-blue-700 dark:text-slate-200 dark:hover:text-blue-300">{preset.name}</button>
                        <button onClick={() => removeFilterPreset(preset.id)} className="rounded-md px-1.5 py-0.5 text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {studentForm && (
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 mb-6 dark:border-slate-700 dark:bg-slate-950">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">{editingStudentId === 'new' ? 'Create Student' : 'Edit Student'}</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-300">Admin can adjust identity, component, progress, and status directly.</p>
                  </div>
                  <button onClick={cancelStudentEdit} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                    <X className="w-4 h-4" />
                    Close
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <span>Name</span>
                    <input value={studentForm.name} onChange={(e) => updateForm('name', e.target.value)} placeholder="Enter your name" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <span>Student ID</span>
                    <input value={studentForm.studentId || ''} onChange={(e) => updateForm('studentId', e.target.value)} placeholder="Enter student ID" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <span>Surname</span>
                    <input value={studentForm.surname || ''} onChange={(e) => updateForm('surname', e.target.value)} placeholder="Enter surname" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <span>First Name</span>
                    <input value={studentForm.firstName || ''} onChange={(e) => updateForm('firstName', e.target.value)} placeholder="Enter first name" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <span>Middle Name</span>
                    <input value={studentForm.middleName || ''} onChange={(e) => updateForm('middleName', e.target.value)} placeholder="Enter middle name" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <span>Email</span>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input value={studentForm.email} onChange={(e) => updateForm('email', e.target.value)} placeholder="Enter your email" className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                    </div>
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <span>Degree Program</span>
                    <input value={studentForm.degreeProgram || ''} onChange={(e) => updateForm('degreeProgram', e.target.value)} placeholder="Enter degree program" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <span>Contact Number</span>
                    <input value={studentForm.contactNumber || ''} onChange={(e) => updateForm('contactNumber', e.target.value)} placeholder="Enter contact number" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <span>Component</span>
                    <select value={studentForm.component ?? ''} onChange={(e) => updateForm('component', toNstpComponent(e.target.value))} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                      <option value="">Not yet assigned</option>
                      <option value="CWTS">CWTS</option>
                      <option value="CWTS (Coast Guard)">CWTS (Coast Guard)</option>
                      <option value="LTS">LTS</option>
                      <option value="MTS (Army)">MTS (Army)</option>
                      <option value="MTS (Navy)">MTS (Navy)</option>
                    </select>
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <span>Status</span>
                    <select value={studentForm.status} onChange={(e) => updateForm('status', e.target.value as NstpStudent['status'])} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                      <option value="active">Active</option>
                      <option value="pending">Pending</option>
                      <option value="graduated">Graduated</option>
                    </select>
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <span>Progress</span>
                    <input type="number" min="0" max="100" value={studentForm.progress} onChange={(e) => updateForm('progress', Number(e.target.value))} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <span>Assessments Completed</span>
                    <input type="number" min="0" value={studentForm.assessments} onChange={(e) => updateForm('assessments', Number(e.target.value))} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200 md:col-span-2">
                    <span>Admin Notes</span>
                    <textarea value={studentForm.notes} onChange={(e) => updateForm('notes', e.target.value)} rows={3} placeholder="Enter notes (optional)" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </label>
                </div>

                <div className="flex flex-wrap justify-end gap-3 mt-5">
                  <button onClick={cancelStudentEdit} className="rounded-xl border border-slate-300 px-5 py-3 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                    Cancel
                  </button>
                  <button onClick={saveStudent} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-yellow-500 px-5 py-3 text-white font-medium hover:opacity-95 transition-opacity cursor-pointer">
                    <Save className="w-4 h-4" />
                    Save Student
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">Select</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">Student</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">Component</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">Progress</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id} className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-4">
                        <input type="checkbox" checked={selectedStudentIds.includes(student.id)} onChange={() => toggleStudentSelection(student.id)} className="h-4 w-4 rounded border-slate-300 text-blue-700" />
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-slate-100">{student.name}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-300">{student.email}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{student.notes || 'No notes yet.'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4"><span className="inline-flex rounded-lg bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700 dark:bg-blue-500/20 dark:text-blue-100">{student.component}</span></td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-28 rounded-full bg-slate-100 dark:bg-slate-700">
                            <div className="h-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-600" style={{ width: `${student.progress}%` }} />
                          </div>
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{student.progress}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-lg px-3 py-1 text-sm font-medium ${student.status === 'graduated' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100' : student.status === 'active' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-100' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-100'}`}>
                          {student.status}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => setStudentDetailId(student.id)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50 transition-all cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <Eye className="w-4 h-4" />
                            View
                          </button>
                          <button
                            onClick={() => startEditStudent(student)}
                            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-blue-700 hover:bg-blue-100 hover:-translate-y-0.5 transition-all cursor-pointer dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100 dark:hover:bg-blue-500/20"
                          >
                            <Pencil className="w-4 h-4" />
                            Edit
                          </button>
                          <button
                            onClick={() => requestDeleteStudent(student)}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-rose-600 hover:bg-rose-50 hover:-translate-y-0.5 transition-all dark:border-rose-900/50 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-500/10 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {students.length === 0 && (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-600 dark:border-slate-700 dark:text-slate-300">
                No student records exist yet. Add the first one from the button above.
              </div>
            )}
          </div>
        )}

        {studentDetail && (
          <div className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Student Detail</h3>
              <button onClick={() => setStudentDetailId(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Close</button>
            </div>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                <p className="text-slate-500 dark:text-slate-400">Name</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{studentDetail.name}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                <p className="text-slate-500 dark:text-slate-400">Email</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{studentDetail.email}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                <p className="text-slate-500 dark:text-slate-400">Component</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{studentDetail.component}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                <p className="text-slate-500 dark:text-slate-400">Status / Progress</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{studentDetail.status} • {studentDetail.progress}%</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950 md:col-span-2">
                <p className="text-slate-500 dark:text-slate-400">Notes</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">{studentDetail.notes || 'No notes.'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Component Distribution */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-8 shadow-sm transition-all hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <h3 className="font-semibold text-slate-900 mb-4">Student Distribution by Component</h3>
          <div className="grid grid-cols-4 gap-4">
            {Object.entries(componentCounts).map(([component, count]) => (
              <div key={component} className="text-center rounded-xl p-3 transition-all hover:bg-slate-50">
                <p className="text-2xl font-bold text-slate-900">{count}</p>
                <p className="text-sm text-slate-600">{component}</p>
                <div className="mt-2 bg-slate-100 rounded-full h-2 dark:bg-slate-700">
                  <div
                    className="bg-gradient-to-r from-amber-500 to-orange-600 h-2 rounded-full"
                    style={{ width: `${totalStudents === 0 ? 0 : (count / totalStudents) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Student List */}
        {view !== 'students' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm transition-all hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Student Management</h3>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search students..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="all">All Components</option>
                <option value="CWTS">CWTS</option>
                <option value="CWTS (Coast Guard)">CWTS (Coast Guard)</option>
                <option value="LTS">LTS</option>
                <option value="MTS (Army)">MTS (Army)</option>
                <option value="MTS (Navy)">MTS (Navy)</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="risk">Sort: Risk First</option>
                <option value="progress-high">Sort: Highest Progress</option>
                <option value="progress-low">Sort: Lowest Progress</option>
                <option value="name">Sort: Name</option>
                <option value="status">Sort: Status</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Student</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Component</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Progress</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Assessments</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Manage</th>
                </tr>
              </thead>
              <tbody>
                {studentsLoading ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={`dir-skeleton-${idx}`} className="border-b border-slate-100 dark:border-slate-800 animate-pulse">
                      <td className="py-4 px-4"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-32 mb-1" /><div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-24" /></td>
                      <td className="py-4 px-4"><div className="h-6 bg-slate-100 dark:bg-slate-800 rounded-lg w-20" /></td>
                      <td className="py-4 px-4"><div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full w-28" /></td>
                      <td className="py-4 px-4"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-12" /></td>
                      <td className="py-4 px-4"><div className="h-6 bg-slate-100 dark:bg-slate-800 rounded-lg w-20" /></td>
                      <td className="py-4 px-4"><div className="h-8 bg-slate-100 dark:bg-slate-800 rounded-xl w-24" /></td>
                    </tr>
                  ))
                ) : filteredStudents.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-sm text-slate-500">No students found.</td></tr>
                ) : (
                  filteredStudents.map((student) => (
                  <tr key={student.id} className="border-b border-slate-100 hover:bg-blue-50/70 transition-colors dark:border-slate-800 dark:hover:bg-slate-800/40">
                    <td className="py-4 px-4">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{student.name}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-300">{student.email}</p>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="inline-flex px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium dark:bg-blue-500/20 dark:text-blue-100">
                        {student.component}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-slate-100 rounded-full h-2 max-w-[120px] dark:bg-slate-700">
                          <div
                            className="bg-gradient-to-r from-amber-500 to-orange-600 h-2 rounded-full"
                            style={{ width: `${student.progress}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{student.progress}%</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-sm text-slate-700 dark:text-slate-200">{student.assessments}/{publishedAssessmentCount}</span>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex px-3 py-1 rounded-lg text-sm font-medium ${
                        student.progress === 100
                          ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-100'
                          : student.progress >= 70
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-100'
                          : 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-100'
                      }`}>
                        {student.progress === 100 ? 'Completed' : student.progress >= 70 ? 'On Track' : 'Needs Support'}
                      </span>
                      {student.progress < 70 && (
                        <div className="mt-2 inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-300">
                          <TriangleAlert className="w-3.5 h-3.5" />
                          Intervention recommended
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => startEditStudent(student)}
                          className="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 hover:-translate-y-0.5 transition-all dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100 dark:hover:bg-blue-500/20 cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => requestDeleteStudent(student)}
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 hover:-translate-y-0.5 transition-all dark:border-rose-900/50 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-500/10 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>

          {filteredStudents.length === 0 && (
            <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">No students match the current filters.</div>
          )}
        </div>
        )}

        <div className="mt-8 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm transition-all hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
            <Target className="w-4 h-4 text-amber-600" />
            Recommended Admin Actions
          </h3>
          <p className="text-sm text-slate-600">
            1) Prioritize students under 70% progress for advising sessions. 2) Assign peer mentors from top performers.
            3) Track component balancing weekly to keep CWTS, LTS, and MTS sections equitable.
          </p>
        </div>

        <div className="mt-8 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm transition-all hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-blue-700" />
              Admin Audit Log
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search action or detail"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <button onClick={exportAuditLogCsv} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                <FileDown className="w-4 h-4" />
                Export audit
              </button>
              <button onClick={clearAuditLog} className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20">
                <Trash2 className="w-4 h-4" />
                Clear audit
              </button>
            </div>
          </div>
          {filteredAuditLog.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">No recorded actions yet.</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-auto pr-1">
              {filteredAuditLog.slice(0, 20).map((entry) => (
                <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{entry.action}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{entry.detail}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{new Date(entry.at).toLocaleString()} • {entry.actor}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AccountSettingsSection({ profile, onProfileUpdated }: { profile: Record<string, any> | null; onProfileUpdated: () => void }) {
  const [name, setName] = useState(profile?.name || '');
  const [title, setTitle] = useState(profile?.data?.title || '');
  const [subtitle, setSubtitle] = useState(profile?.data?.subtitle || '');
  const [contactNumber, setContactNumber] = useState(profile?.data?.contactNumber || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setTitle(profile.data?.title || '');
      setSubtitle(profile.data?.subtitle || '');
      setContactNumber(profile.data?.contactNumber || '');
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await apiPut('/auth/me', {
        name,
        data: { title, subtitle, contactNumber },
      }, null);
      if (result) {
        setMessage({ type: 'success', text: 'Profile updated successfully.' });
        onProfileUpdated();
      } else {
        setMessage({ type: 'error', text: 'Failed to update profile.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to update profile.' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    setChangingPassword(true);
    setMessage(null);
    try {
      const result = await apiPut('/auth/me', { password: newPassword }, null);
      if (result) {
        setMessage({ type: 'success', text: 'Password changed successfully.' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMessage({ type: 'error', text: 'Failed to change password.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to change password.' });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-500 p-6 text-white shadow-lg shadow-blue-900/20">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-100">Administration</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Account Settings</h2>
            <p className="mt-2 max-w-2xl text-sm text-blue-50">Manage your profile information and password.</p>
          </div>
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/15 backdrop-blur">
            <ShieldCheck className="h-8 w-8" />
          </div>
        </div>
      </div>

      {message && (
        <div className={`rounded-xl border p-4 text-sm ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300'}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            <UserCog className="h-5 w-5 text-blue-600" />
            Profile Information
          </h3>

          <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
            <span>Display Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
          </label>

          <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
            <span>Email</span>
            <input value={profile?.email || ''} disabled className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400" />
            <p className="text-xs text-slate-400">Email cannot be changed.</p>
          </label>

          <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
            <span>Title (shown in sidebar)</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="NSTP Director" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
          </label>

          <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
            <span>Subtitle (shown in sidebar)</span>
            <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Office of the National Service Training Program" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
          </label>

          <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
            <span>Contact Number</span>
            <input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} placeholder="09xxxxxxxxx" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
          </label>

          <div className="flex gap-3 pt-2">
            <button onClick={handleSaveProfile} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            Change Password
          </h3>

          <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
            <span>Current Password</span>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
          </label>

          <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
            <span>New Password</span>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
          </label>

          <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
            <span>Confirm New Password</span>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
          </label>

          <div className="flex gap-3 pt-2">
            <button onClick={handleChangePassword} disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-60">
              {changingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {changingPassword ? 'Changing...' : 'Update Password'}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
        <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Preview</h4>
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-700 text-sm font-semibold text-white">
            {name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title || name || 'Your Title'}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle || 'Your Role'}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function CoordinatorManagementView({ admin, coordinators, onRefresh }: { admin: NstpAccount; coordinators: NstpAccount[]; onRefresh: () => void }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCoord, setEditingCoord] = useState<NstpAccount | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [managedCoordinators, setManagedCoordinators] = useState<CoordinatorRecord[]>([]);
  const [coordinatorSearch, setCoordinatorSearch] = useState('');
  const [coordinatorLoading, setCoordinatorLoading] = useState(true);
  const [coordinatorSaving, setCoordinatorSaving] = useState(false);

  const refreshCoordinators = async () => {
    setCoordinatorLoading(true);
    try {
      const result = await fetchAdminCoordinators({ search: coordinatorSearch || undefined, pageSize: 100 });
      setManagedCoordinators(result.items);
      setSaveError(null);
      onRefresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to load coordinators.');
    } finally {
      setCoordinatorLoading(false);
    }
  };

  useEffect(() => { void refreshCoordinators(); }, [coordinatorSearch]);

  const openNew = () => {
    setEditingCoord({
      id: 'new-coordinator',
      name: '', email: '', password: '', role: 'coordinator',
      employeeNumber: `COORD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      contactNumber: '',
      title: '',
    } as NstpAccount);
    setEditorOpen(true);
  };

  const openEdit = (c: CoordinatorRecord) => {
    setEditingCoord({
      id: c.id, name: c.name, email: c.email, password: '', role: 'coordinator',
      employeeNumber: c.employeeNumber, contactNumber: c.contactNumber, title: c.title,
      coordinatorScope: c.scope, accountStatus: c.status,
    });
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!editingCoord) return;
    setSaveError(null);
    if (!editingCoord.name.trim() || !editingCoord.email.trim() || !editingCoord.employeeNumber?.trim() || !editingCoord.coordinatorScope) {
      setSaveError('Name, email, employee number, and coordinator program are required.');
      return;
    }
    const creating = editingCoord.id === 'new-coordinator';
    if (creating && editingCoord.password.length < 8) {
      setSaveError('Enter a provisioning password of at least 8 characters.');
      return;
    }
    setCoordinatorSaving(true);
    try {
      const payload = {
        name: editingCoord.name.trim(), email: editingCoord.email.trim().toLowerCase(),
        employeeNumber: editingCoord.employeeNumber.trim(), title: editingCoord.title?.trim() || '',
        contactNumber: editingCoord.contactNumber?.trim() || '', scope: editingCoord.coordinatorScope,
        ...(editingCoord.password ? { password: editingCoord.password } : {}),
      };
      if (creating) await createCoordinator(payload as typeof payload & { password: string });
      else await updateCoordinator(editingCoord.id, payload);
      toast.success(creating ? 'Coordinator created successfully.' : 'Coordinator updated successfully.');
      setEditorOpen(false);
      setEditingCoord(null);
      await refreshCoordinators();
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to create account on server.';
      setSaveError(msg);
    } finally {
      setCoordinatorSaving(false);
    }
  };

  const handleStatusChange = async (coordinator: CoordinatorRecord) => {
    const nextStatus = coordinator.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    if (!window.confirm(`${nextStatus === 'SUSPENDED' ? 'Suspend' : 'Reactivate'} ${coordinator.name}?`)) return;
    try {
      await setCoordinatorStatus(coordinator.id, nextStatus);
      toast.success(`Coordinator ${nextStatus === 'ACTIVE' ? 'reactivated' : 'suspended'}.`);
      await refreshCoordinators();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to update coordinator status.');
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Coordinator Module</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">Coordinator Management</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Create and manage coordinator accounts. Assign each coordinator an NSTP component.</p>
        </div>
        <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800">
          <Plus className="h-4 w-4" /> New Coordinator
        </button>
      </div>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={coordinatorSearch} onChange={(event) => setCoordinatorSearch(event.target.value)} placeholder="Search coordinators…" aria-label="Search coordinators" className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 text-sm dark:border-slate-700 dark:bg-slate-950" />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Coordinator</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Program</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {managedCoordinators.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-blue-50/60 dark:border-slate-800 dark:hover:bg-slate-900">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-amber-50 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
                      {c.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">{c.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{c.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">{c.scope}</span>
                </td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${c.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{c.status === 'ACTIVE' ? 'Active' : 'Suspended'}</span></td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(c)} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-700 hover:bg-blue-50 dark:border-slate-700 dark:text-slate-100"><Pencil className="h-4 w-4" /></button>
                    <button title={c.status === 'ACTIVE' ? 'Suspend coordinator' : 'Reactivate coordinator'} onClick={() => handleStatusChange(c)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200">{c.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</button>
                  </div>
                </td>
              </tr>
            ))}
            {!coordinatorLoading && managedCoordinators.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No coordinators found.</td></tr>}
            {coordinatorLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">Loading coordinators…</td></tr>}
          </tbody>
        </table>
      </div>

      {editorOpen && editingCoord && (
        <div className="fixed inset-0 z-50 grid items-start justify-center overflow-y-auto bg-slate-950/50 px-4 pb-10 pt-10 md:pt-16">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">{editingCoord.id === 'new-coordinator' ? 'Create' : 'Edit'} Coordinator</p>
                <h3 className="text-xl font-semibold text-slate-950 dark:text-white">Coordinator Details</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Set up login credentials and assign an NSTP component.</p>
              </div>
              <button onClick={() => { setEditorOpen(false); setEditingCoord(null); }} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Name</span>
                <input value={editingCoord.name} onChange={(e) => setEditingCoord({ ...editingCoord, name: e.target.value })} placeholder="Enter coordinator name" className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Title</span>
                <input value={editingCoord.title || ''} onChange={(e) => setEditingCoord({ ...editingCoord, title: e.target.value })} placeholder="e.g. NSTP Coordinator" className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Email</span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={editingCoord.email} onChange={(e) => setEditingCoord({ ...editingCoord, email: e.target.value })} placeholder="coordinator@bipsu.edu.ph" className="w-full rounded-xl border border-blue-200 px-4 py-3 pl-9 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Employee Number</span>
                <div className="relative">
                  <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={editingCoord.employeeNumber || ''} onChange={(e) => setEditingCoord({ ...editingCoord, employeeNumber: e.target.value })} placeholder="COORD-001" className="w-full rounded-xl border border-blue-200 px-4 py-3 pl-9 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{editingCoord.id === 'new-coordinator' ? 'Provisioning Password' : 'New Password (optional)'}</span>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input type={showPassword ? 'text' : 'password'} value={editingCoord.password} onChange={(e) => setEditingCoord({ ...editingCoord, password: e.target.value })} placeholder={editingCoord.id === 'new-coordinator' ? 'At least 8 characters' : 'Leave blank to keep current password'} className="w-full rounded-xl border border-blue-200 px-4 py-3 pl-9 pr-12 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <button type="button" onClick={() => setShowPassword((p) => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" tabIndex={-1}>
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Contact Number</span>
                <input value={editingCoord.contactNumber || ''} onChange={(e) => setEditingCoord({ ...editingCoord, contactNumber: e.target.value })} placeholder="09xxxxxxxxx" className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Coordinator Program</span>
                <select value={editingCoord.coordinatorScope || ''} onChange={(e) => setEditingCoord({ ...editingCoord, coordinatorScope: e.target.value as CoordinatorScope })} className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  <option value="" disabled>Select a coordinator program</option>
                  <option value="CWTS">CWTS — manages CWTS and CWTS Coast Guard</option>
                  <option value="MTS">MTS — manages MTS Army and MTS Navy</option>
                  <option value="LTS">LTS — manages LTS</option>
                </select>
              </label>
            </div>
            {saveError && <p className="text-sm text-amber-600 dark:text-amber-400">{saveError}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => { setEditorOpen(false); setEditingCoord(null); }} className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200">Cancel</button>
              <button disabled={coordinatorSaving} onClick={handleSave} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"><Save className="h-4 w-4" /> {coordinatorSaving ? 'Saving…' : 'Save Coordinator'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
