import React, { useMemo, useState } from 'react';
import {
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Trash2,
} from 'lucide-react';
import type {
  CleaningResult,
  DatasetState,
  GovernancePolicy,
  ProcessingRunRecord,
  QualityAssessmentReport,
  UserRole,
  ValidationSuiteReport,
} from '../types/mediclean';
import {
  ROLE_MATRIX,
  maskCellValue,
  maskPatientId,
} from '../engine/governance';
import {
  exportDatasetToCsv,
  exportDatasetToExcel,
  exportQualityReportHtml,
  exportQualityReportJson,
  exportValidationResultsCsv,
} from '../engine/exporter';

interface ReportsViewProps {
  dataset: DatasetState;
  activeRole: UserRole;
  policy: GovernancePolicy;
  allowUnmask: boolean;
  originalReport: QualityAssessmentReport;
  cleanedReport: QualityAssessmentReport | null;
  cleaningResult: CleaningResult | null;
  validationReport: ValidationSuiteReport;
  historyRuns: ProcessingRunRecord[];
  onDeleteRun: (id: string) => Promise<void>;
  onLogExport: (formatLabel: string) => Promise<void>;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  dataset,
  activeRole,
  policy,
  allowUnmask,
  originalReport,
  cleanedReport,
  cleaningResult,
  validationReport,
  historyRuns,
  onDeleteRun,
  onLogExport,
}) => {
  const [deidentifyExport, setDeidentifyExport] = useState<boolean>(
    policy.enforceHipaaSafeHarborOnExport
  );
  const [comparePage, setComparePage] = useState(0);

  const perms = ROLE_MATRIX[activeRole];
  const baseName = dataset.name.replace(/\.(csv|xlsx|xls)$/i, '');
  const exportRows = dataset.cleanedRows ?? dataset.originalRows;

  const comparisonDiffs = useMemo(() => {
    if (!cleaningResult) return [];
    return cleaningResult.diffs;
  }, [cleaningResult]);

  const DIFFS_PER_PAGE = 12;
  const totalComparePages = Math.max(1, Math.ceil(comparisonDiffs.length / DIFFS_PER_PAGE));
  const safeComparePage = Math.min(comparePage, totalComparePages - 1);
  const visibleCompareDiffs = comparisonDiffs.slice(
    safeComparePage * DIFFS_PER_PAGE,
    (safeComparePage + 1) * DIFFS_PER_PAGE
  );

  const handleExportCsv = async () => {
    exportDatasetToCsv(
      exportRows,
      `${baseName}_${dataset.cleanedRows ? 'cleaned' : 'original'}${deidentifyExport ? '_deidentified' : ''}.csv`,
      deidentifyExport,
      policy
    );
    await onLogExport(`CSV (${deidentifyExport ? 'HIPAA Safe Harbor Masked' : 'Standard'})`);
  };

  const handleExportExcel = async () => {
    exportDatasetToExcel(
      exportRows,
      `${baseName}_${dataset.cleanedRows ? 'cleaned' : 'original'}${deidentifyExport ? '_deidentified' : ''}.xlsx`,
      deidentifyExport,
      policy
    );
    await onLogExport(`Excel .xlsx (${deidentifyExport ? 'HIPAA Safe Harbor Masked' : 'Standard'})`);
  };

  const handleExportHtml = async () => {
    exportQualityReportHtml(dataset.name, originalReport, cleanedReport, validationReport);
    await onLogExport('Executive HTML Quality & Governance Report');
  };

  const handleExportJson = async () => {
    exportQualityReportJson(dataset.name, originalReport, cleanedReport, validationReport);
    await onLogExport('Structured JSON Quality & Validation Report');
  };

  const handleExportValidation = async () => {
    exportValidationResultsCsv(validationReport, dataset.name);
    await onLogExport('Validation Suite Results CSV');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight text-[#202923]">
          Reports, Export & Processing History
        </h1>
        <p className="text-[14px] text-[#5A665E] mt-1">
          Download cleaned datasets in CSV or Excel, generate executive governance reports, compare original vs. cleaned records, and audit historical SQLite runs.
        </p>
      </div>

      {/* Export Center */}
      <section className="glass-panel p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold text-[#202923]">
              Dataset & Compliance Export Center
            </h2>
            <p className="text-[13px] text-[#5A665E] mt-0.5">
              Active target: <strong className="text-[#202923]">{dataset.cleanedRows ? 'Cleaned Dataset' : 'Original Dataset (not yet cleaned)'}</strong> ·{' '}
              <span className="font-mono tabular-nums">{exportRows.length.toLocaleString()} records</span>
            </p>
          </div>

          <label className="inline-flex items-center gap-2.5 text-[13px] font-medium text-[#202923] cursor-pointer">
            <input
              type="checkbox"
              checked={deidentifyExport}
              onChange={(e) => setDeidentifyExport(e.target.checked)}
              className="accent-[#4A6A55] w-4 h-4"
            />
            <span>Apply HIPAA Safe Harbor Masking on Export</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <ExportActionCard
            icon={Download}
            title="Download Cleaned CSV"
            subtitle="RFC-4180 CSV file ready for EHR/BI ingestion."
            buttonLabel="Export .CSV"
            disabled={!perms.canExportClean}
            onClick={() => void handleExportCsv()}
          />
          <ExportActionCard
            icon={FileSpreadsheet}
            title="Download Cleaned Excel"
            subtitle="Formatted .xlsx workbook with clinical worksheet."
            buttonLabel="Export .XLSX"
            disabled={!perms.canExportClean}
            onClick={() => void handleExportExcel()}
          />
          <ExportActionCard
            icon={FileText}
            title="Executive Governance Report"
            subtitle="Printable HTML report with before/after tables and validation."
            buttonLabel="Download HTML"
            disabled={false}
            onClick={() => void handleExportHtml()}
          />
          <ExportActionCard
            icon={FileCode2}
            title="Structured Quality JSON"
            subtitle="Machine-readable JSON payload for CI/CD governance pipelines."
            buttonLabel="Download JSON"
            disabled={false}
            onClick={() => void handleExportJson()}
          />
          <ExportActionCard
            icon={Download}
            title="Validation Results CSV"
            subtitle="Per-expectation pass/fail counts and compliance percentages."
            buttonLabel="Export Validation"
            disabled={false}
            onClick={() => void handleExportValidation()}
          />
        </div>
      </section>

      {/* Before-and-After Comparison Explorer */}
      <section className="glass-panel p-6">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-4">
          <div>
            <h2 className="text-[16px] font-semibold text-[#202923]">
              Original vs. Cleaned Record Comparison
            </h2>
            <p className="text-[13px] text-[#5A665E] mt-0.5">
              {cleaningResult && cleanedReport
                ? `Score improved from ${originalReport.overallScore.toFixed(1)}% to ${cleanedReport.overallScore.toFixed(1)}% across ${cleaningResult.cellsModifiedCount.toLocaleString()} cell updates and ${cleaningResult.removedDuplicateCount} removed duplicates.`
                : 'Apply automated cleaning first to view cell-by-cell before-and-after comparisons.'}
            </p>
          </div>
          {cleaningResult && (
            <span className="font-mono tabular-nums text-[12px] text-[#5A665E]">
              {comparisonDiffs.length.toLocaleString()} logged cell diffs
            </span>
          )}
        </div>

        {!cleaningResult ? (
          <div className="surface-solid py-10 px-6 text-center text-[13px] text-[#5A665E]">
            No cleaned snapshot exists for the current dataset yet. Visit Data Cleaning to apply transformations.
          </div>
        ) : (
          <>
            <div className="surface-solid overflow-x-auto">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-[#202923]/8 text-[#5A665E] bg-[#F5F7F5]/65">
                    <th className="py-2.5 px-3 font-medium">Row</th>
                    <th className="py-2.5 px-3 font-medium">Patient ID</th>
                    <th className="py-2.5 px-3 font-medium">Column</th>
                    <th className="py-2.5 px-3 font-medium">Transformation</th>
                    <th className="py-2.5 px-3 font-medium">Original Value</th>
                    <th className="py-2.5 px-3 font-medium">Cleaned Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#202923]/6">
                  {visibleCompareDiffs.map((diff, idx) => (
                    <tr key={`${diff.rowIndex}-${diff.column}-${idx}`} className="hover:bg-[#789681]/6">
                      <td className="py-2 px-3 font-mono tabular-nums text-[#78827B]">
                        {diff.rowIndex + 1}
                      </td>
                      <td className="py-2 px-3 font-mono tabular-nums text-[#202923]">
                        {allowUnmask ? diff.patientId : maskPatientId(diff.patientId)}
                      </td>
                      <td className="py-2 px-3 font-mono text-[#5A665E]">{diff.column}</td>
                      <td className="py-2 px-3 text-[#202923]">{diff.operation}</td>
                      <td className="py-2 px-3 font-mono text-[#B53838]">
                        {diff.before === '(empty)'
                          ? '(empty)'
                          : maskCellValue(diff.column, diff.before, policy, allowUnmask)}
                      </td>
                      <td className="py-2 px-3 font-mono text-[#2B6B4F] font-medium">
                        {maskCellValue(diff.column, diff.after, policy, allowUnmask)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between text-[12px] text-[#5A665E]">
              <span className="font-mono tabular-nums">
                Page {safeComparePage + 1} of {totalComparePages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safeComparePage === 0}
                  onClick={() => setComparePage((p) => Math.max(0, p - 1))}
                  className="px-3 py-1.5 rounded-lg bg-white/80 border border-[#202923]/10 text-[#202923] disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={safeComparePage >= totalComparePages - 1}
                  onClick={() => setComparePage((p) => Math.min(totalComparePages - 1, p + 1))}
                  className="px-3 py-1.5 rounded-lg bg-white/80 border border-[#202923]/10 text-[#202923] disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* SQLite Processing History Table */}
      <section className="glass-panel p-6">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="text-[16px] font-semibold text-[#202923]">
              Cleaning & Processing History (SQLite Archive)
            </h2>
            <p className="text-[13px] text-[#5A665E] mt-0.5">
              Persistent history of automated data-cleaning runs stored in the MediClean SQLite database.
            </p>
          </div>
          <span className="font-mono tabular-nums text-[12px] text-[#5A665E]">
            {historyRuns.length} recorded run{historyRuns.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="surface-solid overflow-x-auto">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[#202923]/8 text-[#5A665E] bg-[#F5F7F5]/65">
                <th className="py-2.5 px-3 font-medium">Completed</th>
                <th className="py-2.5 px-3 font-medium">Dataset</th>
                <th className="py-2.5 px-3 font-medium">Operator</th>
                <th className="py-2.5 px-3 font-medium text-right">Rows (Before → After)</th>
                <th className="py-2.5 px-3 font-medium text-right">Score Gain</th>
                <th className="py-2.5 px-3 font-medium text-right">Issues Resolved</th>
                <th className="py-2.5 px-3 font-medium text-right">Checksum</th>
                {perms.canDeleteHistory && <th className="py-2.5 px-3 font-medium text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#202923]/6">
              {historyRuns.length === 0 ? (
                <tr>
                  <td colSpan={perms.canDeleteHistory ? 8 : 7} className="py-8 text-center text-[#5A665E]">
                    No cleaning runs stored yet. Apply cleaning on a dataset to archive your first run in SQLite.
                  </td>
                </tr>
              ) : (
                historyRuns.map((run) => (
                  <tr key={run.id} className="hover:bg-[#789681]/6">
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[#5A665E] whitespace-nowrap">
                      {new Date(run.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-[#202923] whitespace-nowrap">
                      {run.datasetName}
                    </td>
                    <td className="py-2.5 px-3 text-[#5A665E] whitespace-nowrap">
                      {run.operatorRole}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#202923] whitespace-nowrap">
                      {run.recordCountBefore.toLocaleString()} → {run.recordCountAfter.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#2B6B4F] font-medium whitespace-nowrap">
                      {run.qualityScoreBefore.toFixed(1)}% → {run.qualityScoreAfter.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#202923]">
                      {run.issuesResolved.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#78827B]">
                      {run.cleanedHash.slice(0, 10)}
                    </td>
                    {perms.canDeleteHistory && (
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => void onDeleteRun(run.id)}
                          aria-label={`Delete run ${run.datasetName}`}
                          className="p-1.5 rounded-lg text-[#78827B] hover:text-[#B53838] hover:bg-[#B53838]/8 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
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

interface ExportActionCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  buttonLabel: string;
  disabled: boolean;
  onClick: () => void;
}

const ExportActionCard: React.FC<ExportActionCardProps> = ({
  icon: Icon,
  title,
  subtitle,
  buttonLabel,
  disabled,
  onClick,
}) => (
  <div className="surface-solid p-4 flex flex-col justify-between gap-4">
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-[#789681]/14 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-[#4A6A55]" />
      </div>
      <div>
        <div className="text-[14px] font-semibold text-[#202923]">{title}</div>
        <div className="text-[12px] text-[#5A665E] mt-0.5 leading-snug">{subtitle}</div>
      </div>
    </div>
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full py-2 px-3 rounded-xl bg-[#4A6A55] hover:bg-[#385342] disabled:opacity-45 disabled:cursor-not-allowed text-white text-[12px] font-medium transition-colors"
    >
      {buttonLabel}
    </button>
  </div>
);
