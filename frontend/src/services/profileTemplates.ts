import { apiDel, apiGet, apiPost } from './apiClient';

export type ProfileExportConfiguration = {
  layout: 'classic' | 'compact' | 'formal';
  pageSize: 'a4' | 'letter';
  orientation: 'portrait' | 'landscape';
  republicLine: string;
  schoolName: string;
  certificationLine: string;
  officeName: string;
  formTitle: string;
  academicPeriod: string;
  fieldHeader: string;
  valueHeader: string;
  accentColor: string;
  leftCopyLabel: string;
  rightCopyLabel: string;
  studentSignatureLabel: string;
  signatoryName: string;
  signatoryTitle: string;
  headerImageDataUrl?: string;
  headerImageName?: string;
  signatureSpacing: number;
  fieldOrder: string[];
  selectedFields?: string[];
  showFieldBorders: boolean;
  repeatHeader: boolean;
};

export type ProfileTemplateVersion = {
  id: string;
  name: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED';
  isActive: boolean;
  configuration: ProfileExportConfiguration;
  createdAt: string;
  updatedAt: string;
};

type TemplateCollection = {
  active: ProfileTemplateVersion | null;
  latestDraft: ProfileTemplateVersion | null;
  versions: ProfileTemplateVersion[];
};
type ApiEnvelope<T> = { success: boolean; data: T };

const PROFILE_FIELDS = new Set([
  'surname', 'firstName', 'middleName', 'school', 'degreeProgram', 'yearLevel', 'major',
  'gender', 'birthdate', 'houseStreetPurok', 'barangay', 'currentAddress',
  'provincialAddress', 'municipality', 'province', 'contactNumber', 'email', 'studentId',
]);
const CONFIGURATION_KEYS = new Set([
  'layout', 'pageSize', 'orientation', 'republicLine', 'schoolName', 'certificationLine',
  'officeName', 'formTitle', 'academicPeriod', 'fieldHeader', 'valueHeader', 'accentColor',
  'leftCopyLabel', 'rightCopyLabel', 'studentSignatureLabel', 'signatoryName', 'signatoryTitle',
  'headerImageDataUrl', 'headerImageName', 'signatureSpacing', 'fieldOrder', 'selectedFields', 'showFieldBorders', 'repeatHeader',
]);

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const validText = (value: unknown, max: number, required = true) => typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);

export function validateProfileConfiguration(value: unknown): ProfileExportConfiguration {
  if (!isRecord(value)) throw new Error('Template configuration must be an object.');
  const unknownKey = Object.keys(value).find((key) => !CONFIGURATION_KEYS.has(key));
  if (unknownKey) throw new Error(`Unsupported template property: ${unknownKey}`);
  if (!['classic', 'compact', 'formal'].includes(String(value.layout))) throw new Error('Unsupported template layout.');
  if (!['a4', 'letter'].includes(String(value.pageSize))) throw new Error('Unsupported page size.');
  if (!['portrait', 'landscape'].includes(String(value.orientation))) throw new Error('Unsupported page orientation.');
  const requiredText: Array<[string, number]> = [
    ['republicLine', 200], ['schoolName', 200], ['officeName', 200], ['formTitle', 150],
    ['academicPeriod', 150], ['fieldHeader', 100], ['valueHeader', 100],
    ['signatoryName', 150], ['signatoryTitle', 150],
  ];
  for (const [key, max] of requiredText) if (!validText(value[key], max)) throw new Error(`Invalid ${key} value.`);
  for (const key of ['certificationLine', 'leftCopyLabel', 'rightCopyLabel', 'studentSignatureLabel']) {
    if (!validText(value[key], 150, false)) throw new Error(`Invalid ${key} value.`);
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(String(value.accentColor))) throw new Error('Accent color must be a six-digit hex color.');
  if (!Number.isInteger(Number(value.signatureSpacing)) || Number(value.signatureSpacing) < 20 || Number(value.signatureSpacing) > 160) throw new Error('Signature spacing must be between 20 and 160.');
  if (typeof value.showFieldBorders !== 'boolean' || typeof value.repeatHeader !== 'boolean') throw new Error('Invalid template display options.');
  if (!Array.isArray(value.fieldOrder) && Array.isArray(value.selectedFields)) {
    (value as Record<string, unknown>).fieldOrder = value.selectedFields;
  }
  if (!Array.isArray(value.fieldOrder) || value.fieldOrder.length < 1 || value.fieldOrder.length > PROFILE_FIELDS.size) throw new Error('Invalid profile field order.');
  if (new Set(value.fieldOrder).size !== value.fieldOrder.length || value.fieldOrder.some((field) => typeof field !== 'string' || !PROFILE_FIELDS.has(field))) throw new Error('Profile fields must be recognized and unique.');
  if (value.selectedFields !== undefined && (!Array.isArray(value.selectedFields) || value.selectedFields.some((field) => typeof field !== 'string' || !PROFILE_FIELDS.has(field)))) {
    throw new Error('Profile fields must be recognized and unique.');
  }
  if (value.headerImageDataUrl !== undefined) {
    if (!validText(value.headerImageDataUrl, 750_000) || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(String(value.headerImageDataUrl))) throw new Error('Header image must be a PNG or JPEG under the allowed size.');
  }
  if (value.headerImageName !== undefined && !validText(value.headerImageName, 255, false)) throw new Error('Invalid header image name.');
  return value as ProfileExportConfiguration;
}

