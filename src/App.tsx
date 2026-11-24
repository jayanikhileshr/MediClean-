import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AuditLogEntry,
  CleaningConfig,
  CleaningResult,
  DatasetState,
  GovernancePolicy,
  NavPage,
  PatientRecord,
  ProcessingRunRecord,
  ToastMessage,
  UserRole,
  ValidationRuleConfig,
  ValidationSuiteReport,
} from './types/mediclean';
import {
  SAMPLE_DATASETS,
  generateSyntheticDataset,
} from './engine/syntheticGenerator';
import { assessDatasetQuality } from './engine/qualityAssessor';
import { DEFAULT_CLEANING_CONFIG } from './engine/dataCleaner';
import { DEFAULT_VALIDATION_CONFIG, runValidationSuite } from './engine/validator';
import {
  DEFAULT_GOVERNANCE_POLICY,
  ROLE_MATRIX,
  computeDatasetHash,
} from './engine/governance';
import {
  appendAuditLog,
  fetchAuditLogs,
  fetchGovernancePolicy,
  fetchProcessingHistory,
  recordProcessingRun,
  removeProcessingRun,
  updateGovernancePolicy,
} from './engine/apiClient';
import { Layout } from './components/Layout';
import { DashboardView } from './components/DashboardView';
import { UploadView } from './components/UploadView';
import { QualityView } from './components/QualityView';
import { CleaningView } from './components/CleaningView';
import { GovernanceView } from './components/GovernanceView';
import { ValidationView } from './components/ValidationView';
import { ReportsView } from './components/ReportsView';

function buildInitialDataset(): DatasetState {
  const sample = SAMPLE_DATASETS[0];
  const rows = generateSyntheticDataset(sample);
  const columns = Object.keys(rows[0] || {});
  return {
    id: sample.id,
    name: sample.name,
    sourceType: 'Synthetic Sample',
    uploadedAt: new Date().toISOString(),
    columns,
    originalRows: rows,
    cleanedRows: null,
    originalHash: 'computing...',
    cleanedHash: null,
  };
}

