import { apiGet, apiPatch, apiPost } from './apiClient';
import type { BiliranMunicipality, CoordinatorScope, NstpAccount, NstpComponent, StaffAccountStatus } from '../data/nstpData';

type ApiEnvelope<T> = { success: boolean; data: T };

export type CoordinatorRecord = {
  id: string;
  profileId: string;
  name: string;
  email: string;
  status: StaffAccountStatus;
  employeeNumber: string;
  scope: CoordinatorScope;
  title: string;
  contactNumber: string;
  facilitatorCount: number;
  createdAt: string;
  updatedAt: string;
};

export type FacilitatorRecord = {
  id: string;
  profileId: string;
  name: string;
  email: string;
  status: StaffAccountStatus;
  employeeNumber: string;
  title: string;
  contactNumber: string;
  componentId: string;
  component: 'CWTS' | 'LTS' | 'MTS_ARMY' | 'MTS_NAVY' | 'CWTS_COAST_GUARD';
  componentName: string;
  municipalities: BiliranMunicipality[];
  createdAt: string;
  updatedAt: string;
};

export type StaffIdentityInput = {
  name: string;
  email: string;
  employeeNumber: string;
  title?: string;
  contactNumber?: string;
  password?: string;
};

export type CoordinatorInput = StaffIdentityInput & { scope: CoordinatorScope };
export type FacilitatorInput = StaffIdentityInput & {
  component: FacilitatorRecord['component'];
  municipalities: BiliranMunicipality[];
};

/**
 * DISPLAY-ONLY metadata: which component options a coordinator of each program is
 * *offered* in a form, and which labels the dashboards print.
 *
 * This map grants nothing. The authorization authority is
 * `COORDINATOR_SCOPE_TYPES` in `backend/src/modules/staff/staff.service.js`; the
 * server re-derives the coordinator's components from the database on every
 * request (`getCurrentCoordinator`) and re-checks each write against that map
 * (`requireAllowedComponent`), so editing this list in the browser produces a 403
 * rather than access to another program.
 *
 * The duplication is deliberate — sharing one file would either ship server
 * authorization code to the browser or make the server read from the frontend
 * workspace, and the frontend must never be treated as authorization authority.
 * `backend/test/scope-mapping-drift.test.js` compares the two as text and fails
 * if they diverge.
 */
export const SCOPE_COMPONENT_TYPES: Record<CoordinatorScope, FacilitatorRecord['component'][]> = {
  CWTS: ['CWTS', 'CWTS_COAST_GUARD'],
  MTS: ['MTS_ARMY', 'MTS_NAVY'],
  LTS: ['LTS'],
};

export const COMPONENT_TYPE_LABELS: Record<FacilitatorRecord['component'], NstpComponent> = {
  CWTS: 'CWTS', LTS: 'LTS', MTS_ARMY: 'MTS (Army)', MTS_NAVY: 'MTS (Navy)', CWTS_COAST_GUARD: 'CWTS (Coast Guard)',
};

/**
 * Adapts a coordinator-scoped facilitator record to the `NstpAccount` shape the
 * shared dashboards and report tables render. Kept here rather than in each
 * screen so the two coordinator surfaces cannot disagree on the component label
 * or the status field. No password is ever carried over.
 */
export function facilitatorRecordToAccount(facilitator: FacilitatorRecord): NstpAccount {
  return {
    id: facilitator.id,
    name: facilitator.name,
    email: facilitator.email,
    password: '',
    role: 'facilitator',
    employeeNumber: facilitator.employeeNumber,
    title: facilitator.title,
    contactNumber: facilitator.contactNumber,
    componentId: facilitator.componentId,
    component: COMPONENT_TYPE_LABELS[facilitator.component],
    municipalities: facilitator.municipalities,
    accountStatus: facilitator.status,
  };
}

export async function fetchAdminCoordinators(filters: { search?: string; scope?: CoordinatorScope; status?: StaffAccountStatus; page?: number; pageSize?: number } = {}) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); });
  return (await apiGet<ApiEnvelope<{ items: CoordinatorRecord[]; pagination: { page: number; pageSize: number; total: number; pages: number } }>>(`/nstp/admin/coordinators?${query}`)).data;
}

export async function createCoordinator(input: CoordinatorInput & { password: string }) {
  return (await apiPost<ApiEnvelope<CoordinatorRecord>>('/nstp/admin/coordinators', input)).data;
}

export async function updateCoordinator(id: string, input: Partial<CoordinatorInput>) {
  return (await apiPatch<ApiEnvelope<CoordinatorRecord>>(`/nstp/admin/coordinators/${encodeURIComponent(id)}`, input)).data;
}

export async function setCoordinatorStatus(id: string, status: StaffAccountStatus) {
  return (await apiPost<ApiEnvelope<{ id: string; status: StaffAccountStatus }>>(`/nstp/admin/coordinators/${encodeURIComponent(id)}/${status === 'ACTIVE' ? 'reactivate' : 'suspend'}`, {})).data;
}

export async function fetchMyFacilitators() {
  return (await apiGet<ApiEnvelope<FacilitatorRecord[]>>('/nstp/coordinators/facilitators')).data;
}

export async function createMyFacilitator(input: FacilitatorInput & { password: string }) {
  return (await apiPost<ApiEnvelope<FacilitatorRecord>>('/nstp/coordinators/facilitators', input)).data;
}

export async function updateMyFacilitator(id: string, input: Partial<FacilitatorInput>) {
  return (await apiPatch<ApiEnvelope<FacilitatorRecord>>(`/nstp/coordinators/facilitators/${encodeURIComponent(id)}`, input)).data;
}

export async function setMyFacilitatorStatus(id: string, status: StaffAccountStatus) {
  return (await apiPost<ApiEnvelope<{ id: string; status: StaffAccountStatus }>>(`/nstp/coordinators/facilitators/${encodeURIComponent(id)}/${status === 'ACTIVE' ? 'reactivate' : 'suspend'}`, {})).data;
}
