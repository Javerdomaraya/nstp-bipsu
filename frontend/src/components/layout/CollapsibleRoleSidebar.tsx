import { ReactNode } from 'react';
import { LogOut, X, type LucideIcon } from 'lucide-react';

export type CollapsibleSidebarItem = {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  badge?: string | number;
  onClick: () => void;
};

export type CollapsibleSidebarGroup = {
  label?: string;
  items: CollapsibleSidebarItem[];
};

type CollapsibleRoleSidebarProps = {
  open: boolean;
  onClose: () => void;
  portalLabel: string;
  groups: CollapsibleSidebarGroup[];
  avatarLabel: string;
  accountLabel: string;
  accountTitle: string;
  accountSubtitle?: string;
  accountMeta?: ReactNode;
  onLogout?: () => void;
  closeLabel: string;
};

const revealTextClass =
  'min-w-0 overflow-hidden whitespace-nowrap opacity-100 translate-x-0 transition-all duration-300 ease-in-out lg:w-0 lg:opacity-0 lg:translate-x-2 lg:group-hover/sidebar:w-auto lg:group-hover/sidebar:opacity-100 lg:group-hover/sidebar:translate-x-0';

export default function CollapsibleRoleSidebar({
  open,
  onClose,
  portalLabel,
  groups,
  avatarLabel,
  accountLabel,
  accountTitle,
  accountSubtitle,
  accountMeta,
  onLogout,
  closeLabel,
}: CollapsibleRoleSidebarProps) {
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={`group/sidebar fixed left-0 top-0 z-50 flex h-screen w-[280px] max-w-[86vw] flex-col overflow-hidden rounded-r-[28px] bg-[#061E3D] text-white shadow-[0_20px_60px_rgba(0,0,0,0.25)] transition-all duration-300 ease-in-out lg:w-[76px] lg:max-w-none lg:hover:w-[276px] lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-20 shrink-0 items-center border-b border-white/10 px-4">
          <div className="flex w-full items-center justify-between gap-3 lg:justify-center lg:group-hover/sidebar:justify-start">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[#E5B73B]/40 p-1 text-sm font-semibold shadow-sm">
                <img src="/bipsu-logo.png" alt="Biliran Province State University logo" className="h-full w-full object-contain" />
              </div>
              <div className={revealTextClass}>
                <p className="truncate text-base font-semibold leading-tight text-white">BiPSU NSTP Portal</p>
                <p className="truncate text-xs uppercase tracking-[0.18em] text-white/65">{portalLabel}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              title="Close menu"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white lg:hidden"
              aria-label={closeLabel}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className="sidebar-nav-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
          <div className="space-y-4 lg:space-y-2">
            {groups.map((group, groupIndex) => (
              <div key={group.label || groupIndex}>
                {group.label ? (
                  <p className={`mb-2 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/45 ${revealTextClass}`}>
                    {group.label}
                  </p>
                ) : null}
                <div className="space-y-2">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          item.onClick();
                          onClose();
                        }}
                        title={item.label}
                        className={`group/item relative flex h-12 w-full items-center gap-3 rounded-2xl text-left text-sm transition-all duration-200 lg:justify-center lg:px-0 lg:group-hover/sidebar:justify-start lg:group-hover/sidebar:px-4 ${
                          item.active ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {item.active ? <span className="absolute left-0 h-7 w-1 rounded-r-full bg-[#E5B73B]" /> : null}
                        <Icon className="h-5 w-5 shrink-0" />
                        <span className={`flex-1 truncate lg:flex-none lg:group-hover/sidebar:flex-1 ${revealTextClass}`}>{item.label}</span>
                        {item.badge ? (
                          <span className={`rounded-full bg-blue-500 px-2 py-0.5 text-xs font-semibold text-white ${revealTextClass}`}>
                            {item.badge}
                          </span>
                        ) : null}
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 z-[60] hidden -translate-y-1/2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-medium text-white opacity-0 shadow-xl transition-opacity duration-200 lg:block lg:group-hover/item:opacity-100 lg:group-hover/sidebar:opacity-0"
                        >
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="shrink-0 border-t border-white/10 p-3">
          <div className="flex h-14 w-full items-center justify-center overflow-hidden rounded-2xl bg-white/10 p-2 transition-all duration-300 ease-in-out lg:group-hover/sidebar:h-auto lg:group-hover/sidebar:justify-start lg:group-hover/sidebar:gap-3 lg:group-hover/sidebar:px-3 lg:group-hover/sidebar:py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-600 text-sm font-semibold text-white shadow-lg shadow-blue-950/40">
              {avatarLabel}
            </span>
            <div className={revealTextClass}>
              <p className="truncate text-sm font-semibold leading-tight text-white">{accountTitle}</p>
              <p className="truncate text-xs text-white/70">{accountLabel}</p>
              {accountSubtitle ? <p className="truncate text-xs text-white/55">{accountSubtitle}</p> : null}
            </div>
          </div>
          {accountMeta ? <div className={`mt-3 px-1 text-white/75 ${revealTextClass}`}>{accountMeta}</div> : null}
          {onLogout ? (
            <button
              type="button"
              onClick={onLogout}
              className="mt-3 flex h-10 w-full items-center gap-2 rounded-2xl text-sm font-medium text-slate-300 transition-all duration-300 ease-in-out hover:bg-white/10 hover:text-white lg:pointer-events-none lg:h-0 lg:overflow-hidden lg:px-0 lg:opacity-0 lg:group-hover/sidebar:pointer-events-auto lg:group-hover/sidebar:h-10 lg:group-hover/sidebar:px-3 lg:group-hover/sidebar:opacity-100"
            >
              <LogOut className="h-5 w-5 shrink-0" />
              <span className={revealTextClass}>Logout</span>
            </button>
          ) : null}
        </div>
      </aside>
    </>
  );
}
