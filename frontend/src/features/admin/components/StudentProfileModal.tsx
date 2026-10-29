import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import {
  BadgeCheck,
  BookOpen,
  CalendarDays,
  FileDown,
  GraduationCap,
  IdCard,
  Mail,
  MapPin,
  Pencil,
  Phone,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react';
import type { NstpStudent } from '../../../data/nstpData';

type StudentProfileModalProps = {
  student: NstpStudent;
  onClose: () => void;
  onEdit: () => void;
  onExportPdf: () => void | Promise<void>;
  onExportDocx: () => void | Promise<void>;
};

type InfoItemProps = {
  icon: typeof Mail;
  label: string;
  value?: string | number | null;
};

const statusStyles: Record<string, { label: string; dot: string; className: string }> = {
  pending: {
    label: 'Pending Approval',
    dot: 'bg-amber-500',
    className: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
  },
  active: {
    label: 'Approved',
    dot: 'bg-emerald-500',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
  },
  approved: {
    label: 'Approved',
    dot: 'bg-emerald-500',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
  },
  graduated: {
    label: 'Completed',
    dot: 'bg-emerald-500',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
  },
  rejected: {
    label: 'Rejected',
    dot: 'bg-rose-500',
    className: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',
  },
  inactive: {
    label: 'Inactive',
    dot: 'bg-slate-400',
    className: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
  },
};

function getStatus(status: string) {
  return statusStyles[status.toLowerCase()] || {
    label: status || 'Not Available',
    dot: 'bg-slate-400',
    className: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
  };
}

function getInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'ST';
}

function StudentStatusBadge({ status }: { status: string }) {
  const presentation = getStatus(status);
  return (
    <span className={`inline-flex min-h-8 items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-200 ${presentation.className}`}>
      <span className={`h-2 w-2 rounded-full ${presentation.dot}`} aria-hidden="true" />
      {presentation.label}
    </span>
  );
}

function InfoItem({ icon: Icon, label, value }: InfoItemProps) {
  const hasValue = value !== undefined && value !== null && String(value).trim() !== '';
  return (
    <div className="flex min-w-0 items-start gap-3 py-2.5">
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200" aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</dt>
        <dd className={`mt-0.5 break-words text-sm ${hasValue ? 'font-semibold text-slate-950 dark:text-white' : 'font-medium text-slate-400 dark:text-slate-500'}`}>
          {hasValue ? value : 'Not Available'}
        </dd>
      </div>
    </div>
  );
}

function ProfileCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow duration-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-950 sm:p-5" aria-labelledby={`student-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
        <h3 id={`student-${title.toLowerCase().replace(/\s+/g, '-')}`} className="text-base font-semibold text-slate-950 dark:text-white">{title}</h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function StudentProfileHeader({ student, onClose, closeButtonRef }: { student: NstpStudent; onClose: () => void; closeButtonRef: React.RefObject<HTMLButtonElement | null> }) {
  return (
    <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-700 text-sm font-bold text-white shadow-sm sm:h-14 sm:w-14 sm:text-base" aria-hidden="true">
            {getInitials(student.name)}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Student Profile</p>
            <h2 id="student-profile-title" className="truncate text-xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-2xl">{student.name}</h2>
            <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
              <IdCard className="h-4 w-4" aria-hidden="true" />
              <span>{student.studentId || 'Student ID not available'}</span>
            </div>
          </div>
        </div>
        <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close student profile" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-950">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StudentStatusBadge status={student.status} />
        <span className="inline-flex min-h-8 items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">{student.component || 'Component not available'}</span>
        <span className="min-w-0 truncate text-sm font-medium text-slate-600 dark:text-slate-300">{student.degreeProgram || 'Degree program not available'}</span>
      </div>
    </header>
  );
}

