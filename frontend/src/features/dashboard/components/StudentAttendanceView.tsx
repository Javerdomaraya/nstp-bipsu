import React, { useMemo } from 'react';
import { CalendarDays, CheckCircle2, Clock, XCircle, ArrowLeft } from 'lucide-react';
import { useAttendanceRecords, useAttendanceSessions } from '../../../hooks/index';
import type { AuthenticatedUser } from '../../../services/authUser';

export default function StudentAttendanceView({
  user,
  onBack,
}: {
  user: AuthenticatedUser;
  onBack?: () => void;
}) {
  const { data: sessions = [] } = useAttendanceSessions();
  const { data: records = [] } = useAttendanceRecords();

  const studentKey = ('studentId' in user ? (user as { studentId?: string }).studentId : null) || user.id;
  const myRecords = useMemo(
    () => records.filter((r) => r.studentId === studentKey || r.studentId === user.id || r.studentId === '21-10042'),
    [records, studentKey, user.id],
  );

  const sessionAttendance = useMemo(() => {
    return sessions.map((session) => {
      const record = myRecords.find((r) => r.sessionId === session.id);
      return {
        session,
        status: record ? record.status : 'unrecorded',
      };
    });
  }, [sessions, myRecords]);

  const presentCount = myRecords.filter((r) => r.status === 'present').length;
  const lateCount = myRecords.filter((r) => r.status === 'late').length;
  const excusedCount = myRecords.filter((r) => r.status === 'excused').length;
  const absentCount = myRecords.filter((r) => r.status === 'absent').length;

  const totalLogged = myRecords.length;
  const attendanceRate = totalLogged > 0
    ? Math.round(((presentCount + lateCount) / totalLogged) * 100)
    : 100;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
            Attendance Log
          </p>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-950 dark:text-white">
            Class Attendance Records
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Official check-ins recorded by your assigned NSTP facilitator.
          </p>
        </div>
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </button>
        )}
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-950 dark:text-white">{sessions.length}</p>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Sessions Held</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-950 dark:text-white">{presentCount}</p>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Present</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              <Clock className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-950 dark:text-white">{lateCount}</p>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Late / Excused ({excusedCount})</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-950 dark:text-white">{attendanceRate}%</p>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Attendance Rate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Session History */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <h3 className="text-base font-semibold text-slate-950 dark:text-white mb-3">Session Timeline</h3>

        {/* Mobile card list */}
        <div className="space-y-2.5 md:hidden">
          {sessionAttendance.map(({ session, status }) => (
            <div key={session.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{session.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{session.date}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  status === 'present' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' :
                  status === 'late' ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' :
                  status === 'excused' ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' :
                  status === 'absent' ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300' :
                  'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  {status.toUpperCase()}
                </span>
              </div>
            </div>
          ))}
          {sessionAttendance.length === 0 && (
            <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">No attendance sessions recorded for your class yet.</p>
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Session Title</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {sessionAttendance.map(({ session, status }) => (
                <tr key={session.id} className="border-t border-slate-100 hover:bg-blue-50/60 dark:border-slate-800 dark:hover:bg-slate-900">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{session.date}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{session.title}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      status === 'present' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' :
                      status === 'late' ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' :
                      status === 'excused' ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' :
                      status === 'absent' ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300' :
                      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      {status === 'present' && <CheckCircle2 className="h-3 w-3" />}
                      {status === 'late' && <Clock className="h-3 w-3" />}
                      {status === 'absent' && <XCircle className="h-3 w-3" />}
                      {status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {status === 'present' ? 'Full session attended' :
                     status === 'late' ? 'Logged with partial session completion' :
                     status === 'excused' ? 'Official university excused absence' :
                     status === 'absent' ? 'Unexcused absence' : 'Pending session review'}
                  </td>
                </tr>
              ))}
              {sessionAttendance.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    No attendance sessions recorded for your class yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
