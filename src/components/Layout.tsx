import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import type { NavPage, ToastMessage, UserRole } from '../types/mediclean';
import { ROLE_MATRIX } from '../engine/governance';

interface LayoutProps {
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
  activeRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  datasetName: string;
  recordCount: number;
  isCleaned: boolean;
  toasts: ToastMessage[];
  onDismissToast: (id: string) => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{ id: NavPage; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'upload', label: 'Upload Dataset', icon: UploadCloud },
  { id: 'quality', label: 'Data Quality Assessment', icon: Activity },
  { id: 'cleaning', label: 'Data Cleaning', icon: Sparkles },
  { id: 'governance', label: 'Governance and Privacy', icon: ShieldCheck },
  { id: 'validation', label: 'Validation Results', icon: CheckCircle2 },
  { id: 'reports', label: 'Reports and History', icon: History },
];

const PAGE_LABELS: Record<NavPage, string> = {
  dashboard: 'Analytics Overview',
  upload: 'Dataset Ingestion',
  quality: 'Data Quality Assessment',
  cleaning: 'Automated Data Cleaning',
  governance: 'Governance & Privacy',
  validation: 'Validation Results',
  reports: 'Reports & Export History',
};

const ROLES: UserRole[] = [
  'Privacy Officer',
  'Data Steward',
  'Clinical Analyst',
  'Compliance Auditor',
];

export const Layout: React.FC<LayoutProps> = ({
  activePage,
  onNavigate,
  activeRole,
  onRoleChange,
  datasetName,
  recordCount,
  isCleaned,
  toasts,
  onDismissToast,
  children,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNavClick = (page: NavPage) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  return (
    <div className="mediclean-canvas min-h-screen flex text-[#202923]">
      {/* Desktop Frosted Glass Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[264px] lg:fixed lg:inset-y-0 glass-sidebar z-30">
        <div className="px-6 pt-6 pb-5 border-b border-[#202923]/6">
          <button
            type="button"
            onClick={() => handleNavClick('dashboard')}
            className="flex items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4A6A55] rounded-lg"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#4A6A55] to-[#789681] flex items-center justify-center shadow-sm shrink-0">
              <FileSpreadsheet className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="font-[var(--font-display)] text-[19px] font-semibold tracking-tight text-[#202923] whitespace-nowrap">
              MediClean
            </span>
          </button>
        </div>

        <nav className="flex-1 px-3.5 py-5 space-y-1 overflow-y-auto" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[14px] font-medium transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4A6A55] ${
                  active
                    ? 'bg-[#4A6A55] text-white shadow-sm'
                    : 'text-[#4B5850] hover:bg-white/75 hover:text-[#202923]'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-[#6A7B70]'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Active Dataset Summary Footer in Sidebar */}
        <div className="px-5 py-4 border-t border-[#202923]/6 text-xs text-[#5A665E]">
          <div className="font-medium text-[#202923] truncate" title={datasetName}>
            {datasetName}
          </div>
          <div className="mt-1 font-mono tabular-nums text-[11px] text-[#5A665E]">
            {recordCount.toLocaleString()} records · {isCleaned ? 'Cleaned ready' : 'Original only'}
          </div>
        </div>
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#202923]/25 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-[272px] max-w-[82vw] h-full glass-modal rounded-none flex flex-col z-10">
            <div className="px-5 py-5 flex items-center justify-between border-b border-[#202923]/8">
              <span className="font-[var(--font-display)] text-lg font-semibold text-[#202923]">
                MediClean
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                className="p-2 rounded-lg text-[#5A665E] hover:bg-white/80"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      active
                        ? 'bg-[#4A6A55] text-white'
                        : 'text-[#4B5850] hover:bg-white/75 hover:text-[#202923]'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-[264px] flex flex-col min-w-0">
        {/* Top Frosted Glass Bar (Contextual Breadcrumb + Role Selector + Upload CTA) */}
        <header className="sticky top-0 z-20 glass-topbar px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-1 rounded-lg text-[#202923] hover:bg-white/70"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-[#5A665E] hidden sm:inline whitespace-nowrap">MediClean</span>
              <span className="text-[#78827B] hidden sm:inline" aria-hidden="true">/</span>
              <span className="font-medium text-[#202923] truncate">{PAGE_LABELS[activePage]}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <label htmlFor="rbac-role-select" className="sr-only">
              Active Governance Role
            </label>
            <select
              id="rbac-role-select"
              value={activeRole}
              onChange={(e) => onRoleChange(e.target.value as UserRole)}
              title={ROLE_MATRIX[activeRole].description}
              className="h-9 px-3 rounded-xl bg-white/75 border border-white/90 text-[13px] font-medium text-[#202923] shadow-xs focus:outline-none focus:ring-2 focus:ring-[#4A6A55] cursor-pointer whitespace-nowrap"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  Role: {role}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => onNavigate('upload')}
              className="hidden sm:inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-[#4A6A55] hover:bg-[#385342] text-white text-[13px] font-medium transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4A6A55] focus-visible:ring-offset-1"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload Dataset</span>
            </button>
          </div>
        </header>

        {/* Viewport Container */}
        <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-8 py-6 sm:py-8">
          {children}
        </main>
      </div>

      {/* Floating Glass Notification Stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 w-[340px] max-w-[calc(100vw-2.5rem)]"
        >
          {toasts.map((toast) => (
            <div key={toast.id} className="glass-toast p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[#202923]">{toast.title}</div>
                <div className="text-[12px] text-[#5A665E] mt-0.5 leading-snug">{toast.detail}</div>
              </div>
              <button
                type="button"
                onClick={() => onDismissToast(toast.id)}
                aria-label="Dismiss notification"
                className="text-[#78827B] hover:text-[#202923] p-1 rounded-md shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