export function StudentInformationSection({ student }: { student: NstpStudent }) {
  return (
    <ProfileCard title="Profile Information" description="Contact and location details">
      <dl className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
        <InfoItem icon={Mail} label="Email" value={student.email} />
        <InfoItem icon={Phone} label="Contact Number" value={student.contactNumber} />
        <InfoItem icon={MapPin} label="Municipality" value={student.municipality || student.assignedMunicipality} />
      </dl>
    </ProfileCard>
  );
}

export function StudentAcademicSection({ student }: { student: NstpStudent }) {
  return (
    <ProfileCard title="Academic Information" description="Program and NSTP assignment">
      <dl className="mt-2 grid divide-y divide-slate-100 dark:divide-slate-800 sm:grid-cols-2 sm:gap-x-5 sm:divide-y-0">
        <InfoItem icon={GraduationCap} label="School" value={student.school || student.department} />
        <InfoItem icon={GraduationCap} label="Degree Program" value={student.degreeProgram} />
        <InfoItem icon={CalendarDays} label="Year Level" value={student.yearLevel} />
        <InfoItem icon={BookOpen} label="Major" value={student.major} />
        <InfoItem icon={BadgeCheck} label="NSTP Component" value={student.component} />
        <div className="sm:col-span-2">
          <InfoItem icon={UserRound} label="Facilitator" value={student.facilitatorName} />
        </div>
      </dl>
    </ProfileCard>
  );
}

export function StudentProgressSection({ student }: { student: NstpStudent }) {
  const progress = Math.max(0, Math.min(100, Number(student.progress) || 0));
  return (
    <ProfileCard title="NSTP Progress" description="Current participation and completion standing">
      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem] md:items-center">
        <div>
          <div className="mb-2 flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300"><TrendingUp className="h-4 w-4 text-blue-700 dark:text-blue-300" aria-hidden="true" />Progress</span>
            <span className="text-sm font-semibold tabular-nums text-slate-950 dark:text-white">{progress}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-label="NSTP completion progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <div className="h-full rounded-full bg-blue-700 transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${progress}%` }} />
          </div>
          {progress === 0 && Number(student.assessments || 0) === 0 ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No activities completed yet.</p>
          ) : (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{student.assessments || 0} assessment{student.assessments === 1 ? '' : 's'} recorded.</p>
          )}
        </div>
        <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Status</p>
          <div className="mt-2"><StudentStatusBadge status={student.status} /></div>
        </div>
      </div>
    </ProfileCard>
  );
}

export function StudentProfileFooter({ student, onEdit, onExportPdf, onExportDocx }: Omit<StudentProfileModalProps, 'onClose'>) {
  return (
    <footer className="shrink-0 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:px-6">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button type="button" onClick={() => void onExportPdf()} aria-label={`Export ${student.name} profile as PDF`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
            <FileDown className="h-4 w-4" aria-hidden="true" />Export PDF
          </button>
          <button type="button" onClick={() => void onExportDocx()} aria-label={`Export ${student.name} profile as DOCX`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
            <FileDown className="h-4 w-4" aria-hidden="true" />Export DOCX
          </button>
        </div>
        <button type="button" onClick={onEdit} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950">
          <Pencil className="h-4 w-4" aria-hidden="true" />Edit Student
        </button>
      </div>
    </footer>
  );
}

export default function StudentProfileModal({ student, onClose, onEdit, onExportPdf, onExportDocx }: StudentProfileModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || []);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-2 backdrop-blur-[2px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 sm:p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="student-profile-title" onKeyDown={handleKeyDown} className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200 dark:border-slate-800 dark:bg-slate-900">
        <StudentProfileHeader student={student} onClose={onClose} closeButtonRef={closeButtonRef} />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <StudentInformationSection student={student} />
            <StudentAcademicSection student={student} />
            <div className="lg:col-span-2">
              <StudentProgressSection student={student} />
            </div>
          </div>
        </div>
        <StudentProfileFooter student={student} onEdit={onEdit} onExportPdf={onExportPdf} onExportDocx={onExportDocx} />
      </section>
    </div>
  );
}
