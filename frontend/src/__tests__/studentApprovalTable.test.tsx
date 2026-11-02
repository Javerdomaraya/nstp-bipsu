import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StudentApprovalTable from '../features/admin/components/StudentApprovalTable';
import type { PendingStudentRegistration, NstpAccount } from '../data/nstpData';

const BASE_REG: PendingStudentRegistration = {
  id: 'pending-1',
  name: 'Juan Dela Cruz',
  email: 'juan@bipsu.edu.ph',
  studentId: '2024-00001',
  degreeProgram: 'BS in Computer Science',
  yearLevel: '1st Year',
  major: '',
  municipality: 'Naval',
  assignedMunicipality: 'Naval',
  createdAt: '2026-01-15T08:00:00.000Z',
};

const FACILITATOR: NstpAccount = {
  id: 'fac-1',
  name: 'Maria Santos',
  email: 'maria@bipsu.edu.ph',
  password: '',
  role: 'facilitator',
  municipalities: ['Naval'],
};

describe('StudentApprovalTable', () => {
  it('renders skeleton when isLoading=true', () => {
    const html = renderToStaticMarkup(
      <StudentApprovalTable
        pendingRegistrations={[]}
        facilitatorAccounts={[]}
        isLoading
        approvingRegistrationIds={[]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(html).toContain('rounded-2xl');
    expect(html).not.toContain('Juan Dela Cruz');
  });

  it('renders empty state when there are no pending registrations', () => {
    const html = renderToStaticMarkup(
      <StudentApprovalTable
        pendingRegistrations={[]}
        facilitatorAccounts={[]}
        isLoading={false}
        approvingRegistrationIds={[]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(html).toContain('No Pending Student Approvals');
    expect(html).not.toContain('Approve');
  });

  it('renders student name, id, and program', () => {
    const html = renderToStaticMarkup(
      <StudentApprovalTable
        pendingRegistrations={[BASE_REG]}
        facilitatorAccounts={[FACILITATOR]}
        isLoading={false}
        approvingRegistrationIds={[]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(html).toContain('Juan Dela Cruz');
    expect(html).toContain('2024-00001');
    expect(html).toContain('BS in Computer Science');
    expect(html).toContain('1st Year');
    expect(html).toContain('Naval');
  });

  it('shows the assigned facilitator name when a match exists', () => {
    const html = renderToStaticMarkup(
      <StudentApprovalTable
        pendingRegistrations={[BASE_REG]}
        facilitatorAccounts={[FACILITATOR]}
        isLoading={false}
        approvingRegistrationIds={[]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(html).toContain('Maria Santos');
    expect(html).not.toContain('Unassigned');
  });

  it('shows Unassigned when no facilitator covers the municipality', () => {
    const html = renderToStaticMarkup(
      <StudentApprovalTable
        pendingRegistrations={[{ ...BASE_REG, municipality: 'Caibiran', assignedMunicipality: 'Caibiran' }]}
        facilitatorAccounts={[FACILITATOR]}
        isLoading={false}
        approvingRegistrationIds={[]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(html).toContain('Unassigned');
  });

  it('renders both desktop table and mobile card sections', () => {
    const html = renderToStaticMarkup(
      <StudentApprovalTable
        pendingRegistrations={[BASE_REG]}
        facilitatorAccounts={[]}
        isLoading={false}
        approvingRegistrationIds={[]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(html).toContain('hidden md:block');
    expect(html).toContain('md:hidden');
  });

  it('renders approve and reject buttons for each registration', () => {
    const html = renderToStaticMarkup(
      <StudentApprovalTable
        pendingRegistrations={[BASE_REG]}
        facilitatorAccounts={[]}
        isLoading={false}
        approvingRegistrationIds={[]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    // Desktop table + mobile card each have approve/reject — at least 2 each
    const approveCount = (html.match(/Approve/g) || []).length;
    const rejectCount = (html.match(/Reject/g) || []).length;
    expect(approveCount).toBeGreaterThanOrEqual(2);
    expect(rejectCount).toBeGreaterThanOrEqual(2);
  });

  it('renders "Approving…" spinner when registration id is in approvingRegistrationIds', () => {
    const html = renderToStaticMarkup(
      <StudentApprovalTable
        pendingRegistrations={[BASE_REG]}
        facilitatorAccounts={[]}
        isLoading={false}
        approvingRegistrationIds={['pending-1']}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(html).toContain('Approving\u2026');
    expect(html).toContain('animate-spin');
  });

  it('renders two-letter initials avatar for multi-word names', () => {
    const html = renderToStaticMarkup(
      <StudentApprovalTable
        pendingRegistrations={[BASE_REG]}
        facilitatorAccounts={[]}
        isLoading={false}
        approvingRegistrationIds={[]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    // getInitials('Juan Dela Cruz') → 'J' + 'C' = 'JC'
    expect(html).toContain('JC');
  });

  it('renders two-letter initials for single-word names', () => {
    const html = renderToStaticMarkup(
      <StudentApprovalTable
        pendingRegistrations={[{ ...BASE_REG, name: 'Madonna' }]}
        facilitatorAccounts={[]}
        isLoading={false}
        approvingRegistrationIds={[]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    // getInitials('Madonna') → 'MA'
    expect(html).toContain('MA');
  });

  it('falls back to "General Track" when degreeProgram is empty', () => {
    const html = renderToStaticMarkup(
      <StudentApprovalTable
        pendingRegistrations={[{ ...BASE_REG, degreeProgram: '' }]}
        facilitatorAccounts={[]}
        isLoading={false}
        approvingRegistrationIds={[]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(html).toContain('General Track');
  });

  it('renders formatted submission date (MM/DD/YYYY) in desktop table', () => {
    const html = renderToStaticMarkup(
      <StudentApprovalTable
        pendingRegistrations={[BASE_REG]}
        facilitatorAccounts={[]}
        isLoading={false}
        approvingRegistrationIds={[]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(html).toContain('01/15/2026');
  });
});
