import { useEffect, useMemo, useState } from 'react';
import { Bell, Megaphone, Search, CheckCircle2, CircleAlert, Send } from 'lucide-react';
import { safeJsonParse } from '../../../data/nstpData';
import type { AuthenticatedUser } from '../../../services/authUser';

type NoticeAudience = 'all' | 'student' | 'admin' | 'facilitator';
type NoticePriority = 'normal' | 'high';

type Notice = {
  id: string;
  title: string;
  message: string;
  audience: NoticeAudience;
  priority: NoticePriority;
  createdBy: string;
  createdAt: string;
};

const NOTICE_KEY = 'nstp-system-notices';

const DEFAULT_DEMO_NOTICES: Notice[] = [
  {
    id: 'notice-admin-001',
    title: 'Welcome to BiPSU NSTP Academic Year 2025-2026',
    message: 'The Office of the National Service Training Program welcomes all enrolled first-year students to the CWTS, LTS, and MTS components. Please check your assigned training groups and orientation schedule.',
    audience: 'all',
    priority: 'high',
    createdBy: 'Dr. Reynold G. Bustillo (NSTP Director)',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
  },
  {
    id: 'notice-admin-002',
    title: 'Facilitators Coordination Meeting & Immersion Briefing',
    message: 'All designated CWTS and MTS facilitators are requested to attend the coordination meeting regarding municipal outreach deployment plans and CHED documentation standards.',
    audience: 'facilitator',
    priority: 'high',
    createdBy: 'Dr. Reynold G. Bustillo (NSTP Director)',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
  },
  {
    id: 'notice-inst-001',
    title: 'CWTS Field Immersion & First Aid Drill Preparation',
    message: 'All CWTS Section 1A and 1B students are required to wear proper NSTP shirts and bring hydration bottles for this Saturday disaster risk simulation workshop.',
    audience: 'student',
    priority: 'normal',
    createdBy: 'Engr. Juan Dela Cruz (CWTS Facilitator)',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
  },
];

