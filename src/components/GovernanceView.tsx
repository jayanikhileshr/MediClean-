import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import type {
  AuditLogEntry,
  DatasetState,
  GovernancePolicy,
  UserRole,
} from '../types/mediclean';
import { ROLE_MATRIX, profileDatasetColumns } from '../engine/governance';

interface GovernanceViewProps {
  dataset: DatasetState;
  activeRole: UserRole;
  policy: GovernancePolicy;
  allowUnmask: boolean;
  onToggleUnmask: () => Promise<void>;
  onUpdatePolicy: (next: GovernancePolicy) => Promise<void>;
  auditLogs: AuditLogEntry[];
}

export const GovernanceView: React.FC<GovernanceViewProps> = ({
  dataset,
  activeRole,
  policy,
  allowUnmask,
  onToggleUnmask,
  onUpdatePolicy,
  auditLogs,
}) => {
  const [severityFilter, setSeverityFilter] = useState<'All' | 'Info' | 'Governance' | 'Security'>('All');
  const perms = ROLE_MATRIX[activeRole];

  const profiles = useMemo(
    () => profileDatasetColumns(dataset.columns, dataset.originalRows, policy, allowUnmask),
    [dataset.columns, dataset.originalRows, policy, allowUnmask]
  );

  const directPhiColumns = profiles.filter((p) => p.piiCategory === 'Direct Identifier (PHI)');

  const filteredLogs = useMemo(() => {
    if (severityFilter === 'All') return auditLogs;
    return auditLogs.filter((l) => l.severity === severityFilter);
  }, [auditLogs, severityFilter]);

  const togglePolicyField = (field: keyof GovernancePolicy) => {
    if (!perms.canEditGovernance) return;
    void onUpdatePolicy({ ...policy, [field]: !policy[field] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-[#202923]">
            Healthcare Data Governance & Privacy
          </h1>
          <p className="text-[14px] text-[#5A665E] mt-1">
            HIPAA Safe Harbor PII detection, Patient ID masking policies, RBAC authorization, SHA-256 integrity verification, and SQLite audit logging.
          </p>
        </div>

        <button
          type="button"
          disabled={!perms.canUnmaskPii}
          onClick={() => void onToggleUnmask()}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-colors whitespace-nowrap ${
            allowUnmask
              ? 'bg-[#B53838] text-white hover:bg-[#962D2D]'
              : 'bg-white/80 border border-[#202923]/12 text-[#202923] hover:bg-white disabled:opacity-45 disabled:cursor-not-allowed'
          }`}
        >
          {allowUnmask ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          <span>
            {allowUnmask
              ? 'Re-Enable PII Masking'
              : perms.canUnmaskPii
              ? 'Temporarily Unmask Synthetic PHI'
              : 'PHI Unmasking Locked (Privacy Officer Only)'}
          </span>
        </button>
      </div>

      {/* Integrity & Masking Summary Strip */}
      <section className="glass-panel px-6 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-[#202923]/8">
        <div className="pt-2 sm:pt-0">
          <div className="text-[12px] text-[#5A665E]">Direct PHI Fields Detected</div>
          <div className="mt-1 font-mono tabular-nums text-[22px] font-semibold text-[#202923]">
            {directPhiColumns.length} / {profiles.length}
          </div>
          <div className="text-[11px] text-[#78827B]">HIPAA §164.514(b)(2) identifiers</div>
        </div>
        <div className="pt-2 sm:pt-0 sm:pl-5">
          <div className="text-[12px] text-[#5A665E]">Dashboard Privacy Mode</div>
          <div className="mt-1 text-[16px] font-semibold text-[#2B6B4F]">
            {allowUnmask ? 'Controlled Reveal (Logged)' : 'Masked Safe Harbor'}
          </div>
          <div className="text-[11px] text-[#78827B]">Zero raw PII in audit logs</div>
        </div>
        <div className="pt-2 sm:pt-0 sm:pl-5">
          <div className="text-[12px] text-[#5A665E]">Original Source SHA-256</div>
          <div className="mt-1 font-mono tabular-nums text-[14px] font-semibold text-[#202923] truncate">
            {dataset.originalHash}
          </div>
          <div className="text-[11px] text-[#2B6B4F]">Immutable checksum verified</div>
        </div>
        <div className="pt-2 sm:pt-0 sm:pl-5">
          <div className="text-[12px] text-[#5A665E]">Cleaned Snapshot SHA-256</div>
          <div className="mt-1 font-mono tabular-nums text-[14px] font-semibold text-[#202923] truncate">
            {dataset.cleanedHash || 'Not generated yet'}
          </div>
          <div className="text-[11px] text-[#78827B]">
            {dataset.cleanedHash ? 'Isolated from original source' : 'Run cleaning pipeline'}
          </div>
        </div>
      </section>

      {/* Masking Policy Controls + RBAC Permission Matrix */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <section className="glass-panel p-6 xl:col-span-5">
          <div className="flex items-start justify-between gap-2 mb-4">
            <div>
              <h2 className="text-[16px] font-semibold text-[#202923]">
                PII Masking & Export Policies
              </h2>
              <p className="text-[13px] text-[#5A665E] mt-0.5">
                Persisted to SQLite governance store. Editable by Privacy Officer.
              </p>
            </div>
            {!perms.canEditGovernance && <Lock className="w-4 h-4 text-[#A86416] shrink-0" />}
          </div>

          <div className="divide-y divide-[#202923]/8">
            {[
              {
                key: 'maskPatientId' as const,
                label: 'Mask Patient ID / MRN',
                desc: 'Displays MRN-•••201 across tables and diagnostics.',
              },
              {
                key: 'maskPatientName' as const,
                label: 'Mask Patient Full Name',
                desc: 'Redacts given and family names to initial + bullets.',
              },
              {
                key: 'maskEmail' as const,
                label: 'Mask Electronic Mail Addresses',
                desc: 'Obfuscates local-part and domain identifiers.',
              },
              {
                key: 'maskPhone' as const,
                label: 'Mask Telephone Numbers',
                desc: 'Preserves only the final 4 digits for call-back troubleshooting.',
              },
              {
                key: 'enforceHipaaSafeHarborOnExport' as const,
                label: 'Default Safe Harbor De-Identification on Export',
                desc: 'Pre-selects de-identified export mode for CSV/Excel downloads.',
              },
            ].map((item) => (
              <div key={item.key} className="py-3.5 flex items-center justify-between gap-4">
                <div>
                  <div className="text-[13px] font-medium text-[#202923]">{item.label}</div>
                  <div className="text-[12px] text-[#5A665E] mt-0.5">{item.desc}</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={policy[item.key]}
                  disabled={!perms.canEditGovernance}
                  onClick={() => togglePolicyField(item.key)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 disabled:opacity-45 disabled:cursor-not-allowed ${
                    policy[item.key] ? 'bg-[#4A6A55]' : 'bg-[#202923]/18'
                  }`}
                >
                  <span
                    className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-xs transition-transform ${
                      policy[item.key] ? 'translate-x-5.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-panel p-6 xl:col-span-7">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h2 className="text-[16px] font-semibold text-[#202923]">
                Role-Based Access Control (RBAC) Matrix
              </h2>
              <p className="text-[13px] text-[#5A665E] mt-0.5">
                Active session role: <strong className="text-[#202923]">{activeRole}</strong>. Switch roles from the top navigation bar to test enforcement.
              </p>
            </div>
            <ShieldCheck className="w-4 h-4 text-[#789681]" />
          </div>

          <div className="surface-solid overflow-x-auto">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-[#202923]/8 text-[#5A665E] bg-[#F5F7F5]/65">
                  <th className="py-2.5 px-3 font-medium">Role</th>
                  <th className="py-2.5 px-3 font-medium text-center">Upload</th>
                  <th className="py-2.5 px-3 font-medium text-center">Clean</th>
                  <th className="py-2.5 px-3 font-medium text-center">Edit Policy</th>
                  <th className="py-2.5 px-3 font-medium text-center">Unmask PHI</th>
                  <th className="py-2.5 px-3 font-medium text-center">Export</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#202923]/6">
                {Object.values(ROLE_MATRIX).map((r) => {
                  const isCurrent = r.role === activeRole;
                  return (
                    <tr
                      key={r.role}
                      className={isCurrent ? 'bg-[#789681]/12' : 'hover:bg-[#789681]/5'}
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-[#202923]">
                          {r.role}
                          {isCurrent && (
                            <span className="ml-1.5 text-[11px] font-normal text-[#2B6B4F]">
                              · Active
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#5A665E] mt-0.5 leading-snug max-w-[280px]">
                          {r.description}
                        </div>
                      </td>
                      <PermCell allowed={r.canUpload} />
                      <PermCell allowed={r.canClean} />
                      <PermCell allowed={r.canEditGovernance} />
                      <PermCell allowed={r.canUnmaskPii} />
                      <PermCell allowed={r.canExportClean} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Automated Sensitive Field Detection Table */}
      <section className="glass-panel p-6">
        <h2 className="text-[16px] font-semibold text-[#202923]">
          Sensitive Field & PII Discovery Registry
        </h2>
        <p className="text-[13px] text-[#5A665E] mt-0.5 mb-4">
          Every column in the uploaded clinical dataset is automatically mapped to HIPAA Safe Harbor classification rules.
        </p>

        <div className="surface-solid overflow-x-auto">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[#202923]/8 text-[#5A665E] bg-[#F5F7F5]/65">
                <th className="py-2.5 px-4 font-medium">Column</th>
                <th className="py-2.5 px-4 font-medium">Classification</th>
                <th className="py-2.5 px-4 font-medium">Regulatory Reference</th>
                <th className="py-2.5 px-4 font-medium">Live Masked Sample</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#202923]/6">
              {profiles.map((col) => (
                <tr key={col.name} className="hover:bg-[#789681]/6">
                  <td className="py-2.5 px-4 font-mono font-medium text-[#202923]">{col.name}</td>
                  <td className="py-2.5 px-4 font-medium">
                    <span
                      className={
                        col.piiCategory === 'Direct Identifier (PHI)'
                          ? 'text-[#B53838]'
                          : col.piiCategory === 'Clinical Sensitive'
                          ? 'text-[#4A6A55]'
                          : 'text-[#5A665E]'
                      }
                    >
                      {col.piiCategory}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-[#5A665E]">{col.hipaaTag}</td>
                  <td className="py-2.5 px-4 font-mono text-[#202923]">
                    {col.sampleValues[0] || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Immutable SQLite Audit Trail */}
      <section className="glass-panel p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-[16px] font-semibold text-[#202923]">
              Immutable Audit Log (SQLite Persisted)
            </h2>
            <p className="text-[13px] text-[#5A665E] mt-0.5">
              Every ingestion, cleaning run, validation check, policy edit, and export is hashed and sanitized of all PII.
            </p>
          </div>

          <div className="inline-flex p-1 rounded-xl bg-white/75 border border-[#202923]/8">
            {(['All', 'Info', 'Governance', 'Security'] as const).map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                className={`px-3 py-1 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap ${
                  severityFilter === sev
                    ? 'bg-[#4A6A55] text-white'
                    : 'text-[#5A665E] hover:text-[#202923]'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        <div className="surface-solid overflow-x-auto">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[#202923]/8 text-[#5A665E] bg-[#F5F7F5]/65">
                <th className="py-2.5 px-3 font-medium">Timestamp</th>
                <th className="py-2.5 px-3 font-medium">Actor Role</th>
                <th className="py-2.5 px-3 font-medium">Action</th>
                <th className="py-2.5 px-3 font-medium">Severity</th>
                <th className="py-2.5 px-3 font-medium">Sanitized Event Detail</th>
                <th className="py-2.5 px-3 font-medium text-right">Integrity Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#202923]/6">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#5A665E]">
                    No audit log entries recorded for this filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#789681]/6">
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[#5A665E] whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-[#202923] whitespace-nowrap">
                      {log.actorRole}
                    </td>
                    <td className="py-2.5 px-3 text-[#202923] whitespace-nowrap">
                      {log.actionType}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap font-medium">
                      <span
                        className={
                          log.severity === 'Security'
                            ? 'text-[#B53838]'
                            : log.severity === 'Governance'
                            ? 'text-[#4A6A55]'
                            : 'text-[#5A665E]'
                        }
                      >
                        {log.severity}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[#5A665E] max-w-[380px]">{log.details}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#78827B] whitespace-nowrap">
                      {log.integrityHash}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

const PermCell: React.FC<{ allowed: boolean }> = ({ allowed }) => (
  <td className="py-2.5 px-3 text-center font-medium">
    <span className={allowed ? 'text-[#2B6B4F]' : 'text-[#78827B]'}>
      {allowed ? 'Allow' : 'Deny'}
    </span>
  </td>
);