export default function App() {
  const [activePage, setActivePage] = useState<NavPage>('dashboard');
  const [activeRole, setActiveRole] = useState<UserRole>('Privacy Officer');
  const [dataset, setDataset] = useState<DatasetState>(() => buildInitialDataset());
  const [policy, setPolicy] = useState<GovernancePolicy>(DEFAULT_GOVERNANCE_POLICY);
  const [allowUnmask, setAllowUnmask] = useState<boolean>(false);

  const [cleaningConfig, setCleaningConfig] = useState<CleaningConfig>(DEFAULT_CLEANING_CONFIG);
  const [cleaningResult, setCleaningResult] = useState<CleaningResult | null>(null);

  const [validationConfig, setValidationConfig] = useState<ValidationRuleConfig>(
    DEFAULT_VALIDATION_CONFIG
  );
  const [validationTarget, setValidationTarget] = useState<'original' | 'cleaned'>('original');

  const [historyRuns, setHistoryRuns] = useState<ProcessingRunRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback(
    (title: string, detail: string, tone: ToastMessage['tone'] = 'info') => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, detail, tone }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const writeAudit = useCallback(
    async (
      actionType: string,
      details: string,
      severity: 'Info' | 'Governance' | 'Security' = 'Info',
      roleOverride?: UserRole,
      datasetNameOverride?: string
    ) => {
      try {
        const entry = await appendAuditLog({
          actorRole: roleOverride ?? activeRole,
          actionType,
          targetDataset: datasetNameOverride ?? dataset.name,
          details,
          severity,
        });
        setAuditLogs((prev) => [entry, ...prev].slice(0, 150));
      } catch {
        // Keep UI responsive even if backend is restarting
      }
    },
    [activeRole, dataset.name]
  );

  // Compute initial SHA-256 fingerprint & hydrate SQLite history, audit logs, and governance policy
  useEffect(() => {
    let active = true;
    void computeDatasetHash(dataset.originalRows).then((hash) => {
      if (active) {
        setDataset((prev) => ({ ...prev, originalHash: hash }));
      }
    });

    void Promise.all([
      fetchProcessingHistory().catch(() => []),
      fetchAuditLogs().catch(() => []),
      fetchGovernancePolicy().catch(() => null),
    ]).then(([runs, logs, savedPolicy]) => {
      if (!active) return;
      setHistoryRuns(runs);
      setAuditLogs(logs);
      if (savedPolicy) {
        setPolicy({ ...DEFAULT_GOVERNANCE_POLICY, ...savedPolicy });
      }
      if (logs.length === 0) {
        void appendAuditLog({
          actorRole: 'Privacy Officer',
          actionType: 'Dataset Initialized',
          targetDataset: SAMPLE_DATASETS[0].name,
          details: `Loaded default synthetic hospital registry (${SAMPLE_DATASETS[0].recordCount} records) with HIPAA Safe Harbor masking active.`,
          severity: 'Info',
        })
          .then((log) => {
            if (active) setAuditLogs([log]);
          })
          .catch(() => undefined);
      }
    });

    return () => {
      active = false;
    };
    // Run once on initial mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dynamically compute Data Quality Assessments from actual dataset rows
  const originalReport = useMemo(
    () => assessDatasetQuality(dataset.originalRows, dataset.columns),
    [dataset.originalRows, dataset.columns]
  );

  const cleanedReport = useMemo(() => {
    if (!dataset.cleanedRows) return null;
    const cols =
      dataset.cleanedRows.length > 0 ? Object.keys(dataset.cleanedRows[0]) : dataset.columns;
    return assessDatasetQuality(dataset.cleanedRows, cols);
  }, [dataset.cleanedRows, dataset.columns]);

  // Dynamically compute Validation Suite results
  const validationReport: ValidationSuiteReport = useMemo(() => {
    const useCleaned = validationTarget === 'cleaned' && dataset.cleanedRows !== null;
    const rows = useCleaned && dataset.cleanedRows ? dataset.cleanedRows : dataset.originalRows;
    const cols = rows.length > 0 ? Object.keys(rows[0]) : dataset.columns;
    return runValidationSuite(rows, cols, validationConfig, useCleaned ? 'cleaned' : 'original');
  }, [dataset.originalRows, dataset.cleanedRows, dataset.columns, validationConfig, validationTarget]);

  const handleRoleChange = (nextRole: UserRole) => {
    setActiveRole(nextRole);
    if (!ROLE_MATRIX[nextRole].canUnmaskPii && allowUnmask) {
      setAllowUnmask(false);
    }
    void writeAudit(
      'RBAC Role Switched',
      `Session governance role changed to ${nextRole}.`,
      'Governance',
      nextRole
    );
    pushToast('Active Role Updated', `Permissions set to ${nextRole}.`, 'info');
  };

  const handleDatasetLoaded = async (
    name: string,
    sourceType: 'Uploaded CSV' | 'Uploaded Excel' | 'Synthetic Sample',
    columns: string[],
    rows: PatientRecord[]
  ) => {
    const hash = await computeDatasetHash(rows);
    setDataset({
      id: `ds-${Date.now()}`,
      name,
      sourceType,
      uploadedAt: new Date().toISOString(),
      columns,
      originalRows: rows,
      cleanedRows: null,
      originalHash: hash,
      cleanedHash: null,
    });
    setCleaningResult(null);
    setValidationTarget('original');

    await writeAudit(
      'Dataset Ingested',
      `Ingested ${sourceType} "${name}" (${rows.length.toLocaleString()} records, ${columns.length} columns, SHA-256 ${hash.slice(0, 12)}).`,
      'Info',
      activeRole,
      name
    );
    pushToast(
      'Dataset Loaded & Profiled',
      `${name} (${rows.length.toLocaleString()} rows) assessed automatically.`,
      'success'
    );
  };

  const handleApplyCleaning = async (config: CleaningConfig, previewResult: CleaningResult) => {
    const cleanedHash = await computeDatasetHash(previewResult.cleanedRows);
    const nextCols =
      previewResult.cleanedRows.length > 0
        ? Object.keys(previewResult.cleanedRows[0])
        : dataset.columns;
    const nextCleanedReport = assessDatasetQuality(previewResult.cleanedRows, nextCols);

    setCleaningConfig(config);
    setCleaningResult(previewResult);
    setDataset((prev) => ({
      ...prev,
      cleanedRows: previewResult.cleanedRows,
      cleanedHash,
    }));
    setValidationTarget('cleaned');

    const issuesResolved = Math.max(
      0,
      originalReport.totalIssuesCount - nextCleanedReport.totalIssuesCount
    );

    try {
      const savedRun = await recordProcessingRun({
        datasetName: dataset.name,
        sourceType: dataset.sourceType,
        recordCountBefore: dataset.originalRows.length,
        recordCountAfter: previewResult.cleanedRows.length,
        qualityScoreBefore: originalReport.overallScore,
        qualityScoreAfter: nextCleanedReport.overallScore,
        issuesDetected: originalReport.totalIssuesCount,
        issuesResolved,
        rulesApplied: previewResult.operations.map((o) => o.operation),
        originalHash: dataset.originalHash,
        cleanedHash,
        operatorRole: activeRole,
      });
      setHistoryRuns((prev) => [savedRun, ...prev]);
    } catch {
      // Keep UI functional even if persistence fails momentarily
    }

    await writeAudit(
      'Automated Cleaning Applied',
      `Cleaned ${previewResult.recordsCleanedCount.toLocaleString()} records (${previewResult.cellsModifiedCount.toLocaleString()} cell updates, ${previewResult.removedDuplicateCount} duplicates removed). Score improved ${originalReport.overallScore.toFixed(1)}% -> ${nextCleanedReport.overallScore.toFixed(1)}%.`,
      'Governance'
    );

    pushToast(
      'Cleaning Pipeline Applied',
      `Quality score rose from ${originalReport.overallScore.toFixed(1)}% to ${nextCleanedReport.overallScore.toFixed(1)}%.`,
      'success'
    );
  };

  const handleResetCleaned = async () => {
    setDataset((prev) => ({ ...prev, cleanedRows: null, cleanedHash: null }));
    setCleaningResult(null);
    setValidationTarget('original');
    await writeAudit(
      'Cleaned Snapshot Reset',
      'Discarded cleaned dataset snapshot and reverted active view to immutable original dataset.',
      'Governance'
    );
    pushToast('Snapshot Reset', 'Reverted active view to immutable original dataset.', 'info');
  };

  const handleToggleUnmask = async () => {
    if (!ROLE_MATRIX[activeRole].canUnmaskPii) return;
    const next = !allowUnmask;
    setAllowUnmask(next);
    await writeAudit(
      next ? 'PHI Reveal Enabled' : 'PHI Masking Restored',
      next
        ? 'Privacy Officer temporarily revealed synthetic patient identifiers in the active browser session.'
        : 'Privacy Officer restored HIPAA Safe Harbor PII masking across all dashboard views.',
      'Security'
    );
    pushToast(
      next ? 'Synthetic PHI Revealed' : 'Safe Harbor Masking Active',
      next
        ? 'This action has been recorded in the immutable SQLite audit log.'
        : 'All direct patient identifiers are masked across views.',
      next ? 'warning' : 'success'
    );
  };

  const handleUpdatePolicy = async (nextPolicy: GovernancePolicy) => {
    setPolicy(nextPolicy);
    try {
      await updateGovernancePolicy(nextPolicy, activeRole);
    } catch {
      // ignore transient network errors
    }
    await writeAudit(
      'Governance Policy Updated',
      `Updated HIPAA masking settings (MRN: ${nextPolicy.maskPatientId}, Name: ${nextPolicy.maskPatientName}, Email: ${nextPolicy.maskEmail}, Phone: ${nextPolicy.maskPhone}).`,
      'Governance'
    );
    pushToast('Policy Saved', 'Governance masking policy persisted to SQLite.', 'success');
  };

  const handleRunValidation = async (
    target: 'original' | 'cleaned',
    nextConfig: ValidationRuleConfig
  ) => {
    setValidationConfig(nextConfig);
    setValidationTarget(target);
    const rows = target === 'cleaned' && dataset.cleanedRows ? dataset.cleanedRows : dataset.originalRows;
    const cols = rows.length > 0 ? Object.keys(rows[0]) : dataset.columns;
    const res = runValidationSuite(rows, cols, nextConfig, target);
    await writeAudit(
      'Validation Suite Executed',
      `Executed ${res.totalRules} clinical expectations on ${target} dataset: ${res.passedRules}/${res.totalRules} passed (${res.overallPassRate.toFixed(1)}% pass rate).`,
      'Info'
    );
    pushToast(
      'Validation Complete',
      `${res.passedRules} of ${res.totalRules} rules passed (${res.overallPassRate.toFixed(1)}%).`,
      res.failedRules === 0 ? 'success' : 'info'
    );
  };

  const handleDeleteHistoryRun = async (id: string) => {
    if (!ROLE_MATRIX[activeRole].canDeleteHistory) return;
    try {
      await removeProcessingRun(id);
      setHistoryRuns((prev) => prev.filter((r) => r.id !== id));
      await writeAudit(
        'History Record Purged',
        `Privacy Officer deleted archived processing run ${id}.`,
        'Security'
      );
      pushToast('Run Removed', 'Archived processing run deleted from SQLite history.', 'info');
    } catch {
      pushToast('Delete Failed', 'Unable to remove processing run from database.', 'error');
    }
  };

  const handleLogExport = async (formatLabel: string) => {
    await writeAudit(
      'Report / Dataset Exported',
      `Exported ${formatLabel} for dataset "${dataset.name}".`,
      'Governance'
    );
    pushToast('Export Ready', `Downloaded ${formatLabel}.`, 'success');
  };

  return (
    <Layout
      activePage={activePage}
      onNavigate={setActivePage}
      activeRole={activeRole}
      onRoleChange={handleRoleChange}
      datasetName={dataset.name}
      recordCount={(dataset.cleanedRows ?? dataset.originalRows).length}
      isCleaned={dataset.cleanedRows !== null}
      toasts={toasts}
      onDismissToast={dismissToast}
    >
      {activePage === 'dashboard' && (
        <DashboardView
          dataset={dataset}
          activeRole={activeRole}
          originalReport={originalReport}
          cleanedReport={cleanedReport}
          cleaningResult={cleaningResult}
          validationReport={validationReport}
          onNavigate={setActivePage}
        />
      )}

      {activePage === 'upload' && (
        <UploadView
          dataset={dataset}
          activeRole={activeRole}
          policy={policy}
          allowUnmask={allowUnmask}
          onDatasetLoaded={handleDatasetLoaded}
        />
      )}

      {activePage === 'quality' && (
        <QualityView
          originalReport={originalReport}
          cleanedReport={cleanedReport}
          policy={policy}
          allowUnmask={allowUnmask}
          onNavigate={setActivePage}
        />
      )}

      {activePage === 'cleaning' && (
        <CleaningView
          dataset={dataset}
          activeRole={activeRole}
          policy={policy}
          allowUnmask={allowUnmask}
          config={cleaningConfig}
          onConfigChange={setCleaningConfig}
          appliedResult={cleaningResult}
          originalReport={originalReport}
          cleanedReport={cleanedReport}
          onApplyCleaning={handleApplyCleaning}
          onResetCleaned={handleResetCleaned}
        />
      )}

      {activePage === 'governance' && (
        <GovernanceView
          dataset={dataset}
          activeRole={activeRole}
          policy={policy}
          allowUnmask={allowUnmask}
          onToggleUnmask={handleToggleUnmask}
          onUpdatePolicy={handleUpdatePolicy}
          auditLogs={auditLogs}
        />
      )}

      {activePage === 'validation' && (
        <ValidationView
          dataset={dataset}
          policy={policy}
          allowUnmask={allowUnmask}
          config={validationConfig}
          onConfigChange={setValidationConfig}
          report={validationReport}
          onRunValidation={handleRunValidation}
        />
      )}

      {activePage === 'reports' && (
        <ReportsView
          dataset={dataset}
          activeRole={activeRole}
          policy={policy}
          allowUnmask={allowUnmask}
          originalReport={originalReport}
          cleanedReport={cleanedReport}
          cleaningResult={cleaningResult}
          validationReport={validationReport}
          historyRuns={historyRuns}
          onDeleteRun={handleDeleteHistoryRun}
          onLogExport={handleLogExport}
        />
      )}
    </Layout>
  );
}
