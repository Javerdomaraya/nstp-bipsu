import React, { ReactNode, useEffect, useState } from 'react';
import CollapsibleRoleSidebar, {
  CollapsibleSidebarGroup,
} from './CollapsibleRoleSidebar';

export type AppShellProps = {
  portalLabel: string;
  sidebarGroups: CollapsibleSidebarGroup[];
  avatarLabel: string;
  accountLabel: string;
  accountTitle: string;
  accountSubtitle?: string;
  accountMeta?: ReactNode;
  onLogout?: () => void;
  closeLabel?: string;
  header?: ReactNode;
  children: ReactNode;
  /** Controlled mobile sidebar open state (optional) */
  sidebarOpen?: boolean;
  onSidebarToggle?: (open: boolean) => void;
  className?: string;
};

export default function AppShell({
  portalLabel,
  sidebarGroups,
  avatarLabel,
  accountLabel,
  accountTitle,
  accountSubtitle,
  accountMeta,
  onLogout,
  closeLabel = 'Close navigation',
  header,
  children,
  sidebarOpen: controlledOpen,
  onSidebarToggle,
  className = '',
}: AppShellProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isSidebarOpen = isControlled ? controlledOpen : internalOpen;

  const handleClose = () => {
    if (isControlled) {
      onSidebarToggle?.(false);
    } else {
      setInternalOpen(false);
    }
  };

  // Prevent background scrolling while the mobile drawer is open
  useEffect(() => {
    if (isSidebarOpen && typeof window !== 'undefined' && window.innerWidth < 1024) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isSidebarOpen]);

  // Accessible Escape key handling to close mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSidebarOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSidebarOpen]);

  return (
    <div className={`min-h-screen w-full max-w-full overflow-x-hidden bg-[#f4f8fd] text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col ${className}`}>
      {/* Sidebar with mobile drawer & desktop hover expansion */}
      <CollapsibleRoleSidebar
        open={isSidebarOpen}
        onClose={handleClose}
        portalLabel={portalLabel}
        closeLabel={closeLabel}
        groups={sidebarGroups}
        avatarLabel={avatarLabel}
        accountLabel={accountLabel}
        accountTitle={accountTitle}
        accountSubtitle={accountSubtitle}
        accountMeta={accountMeta}
        onLogout={onLogout}
      />

      {/* Main Content Area */}
      <div className="flex min-h-screen min-w-0 w-full max-w-full flex-1 flex-col transition-all duration-300 ease-in-out lg:pl-[76px]">
        {header}
        <main className="min-w-0 w-full max-w-full flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
