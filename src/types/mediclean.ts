export type NavPage =
  | 'dashboard'
  | 'upload'
  | 'quality'
  | 'cleaning'
  | 'governance'
  | 'validation'
  | 'reports';

export type UserRole =
  | 'Privacy Officer'
  | 'Data Steward'
  | 'Clinical Analyst'
  | 'Compliance Auditor';

export interface RolePermissions {
  role: UserRole;
  description: string;
  canUpload: boolean;
  canClean: boolean;
  canUnmaskPii: boolean;
  canEditGovernance: boolean;
  canExportClean: boolean;
  canDeleteHistory: boolean;
}

export type PatientRecord = Record<string, string | number | null | undefined>;

export interface ColumnProfile {
  name: string;
  inferredType: 'string' | 'number' | 'date' | 'email' | 'phone' | 'identifier' | 'categorical';
  nonNullCount: number;
  missingCount: number;
  completenessPct: number;
  uniqueCount: number;
  sampleValues: string[];
  piiCategory: 'Direct Identifier (PHI)' | 'Quasi-Identifier' | 'Clinical Sensitive' | 'Operational';
  hipaaTag: string;
}

export type IssueCategory =
  | 'Missing Values'
  | 'Duplicate Records'
  | 'Invalid Emails'
  | 'Invalid Phone Numbers'
  | 'Invalid Dates'
  | 'Inconsistent Gender'
  | 'Invalid Ages'
  | 'Invalid MRN Identifiers'
  | 'Inconsistent Departments'
  | 'Numerical Outliers';

export type IssueSeverity = 'Critical' | 'Warning' | 'Moderate';

export interface QualityIssue {
  id: string;
  rowIndex: number;
  patientId: string;
  column: string;
  category: IssueCategory;
  severity: IssueSeverity;
  rawValue: string;
  reason: string;
  recommendedFix: string;
}

export interface QualityDimensionScores {
  completeness: number;
  uniqueness: number;
  validity: number;
  consistency: number;
  integrity: number;
}

export interface AnomalyPoint {
  rowIndex: number;
  patientId: string;
  department: string;
  age: number;
  treatmentCost: number;
  zScoreCost: number;
  isOutlier: boolean;
}

export interface QualityAssessmentReport {
  totalRecords: number;
  totalColumns: number;
  totalCells: number;
  overallScore: number;
  dimensions: QualityDimensionScores;
  issuesByCategory: Record<IssueCategory, number>;
  missingCellsCount: number;
  duplicateRecordsCount: number;
  invalidRecordsCount: number;
  outlierRecordsCount: number;
  totalIssuesCount: number;
  issues: QualityIssue[];
  anomalies: AnomalyPoint[];
  departmentStats: Array<{
    department: string;
    recordCount: number;
    avgCost: number;
    issueCount: number;
  }>;
  assessedAt: string;
}

export interface CleaningConfig {
  handleMissingValues: boolean;
  missingStrategy: 'impute' | 'placeholder' | 'drop_critical';
  removeDuplicates: boolean;
  standardizeDates: boolean;
  fixReversedDates: boolean;
  normalizeText: boolean;
  correctDataTypes: boolean;
  remediateInvalidAges: boolean;
  remediateContactFormats: boolean;
  standardizeCategories: boolean;
  handleOutliers: 'flag' | 'winsorize' | 'keep';
  flagInconsistentRecords: boolean;
}

export interface CellDiff {
  rowIndex: number;
  patientId: string;
  column: string;
  before: string;
  after: string;
  operation: string;
}

export interface CleaningOperationSummary {
  operation: string;
  affectedCount: number;
  description: string;
}

export interface CleaningResult {
  cleanedRows: PatientRecord[];
  removedDuplicateCount: number;
  droppedCriticalRowsCount: number;
  cellsModifiedCount: number;
  recordsCleanedCount: number;
  flaggedRecordsCount: number;
  operations: CleaningOperationSummary[];
  diffs: CellDiff[];
  appliedAt: string;
}

export interface ValidationRuleConfig {
  minAge: number;
  maxAge: number;
  requireIsoDates: boolean;
  requireDischargeAfterAdmission: boolean;
  strictMrnPattern: boolean;
  strictIcd10Pattern: boolean;
  requireCanonicalDepartment: boolean;
  mandatoryFields: string[];
}

export interface ValidationRuleResult {
  ruleId: string;
  ruleName: string;
  expectationType: string;
  domain: string;
  column: string;
  passedCount: number;
  failedCount: number;
  totalEvaluated: number;
  passRate: number;
  status: 'Passed' | 'Failed';
  failedSamples: Array<{
    rowIndex: number;
    patientId: string;
    value: string;
    detail: string;
  }>;
}

export interface ValidationSuiteReport {
  target: 'original' | 'cleaned';
  executedAt: string;
  totalRules: number;
  passedRules: number;
  failedRules: number;
  overallPassRate: number;
  passedRecordsCount: number;
  failedRecordsCount: number;
  rules: ValidationRuleResult[];
}

export interface GovernancePolicy {
  maskPatientId: boolean;
  maskPatientName: boolean;
  maskEmail: boolean;
  maskPhone: boolean;
  enforceHipaaSafeHarborOnExport: boolean;
  autoLogAllActions: boolean;
}

export interface ProcessingRunRecord {
  id: string;
  datasetName: string;
  sourceType: 'Uploaded CSV' | 'Uploaded Excel' | 'Synthetic Sample';
  recordCountBefore: number;
  recordCountAfter: number;
  qualityScoreBefore: number;
  qualityScoreAfter: number;
  issuesDetected: number;
  issuesResolved: number;
  rulesApplied: string[];
  originalHash: string;
  cleanedHash: string;
  operatorRole: UserRole;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorRole: UserRole;
  actionType: string;
  targetDataset: string;
  details: string;
  severity: 'Info' | 'Governance' | 'Security';
  integrityHash: string;
}

export interface DatasetState {
  id: string;
  name: string;
  sourceType: 'Uploaded CSV' | 'Uploaded Excel' | 'Synthetic Sample';
  uploadedAt: string;
  columns: string[];
  originalRows: PatientRecord[];
  cleanedRows: PatientRecord[] | null;
  originalHash: string;
  cleanedHash: string | null;
}

export interface ToastMessage {
  id: string;
  title: string;
  detail: string;
  tone: 'success' | 'info' | 'warning' | 'error';
}