export function createTemplateBackup(configuration: ProfileExportConfiguration, templateName = 'Official Student Profile') {
  return { schemaVersion: 1, templateName, exportedAt: new Date().toISOString(), configuration };
}

export function parseTemplateBackup(value: unknown): { templateName: string; configuration: ProfileExportConfiguration } {
  if (!isRecord(value) || value.schemaVersion !== 1 || !validText(value.templateName, 120)) throw new Error('Unsupported template backup format.');
  const allowed = new Set(['schemaVersion', 'templateName', 'exportedAt', 'configuration']);
  const unknownKey = Object.keys(value).find((key) => !allowed.has(key));
  if (unknownKey) throw new Error(`Unsupported backup property: ${unknownKey}`);
  return { templateName: String(value.templateName), configuration: validateProfileConfiguration(value.configuration) };
}

export async function fetchProfileTemplates() {
  return (await apiGet<ApiEnvelope<TemplateCollection>>('/nstp/admin/profile-templates')).data;
}

export async function saveProfileTemplateDraft(name: string, configuration: ProfileExportConfiguration) {
  return (await apiPost<ApiEnvelope<ProfileTemplateVersion>>('/nstp/admin/profile-templates', { name, configuration })).data;
}

export async function publishProfileTemplate(id: string) {
  return (await apiPost<ApiEnvelope<ProfileTemplateVersion>>(`/nstp/admin/profile-templates/${encodeURIComponent(id)}/publish`, {})).data;
}

export async function activateProfileTemplate(id: string) {
  return (await apiPost<ApiEnvelope<ProfileTemplateVersion>>(`/nstp/admin/profile-templates/${encodeURIComponent(id)}/activate`, {})).data;
}

export async function duplicateProfileTemplate(id: string) {
  return (await apiPost<ApiEnvelope<ProfileTemplateVersion>>(`/nstp/admin/profile-templates/${encodeURIComponent(id)}/duplicate`, {})).data;
}

export async function deleteProfileTemplateDraft(id: string) {
  return (await apiDel<ApiEnvelope<{ id: string }>>(`/nstp/admin/profile-templates/${encodeURIComponent(id)}`)).data;
}

export async function recordProfileExport(studentId: string, format: 'PRINT' | 'PDF' | 'DOCX') {
  return (await apiPost<ApiEnvelope<{ recorded: true }>>('/nstp/admin/profile-templates/export-events', { studentId, format })).data;
}