export default function AnnouncementsCenter({ user }: { user: AuthenticatedUser }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [query, setQuery] = useState('');
  const [audienceFilter, setAudienceFilter] = useState<'all' | NoticeAudience>('all');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<NoticeAudience>('all');
  const [priority, setPriority] = useState<NoticePriority>('normal');

  const readKey = `nstp-notice-read-${user.id}`;
  const [readIds, setReadIds] = useState<string[]>([]);

  useEffect(() => {
    const rawNotices = localStorage.getItem(NOTICE_KEY);
    const savedNotices = safeJsonParse<Notice[]>(rawNotices, []);
    if (!savedNotices || savedNotices.length === 0) {
      localStorage.setItem(NOTICE_KEY, JSON.stringify(DEFAULT_DEMO_NOTICES));
      setNotices(DEFAULT_DEMO_NOTICES);
    } else {
      setNotices(savedNotices);
    }

    const savedReads = safeJsonParse<string[]>(localStorage.getItem(readKey), []);
    setReadIds(savedReads || []);
  }, [readKey]);

  const persistNotices = (next: Notice[]) => {
    localStorage.setItem(NOTICE_KEY, JSON.stringify(next));
    setNotices(next);
  };

  const persistReads = (next: string[]) => {
    localStorage.setItem(readKey, JSON.stringify(next));
    setReadIds(next);
  };

  const canPublish = user.role === 'admin' || user.role === 'facilitator';

  const visibleNotices = useMemo(() => {
    const lowered = query.trim().toLowerCase();

    return notices
      .filter((notice) => notice.audience === 'all' || notice.audience === user.role)
      .filter((notice) => (audienceFilter === 'all' ? true : notice.audience === audienceFilter))
      .filter((notice) => {
        if (!lowered) return true;
        return (
          notice.title.toLowerCase().includes(lowered) ||
          notice.message.toLowerCase().includes(lowered) ||
          notice.createdBy.toLowerCase().includes(lowered)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [notices, user.role, audienceFilter, query]);

  const unreadCount = visibleNotices.filter((notice) => !readIds.includes(notice.id)).length;
  const highPriorityCount = visibleNotices.filter((notice) => notice.priority === 'high').length;

  const markRead = (noticeId: string) => {
    if (readIds.includes(noticeId)) return;
    persistReads([...readIds, noticeId]);
  };

  const markUnread = (noticeId: string) => {
    if (!readIds.includes(noticeId)) return;
    persistReads(readIds.filter((id) => id !== noticeId));
  };

  const publishNotice = () => {
    const cleanTitle = title.trim();
    const cleanMessage = message.trim();
    if (!cleanTitle || !cleanMessage) return;

    const next: Notice = {
      id: `notice-${Math.random().toString(36).slice(2, 10)}`,
      title: cleanTitle,
      message: cleanMessage,
      audience,
      priority,
      createdBy: user.name || 'Staff',
      createdAt: new Date().toISOString(),
    };

    persistNotices([next, ...notices]);
    setTitle('');
    setMessage('');
    setAudience('all');
    setPriority('normal');
  };

  return (
    <div className="space-y-6">
      <div className="posh-hero animate-rise-in p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] font-semibold text-blue-700">System Notices</p>
            <h3 className="text-xl font-bold text-slate-900 mt-1 dark:text-slate-100">Announcements Center</h3>
            <p className="text-sm text-slate-600 mt-1 dark:text-slate-300">Centralized updates, reminders, and role-based notifications.</p>
          </div>
          <div className="rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800 font-medium dark:bg-blue-500/10 dark:text-blue-200">
            {user.role.toUpperCase()}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="posh-kpi animate-rise-in stagger-1">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Visible notices</p>
          <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-slate-100">{visibleNotices.length}</p>
        </div>
        <div className="posh-kpi animate-rise-in stagger-2">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Unread</p>
          <p className="mt-1 text-3xl font-bold text-amber-600 dark:text-amber-300">{unreadCount}</p>
        </div>
        <div className="posh-kpi animate-rise-in stagger-3">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">High priority</p>
          <p className="mt-1 text-3xl font-bold text-rose-600 dark:text-rose-300">{highPriorityCount}</p>
        </div>
      </div>

      {canPublish && (
        <div className="bento-panel animate-rise-in p-5">
          <div className="flex items-center gap-2 mb-3 text-slate-900 font-semibold dark:text-slate-100">
            <Megaphone className="w-4 h-4 text-blue-700" />
            Publish Announcement
          </div>
          <div className="grid lg:grid-cols-2 gap-3">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="posh-input"
              placeholder="Announcement title"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={audience}
                onChange={(event) => setAudience(event.target.value as NoticeAudience)}
                className="posh-input px-3"
              >
                <option value="all">All Roles</option>
                <option value="student">Students</option>
                <option value="facilitator">Facilitators</option>
                {user.role === 'admin' && <option value="admin">Admins</option>}
              </select>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as NoticePriority)}
                className="posh-input px-3"
              >
                <option value="normal">Normal</option>
                <option value="high">High Priority</option>
              </select>
            </div>
          </div>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={4}
            className="posh-input mt-3 w-full py-3"
            placeholder="Write your announcement message..."
          />
          <button
            onClick={publishNotice}
            className="clickable-button mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Send className="w-4 h-4" />
            Publish Notice
          </button>
        </div>
      )}

      <div className="bento-panel animate-rise-in p-5">
        <div className="grid md:grid-cols-[1fr_auto] gap-3 mb-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="posh-input w-full pl-9"
              placeholder="Search notices"
            />
          </div>
          <select
            value={audienceFilter}
            onChange={(event) => setAudienceFilter(event.target.value as 'all' | NoticeAudience)}
            className="posh-input px-3"
          >
            <option value="all">All audiences</option>
            <option value="student">Student</option>
            <option value="facilitator">Facilitator</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div className="space-y-3">
          {visibleNotices.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">No announcements found.</p>
          ) : (
            visibleNotices.map((notice) => {
              const isRead = readIds.includes(notice.id);
              return (
                <div key={notice.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h4 className="font-semibold text-slate-900 dark:text-slate-100">{notice.title}</h4>
                        <span className={`posh-tag ${notice.priority === 'high' ? 'border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200' : 'border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-200'}`}>
                          {notice.priority === 'high' ? 'High' : 'Normal'}
                        </span>
                        <span className="posh-tag border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
                          {notice.audience.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-200">{notice.message}</p>
                      <p className="text-xs text-slate-500 mt-2 dark:text-slate-400">
                        {new Date(notice.createdAt).toLocaleString()} • {notice.createdBy}
                      </p>
                    </div>
                    <button
                      onClick={() => (isRead ? markUnread(notice.id) : markRead(notice.id))}
                      className="clickable-button inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      {isRead ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <CircleAlert className="w-3.5 h-3.5 text-amber-600" />}
                      {isRead ? 'Read' : 'Mark Read'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="bento-panel p-4">
        <div className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <Bell className="w-4 h-4 text-blue-700" />
          Announcement state is saved in browser storage.
        </div>
      </div>
    </div>
  );
}
