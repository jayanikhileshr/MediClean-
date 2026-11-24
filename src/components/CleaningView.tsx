import React, { useMemo, useState } from 'react';
import { CheckCircle2, Lock, RotateCcw, Sparkles } from 'lucide-react';
import type {
  CleaningConfig,
  CleaningResult,
  DatasetState,
  GovernancePolicy,
  QualityAssessmentReport,
  UserRole,
} from '../types/mediclean';
import { runCleaningPipeline } from '../engine/dataCleaner';
import { ROLE_MATRIX, maskCellValue, maskPatientId } from '../engine/governance';

interface CleaningViewProps {
  dataset: DatasetState;
  activeRole: UserRole;
  policy: GovernancePolicy;
  allowUnmask: boolean;
  config: CleaningConfig;
  onConfigChange: (next: CleaningConfig) => void;
  appliedResult: CleaningResult | null;
  originalReport: QualityAssessmentReport;
  cleanedReport: QualityAssessmentReport | null;
  onApplyCleaning: (config: CleaningConfig, previewResult: CleaningResult) => Promise<void>;
  onResetCleaned: () => Promise<void>;
}

export const CleaningView: React.FC<CleaningViewProps> = ({
  dataset,
  activeRole,
  policy,
  allowUnmask,
  config,
  onConfigChange,
  appliedResult,
  originalReport,
  cleanedReport,
  onApplyCleaning,
  onResetCleaned,
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [diffFilter, setDiffFilter] = useState<string>('All');

  const canClean = ROLE_MATRIX[activeRole].canClean;

  // Live dry-run simulation on original immutable dataset so users review operations BEFORE applying
  const dryRunPreview = useMemo(
    () => runCleaningPipeline(dataset.originalRows, dataset.columns, config),
    [dataset.originalRows, dataset.columns, config]
  );

  const uniqueOperations = useMemo(() => {
    const names = Array.from(new Set(dryRunPreview.diffs.map((d) => d.operation)));
    return ['All', ...names];
  }, [dryRunPreview.diffs]);

  const visibleDiffs = useMemo(() => {
    const base =
      diffFilter === 'All'
        ? dryRunPreview.diffs
        : dryRunPreview.diffs.filter((d) => d.operation === diffFilter);
    return base.slice(0, 60);
  }, [dryRunPreview.diffs, diffFilter]);

  const handleConfirmApply = async () => {
    setApplying(true);
    try {
      await onApplyCleaning(config, dryRunPreview);
      setConfirmOpen(false);
    } finally {
      setApplying(false);
    }
  };

  const toggle = (key: keyof CleaningConfig) => {
    onConfigChange({ ...config, [key]: !config[key] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-[#202923]">
            Automated Data Cleaning Pipeline
          </h1>
          <p className="text-[14px] text-[#5A665E] mt-1">
            Review exact cleaning rules and cell-level previews before executing. The original dataset is never overwritten.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {appliedResult && canClean && (
            <button
              type="button"
              onClick={() => void onResetCleaned()}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/80 hover:bg-white border border-[#202923]/10 text-[13px] font-medium text-[#202923] whitespace-nowrap transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Cleaned Snapshot</span>
            </button>
          )}
          <button
            type="button"
            disabled={!canClean}
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#4A6A55] hover:bg-[#385342] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-medium whitespace-nowrap transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            <span>Review & Apply Cleaning</span>
          </button>
        </div>
      </div>

      {!canClean && (
        <div className="glass-panel p-4 flex items-center gap-3 text-[13px] text-[#5A665E]">
          <Lock className="w-4 h-4 text-[#A86416] shrink-0" />
          <span>
            Role <strong className="text-[#202923]">{activeRole}</strong> is restricted to dry-run preview inspection. Switch to{' '}
            <strong className="text-[#202923]">Data Steward</strong> or{' '}
            <strong className="text-[#202923]">Privacy Officer</strong> to execute cleaning pipelines.
          </span>
        </div>
      )}

      {/* Dry-Run Impact Summary Strip */}
      <section className="glass-panel px-6 py-4 grid grid-cols-2 lg:grid-cols-4 gap-4 divide-y lg:divide-y-0 lg:divide-x divide-[#202923]/8">
        <div className="pt-2 lg:pt-0">
          <div className="text-[12px] text-[#5A665E]">Projected Output Rows</div>
          <div className="mt-1 font-mono tabular-nums text-[22px] font-semibold text-[#202923]">
            {dryRunPreview.cleanedRows.length.toLocaleString()}
          </div>
          <div className="text-[11px] font-mono text-[#78827B]">
            from {dataset.originalRows.length.toLocaleString()} original rows
          </div>
        </div>
        <div className="pt-2 lg:pt-0 lg:pl-5">
          <div className="text-[12px] text-[#5A665E]">Duplicates Removed</div>
          <div className="mt-1 font-mono tabular-nums text-[22px] font-semibold text-[#202923]">
            {dryRunPreview.removedDuplicateCount.toLocaleString()}
          </div>
          <div className="text-[11px] text-[#78827B]">exact & MRN duplicates</div>
        </div>
        <div className="pt-2 lg:pt-0 lg:pl-5">
          <div className="text-[12px] text-[#5A665E]">Cell Transformations</div>
          <div className="mt-1 font-mono tabular-nums text-[22px] font-semibold text-[#202923]">
            {dryRunPreview.cellsModifiedCount.toLocaleString()}
          </div>
          <div className="text-[11px] text-[#78827B]">
            across {dryRunPreview.recordsCleanedCount.toLocaleString()} records
          </div>
        </div>
        <div className="pt-2 lg:pt-0 lg:pl-5">
          <div className="text-[12px] text-[#5A665E]">Pipeline Status</div>
          <div className="mt-1 text-[16px] font-semibold text-[#202923] flex items-center gap-1.5">
            {appliedResult && cleanedReport ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-[#2B6B4F]" />
                <span className="font-mono tabular-nums">
                  {originalReport.overallScore.toFixed(1)}% → {cleanedReport.overallScore.toFixed(1)}%
                </span>
              </>
            ) : (
              <span className="text-[#A86416]">Awaiting Approval</span>
            )}
          </div>
          <div className="text-[11px] text-[#78827B]">
            {appliedResult ? 'Cleaned snapshot active' : 'Dry-run preview mode'}
          </div>
        </div>
      </section>

      {/* Configuration Controls + Projected Operations Summary */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <section className="glass-panel p-6 xl:col-span-7 space-y-5">
          <div>
            <h2 className="text-[16px] font-semibold text-[#202923]">Cleaning Rule Configuration</h2>
            <p className="text-[13px] text-[#5A665E] mt-0.5">
              Enable or tune remediation strategies before executing on the active dataset.
            </p>
          </div>

          <div className="divide-y divide-[#202923]/8">
            <RuleToggleRow
              title="Missing-Value Handling"
              description="Impute missing numeric fields with cohort medians, map missing categories, or drop critical blank rows."
              checked={config.handleMissingValues}
              onChange={() => toggle('handleMissingValues')}
              extra={
                config.handleMissingValues ? (
                  <select
                    aria-label="Missing value strategy"
                    value={config.missingStrategy}
                    onChange={(e) =>
                      onConfigChange({
                        ...config,
                        missingStrategy: e.target.value as CleaningConfig['missingStrategy'],
                      })
                    }
                    className="h-8 px-2.5 rounded-lg bg-white border border-[#202923]/12 text-[12px] text-[#202923] focus:outline-none focus:ring-2 focus:ring-[#4A6A55]"
                  >
                    <option value="impute">Median / Mode Imputation</option>
                    <option value="placeholder">Governed Placeholder</option>
                    <option value="drop_critical">Drop Critical Missing Rows</option>
                  </select>
                ) : null
              }
            />

            <RuleToggleRow
              title="Duplicate Record Removal"
              description="Remove exact row duplicates and conflicting MRN + patient identity duplicates keeping the earliest complete record."
              checked={config.removeDuplicates}
              onChange={() => toggle('removeDuplicates')}
            />

            <RuleToggleRow
              title="Date Format Standardization & Chronology Repair"
              description="Convert MM/DD/YYYY, DD-Mon-YYYY, and YYYY/MM/DD timestamps to ISO-8601 (YYYY-MM-DD) and repair discharge < admission inversions."
              checked={config.standardizeDates}
              onChange={() => {
                const next = !config.standardizeDates;
                onConfigChange({ ...config, standardizeDates: next, fixReversedDates: next });
              }}
            />

            <RuleToggleRow
              title="Text Normalization & MRN Standardization"
              description="Trim whitespace, title-case patient names, and standardize malformed medical record numbers to MRN-XXXXXX."
              checked={config.normalizeText}
              onChange={() => toggle('normalizeText')}
            />

            <RuleToggleRow
              title="Data Type Correction & Invalid Age Remediation"
              description="Strip currency formatting from Treatment_Cost, coerce numeric strings, and replace negative or >120 ages with cohort median."
              checked={config.correctDataTypes && config.remediateInvalidAges}
              onChange={() => {
                const next = !(config.correctDataTypes && config.remediateInvalidAges);
                onConfigChange({ ...config, correctDataTypes: next, remediateInvalidAges: next });
              }}
            />

            <RuleToggleRow
              title="Contact Format Remediation (Phone & Email)"
              description="Standardize valid 10-digit numbers to +1 (XXX) XXX-XXXX, repair common [at] email typos, and flag unrecoverable entries."
              checked={config.remediateContactFormats}
              onChange={() => toggle('remediateContactFormats')}
            />

            <RuleToggleRow
              title="Categorical & ICD-10 Standardization"
              description="Map gender variants, department aliases (e.g., ER, cardio), blood group spellings, and invalid diagnosis codes to clinical vocabularies."
              checked={config.standardizeCategories}
              onChange={() => toggle('standardizeCategories')}
            />

            <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-[14px] font-medium text-[#202923]">
                  Numerical Outlier Remediation
                </div>
                <div className="text-[12px] text-[#5A665E] mt-0.5">
                  Control how extreme billing spikes (Z-score &gt; 3.0) and negative charges are treated.
                </div>
              </div>
              <select
                aria-label="Outlier handling mode"
                value={config.handleOutliers}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    handleOutliers: e.target.value as CleaningConfig['handleOutliers'],
                  })
                }
                className="h-9 px-3 rounded-xl bg-white border border-[#202923]/12 text-[12px] font-medium text-[#202923] focus:outline-none focus:ring-2 focus:ring-[#4A6A55] shrink-0"
              >
                <option value="winsorize">Winsorize to IQR Fence & Fix Negatives</option>
                <option value="flag">Preserve Value & Attach Audit Flag</option>
                <option value="keep">Keep Unchanged</option>
              </select>
            </div>

            <RuleToggleRow
              title="Attach _Data_Quality_Flag Audit Column"
              description="Annotate remediated rows with explicit provenance markers (e.g., IMPUTED_AGE, SWAPPED_REVERSED_DATES, Verified)."
              checked={config.flagInconsistentRecords}
              onChange={() => toggle('flagInconsistentRecords')}
            />
          </div>
        </section>

        <section className="glass-panel p-6 xl:col-span-5 flex flex-col justify-between">
          <div>
            <h2 className="text-[16px] font-semibold text-[#202923]">
              Projected Operations Impact
            </h2>
            <p className="text-[13px] text-[#5A665E] mt-0.5">
              Live dry-run counts before committing transformations.
            </p>

            <div className="mt-4 divide-y divide-[#202923]/8">
              {dryRunPreview.operations.length === 0 ? (
                <div className="py-8 text-center text-[13px] text-[#5A665E]">
                  No operations selected or dataset requires zero modifications.
                </div>
              ) : (
                dryRunPreview.operations.map((op) => (
                  <div key={op.operation} className="py-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[13px] font-medium text-[#202923]">{op.operation}</div>
                      <div className="text-[12px] text-[#5A665E] mt-0.5">{op.description}</div>
                    </div>
                    <span className="font-mono tabular-nums text-[14px] font-semibold text-[#4A6A55] shrink-0">
                      {op.affectedCount.toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-[#202923]/8 text-[12px] text-[#5A665E]">
            Flagged provenance records:{' '}
            <span className="font-mono tabular-nums font-medium text-[#202923]">
              {dryRunPreview.flaggedRecordsCount.toLocaleString()}
            </span>
          </div>
        </section>
      </div>

      {/* Side-by-Side Cell Diff Preview Table */}
      <section className="glass-panel p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-[16px] font-semibold text-[#202923]">
              Pre-Execution Cell Transformation Preview
            </h2>
            <p className="text-[13px] text-[#5A665E] mt-0.5">
              Sample of before-and-after field changes (first 60 transformations shown; direct PHI masked).
            </p>
          </div>

          <select
            aria-label="Filter diff operation"
            value={diffFilter}
            onChange={(e) => setDiffFilter(e.target.value)}
            className="h-9 px-3 rounded-xl bg-white/85 border border-[#202923]/10 text-[12px] font-medium text-[#202923] focus:outline-none focus:ring-2 focus:ring-[#4A6A55]"
          >
            {uniqueOperations.map((op) => (
              <option key={op} value={op}>
                {op === 'All' ? 'All Operations' : op}
              </option>
            ))}
          </select>
        </div>

        <div className="surface-solid overflow-x-auto">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[#202923]/8 text-[#5A665E] bg-[#F5F7F5]/65">
                <th className="py-2.5 px-3 font-medium">Row</th>
                <th className="py-2.5 px-3 font-medium">Patient ID</th>
                <th className="py-2.5 px-3 font-medium">Column</th>
                <th className="py-2.5 px-3 font-medium">Operation</th>
                <th className="py-2.5 px-3 font-medium">Before</th>
                <th className="py-2.5 px-3 font-medium">After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#202923]/6">
              {visibleDiffs.map((diff, idx) => (
                <tr key={`${diff.rowIndex}-${diff.column}-${idx}`} className="hover:bg-[#789681]/6">
                  <td className="py-2 px-3 font-mono tabular-nums text-[#78827B]">
                    {diff.rowIndex + 1}
                  </td>
                  <td className="py-2 px-3 font-mono tabular-nums text-[#202923] whitespace-nowrap">
                    {allowUnmask ? diff.patientId : maskPatientId(diff.patientId)}
                  </td>
                  <td className="py-2 px-3 font-mono text-[#5A665E] whitespace-nowrap">
                    {diff.column}
                  </td>
                  <td className="py-2 px-3 text-[#202923] whitespace-nowrap">{diff.operation}</td>
                  <td className="py-2 px-3 font-mono text-[#B53838] whitespace-nowrap">
                    {diff.before === '(empty)'
                      ? '(empty)'
                      : maskCellValue(diff.column, diff.before, policy, allowUnmask)}
                  </td>
                  <td className="py-2 px-3 font-mono text-[#2B6B4F] font-medium whitespace-nowrap">
                    {maskCellValue(diff.column, diff.after, policy, allowUnmask)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Glassmorphism Confirmation Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202923]/25 backdrop-blur-xs">
          <div className="glass-modal max-w-lg w-full p-6 space-y-5" role="dialog" aria-modal="true">
            <div>
              <h3 className="text-[18px] font-semibold text-[#202923]">
                Confirm Automated Cleaning Execution
              </h3>
              <p className="text-[13px] text-[#5A665E] mt-1 leading-relaxed">
                This will generate a new cleaned snapshot of{' '}
                <strong className="text-[#202923]">{dataset.name}</strong>, record the processing run in SQLite history, and append an immutable audit entry. Original data stays untouched.
              </p>
            </div>

            <div className="surface-solid p-4 grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-[11px] text-[#5A665E]">Output Rows</div>
                <div className="font-mono tabular-nums text-[18px] font-semibold text-[#202923] mt-0.5">
                  {dryRunPreview.cleanedRows.length.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#5A665E]">Duplicates Cut</div>
                <div className="font-mono tabular-nums text-[18px] font-semibold text-[#202923] mt-0.5">
                  {dryRunPreview.removedDuplicateCount.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#5A665E]">Cells Cleaned</div>
                <div className="font-mono tabular-nums text-[18px] font-semibold text-[#2B6B4F] mt-0.5">
                  {dryRunPreview.cellsModifiedCount.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={applying}
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-white/80 hover:bg-white border border-[#202923]/12 text-[13px] font-medium text-[#202923]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={applying}
                onClick={() => void handleConfirmApply()}
                className="px-4 py-2 rounded-xl bg-[#4A6A55] hover:bg-[#385342] text-white text-[13px] font-medium disabled:opacity-60"
              >
                {applying ? 'Applying Pipeline...' : 'Apply Cleaning Operations'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface RuleToggleRowProps {
  title: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  extra?: React.ReactNode;
}

const RuleToggleRow: React.FC<RuleToggleRowProps> = ({
  title,
  description,
  checked,
  onChange,
  extra,
}) => (
  <div className="py-3.5 first:pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div className="pr-3">
      <div className="text-[14px] font-medium text-[#202923]">{title}</div>
      <div className="text-[12px] text-[#5A665E] mt-0.5 leading-relaxed">{description}</div>
    </div>
    <div className="flex items-center gap-3 shrink-0">
      {extra}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4A6A55] ${
          checked ? 'bg-[#4A6A55]' : 'bg-[#202923]/18'
        }`}
      >
        <span
          className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-xs transition-transform ${
            checked ? 'translate-x-5.5' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  </div>
);
