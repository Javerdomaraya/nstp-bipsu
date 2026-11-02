import React, { useState } from 'react';
import {
  Check,
  X,
  Loader2,
  CalendarDays,
  MapPin,
  UserCheck,
  CheckCircle2,
} from 'lucide-react';
import TableSkeleton from '../../../components/common/skeletons/TableSkeleton';
import type { PendingStudentRegistration, NstpAccount } from '../../../data/nstpData';

export type StudentApprovalTableProps = {
  pendingRegistrations: PendingStudentRegistration[];
  facilitatorAccounts: NstpAccount[];
  isLoading?: boolean;
  approvingRegistrationIds: string[];
  onApprove: (registration: PendingStudentRegistration) => Promise<void>;
  onReject: (registrationId: string, reason?: string) => Promise<void>;
};

const getInitials = (name?: string) => {
  if (!name) return 'ST';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'ST';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export default function StudentApprovalTable({
  pendingRegistrations,
  facilitatorAccounts,
  isLoading = false,
  approvingRegistrationIds,
  onApprove,
  onReject,
}: StudentApprovalTableProps) {
  const [approvingRegistration, setApprovingRegistration] = useState<PendingStudentRegistration | null>(null);
  const [rejectingRegistration, setRejectingRegistration] = useState<PendingStudentRegistration | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <TableSkeleton columns={9} rows={4} hasHeader={false} />
      </div>
    );
  }

  if (pendingRegistrations.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-12 shadow-sm text-center dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="mt-3 text-base font-semibold text-slate-950 dark:text-white">
          No Pending Student Approvals
        </h3>
        <p className="mx-auto mt-1 max-w-sm text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          All student enrollment applications have been reviewed. New submissions will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      {/* Desktop & Tablet Table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[1050px] text-sm text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400">
              <th className="px-4 py-3.5">Student Name</th>
              <th className="px-4 py-3.5">Email / Student ID</th>
              <th className="px-4 py-3.5">Program</th>
              <th className="px-4 py-3.5">Year Level</th>
              <th className="px-4 py-3.5">Major</th>
              <th className="px-4 py-3.5">Municipality</th>
              <th className="px-4 py-3.5">Assigned Facilitator</th>
              <th className="px-4 py-3.5">Date Submitted</th>
              <th className="px-4 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {pendingRegistrations.map((registration) => {
              const targetMun = registration.assignedMunicipality || registration.municipality || 'Naval';
              const assignedFacilitator = facilitatorAccounts.find((a) => a.municipalities?.includes(targetMun));
              const isApproving = approvingRegistrationIds.includes(registration.id);

              return (
                <tr key={registration.id} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/40">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-800 font-semibold text-xs dark:bg-blue-900/40 dark:text-blue-300">
                        {getInitials(registration.name)}
                      </div>
                      <span className="font-semibold text-slate-950 dark:text-white break-words max-w-[200px]">
                        {registration.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="space-y-0.5">
                      <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {registration.studentId || 'Pending ID'}
                      </span>
                      <p className="text-xs text-slate-500 dark:text-slate-400 break-all">{registration.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center rounded-md border border-blue-200/70 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                      {registration.degreeProgram || 'General Track'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                    {registration.yearLevel || '1st Year'}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                    {registration.major && registration.major !== 'Not applicable' && registration.major !== '—' ? registration.major : '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      <MapPin className="h-3 w-3 text-slate-400" />
                      {targetMun}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                    {assignedFacilitator ? (
                      <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300">
                        <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                        {assignedFacilitator.name}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        Unassigned
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                    {new Date(registration.createdAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={isApproving}
                        onClick={() => setApprovingRegistration(registration)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                        title={`Approve ${registration.name}`}
                      >
                        {isApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        <span>{isApproving ? 'Approving…' : 'Approve'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={isApproving}
                        onClick={() => {
                          setRejectingRegistration(registration);
                          setRejectionReason('');
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white hover:bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-500/10 cursor-pointer"
                        title={`Reject ${registration.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Reject</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>

        </table>
      </div>
      {/* Mobile Cards (under md) */}
      <div className="md:hidden space-y-3 mt-4">
        {pendingRegistrations.map((registration) => {
          const targetMun = registration.assignedMunicipality || registration.municipality || 'Naval';
          const assignedFacilitator = facilitatorAccounts.find((a) => a.municipalities?.includes(targetMun));
          const isApproving = approvingRegistrationIds.includes(registration.id);

          return (
            <div key={registration.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-800 font-semibold text-xs dark:bg-blue-900/40 dark:text-blue-300">
                    {getInitials(registration.name)}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-950 dark:text-white text-sm">{registration.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{registration.email}</p>
                  </div>
                </div>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {registration.studentId || 'Pending ID'}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs border-t border-slate-200/60 pt-2.5 dark:border-slate-800">
                <div>
                  <p className="text-slate-400 text-[10px] uppercase font-semibold">Program</p>
                  <p className="font-medium text-slate-800 dark:text-slate-200 mt-0.5 truncate">{registration.degreeProgram || 'General Track'}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] uppercase font-semibold">Municipality</p>
                  <p className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{targetMun}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] uppercase font-semibold">Facilitator</p>
                  <p className="font-medium text-slate-800 dark:text-slate-200 mt-0.5 truncate">{assignedFacilitator?.name || 'Unassigned'}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] uppercase font-semibold">Date</p>
                  <p className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{new Date(registration.createdAt).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 border-t border-slate-200/60 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isApproving}
                  onClick={() => setApprovingRegistration(registration)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 py-2 text-xs font-semibold text-white shadow-xs transition active:scale-95 disabled:opacity-60 cursor-pointer"
                >
                  {isApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  <span>Approve</span>
                </button>
                <button
                  type="button"
                  disabled={isApproving}
                  onClick={() => {
                    setRejectingRegistration(registration);
                    setRejectionReason('');
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-300 bg-white hover:bg-rose-50 py-2 text-xs font-semibold text-rose-700 transition active:scale-95 disabled:opacity-60 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-300 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Reject</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Approve Confirmation Modal */}
      {approvingRegistration && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-xs"
          onClick={(e) => { if (e.target === e.currentTarget) setApprovingRegistration(null); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950">
            <h3 className="text-lg font-bold text-slate-950 dark:text-white">
              Approve Student Enrollment
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
              Are you sure you want to approve <strong className="text-slate-950 dark:text-white">{approvingRegistration.name}</strong> ({approvingRegistration.studentId || approvingRegistration.email}) for enrollment in <strong className="text-slate-950 dark:text-white">{approvingRegistration.degreeProgram || 'NSTP'}</strong>? Once approved, the student account will be officially activated.
            </p>
            <div className="flex justify-end gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => setApprovingRegistration(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={approvingRegistrationIds.includes(approvingRegistration.id)}
                onClick={async () => {
                  const reg = approvingRegistration;
                  setApprovingRegistration(null);
                  await onApprove(reg);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition active:scale-95 disabled:opacity-60 cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Confirm Approval</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Confirmation Modal */}
      {rejectingRegistration && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-xs"
          onClick={(e) => { if (e.target === e.currentTarget) setRejectingRegistration(null); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950">
            <h3 className="text-lg font-bold text-slate-950 dark:text-white">
              Reject Student Enrollment
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
              Are you sure you want to reject the enrollment application for <strong className="text-slate-950 dark:text-white">{rejectingRegistration.name}</strong>? This action will remove the request from the pending queue.
            </p>
            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Rejection Note / Reason (Optional)
              </label>
              <input
                type="text"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Incomplete requirements, invalid credentials"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>
            <div className="flex justify-end gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => setRejectingRegistration(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = rejectingRegistration.id;
                  const reason = rejectionReason;
                  setRejectingRegistration(null);
                  await onReject(id, reason);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                <span>Reject Application</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
