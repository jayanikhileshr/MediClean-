import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type {
  GovernancePolicy,
  PatientRecord,
  QualityAssessmentReport,
  ValidationSuiteReport,
} from '../types/mediclean';
import { applySafeHarborMasking } from './governance';

export interface ParsedDatasetResult {
  name: string;
  sourceType: 'Uploaded CSV' | 'Uploaded Excel';
  columns: string[];
  rows: PatientRecord[];
}

export async function parseUploadedFile(file: File): Promise<ParsedDatasetResult> {
  const name = file.name;
  const lower = name.toLowerCase();

  if (file.size === 0) {
    throw new Error('The uploaded file is empty. Please upload a valid CSV or Excel dataset.');
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('File exceeds the 25 MB browser processing limit.');
  }

  if (lower.endsWith('.csv')) {
    const text = await file.text();
    const parsed = Papa.parse<PatientRecord>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });
    if (parsed.errors.length > 0 && (!parsed.data || parsed.data.length === 0)) {
      throw new Error(`CSV parse error: ${parsed.errors[0].message}`);
    }
    const columns = (parsed.meta.fields || []).filter((c) => c.trim() !== '');
    if (columns.length === 0 || parsed.data.length === 0) {
      throw new Error('No tabular columns or patient rows were detected in this CSV file.');
    }
    return {
      name,
      sourceType: 'Uploaded CSV',
      columns,
      rows: parsed.data,
    };
  }

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('No worksheets found in the Excel workbook.');
    }
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<PatientRecord>(sheet, { defval: '' });
    if (rows.length === 0) {
      throw new Error('The Excel worksheet contains no patient records.');
    }
    const columns = Object.keys(rows[0]).filter((c) => c.trim() !== '');
    return {
      name,
      sourceType: 'Uploaded Excel',
      columns,
      rows,
    };
  }

  throw new Error('Unsupported file format. Please upload a .csv, .xlsx, or .xls healthcare dataset.');
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportDatasetToCsv(
  rows: PatientRecord[],
  filename: string,
  applyDeidentification: boolean,
  policy: GovernancePolicy
): void {
  const outputRows = applyDeidentification ? applySafeHarborMasking(rows, policy) : rows;
  const csv = Papa.unparse(outputRows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

export function exportDatasetToExcel(
  rows: PatientRecord[],
  filename: string,
  applyDeidentification: boolean,
  policy: GovernancePolicy
): void {
  const outputRows = applyDeidentification ? applySafeHarborMasking(rows, policy) : rows;
  const worksheet = XLSX.utils.json_to_sheet(outputRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cleaned_Patient_Data');
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export function exportQualityReportJson(
  datasetName: string,
  originalReport: QualityAssessmentReport,
  cleanedReport: QualityAssessmentReport | null,
  validationReport: ValidationSuiteReport | null
): void {
  const payload = {
    platform: 'MediClean Healthcare Data Governance Platform',
    generatedAt: new Date().toISOString(),
    datasetName,
    privacyNotice: 'All exported reports exclude direct patient identifiers (HIPAA Safe Harbor compliant).',
    originalQuality: {
      totalRecords: originalReport.totalRecords,
      overallScore: originalReport.overallScore,
      dimensions: originalReport.dimensions,
      issuesByCategory: originalReport.issuesByCategory,
      missingCellsCount: originalReport.missingCellsCount,
      duplicateRecordsCount: originalReport.duplicateRecordsCount,
      invalidRecordsCount: originalReport.invalidRecordsCount,
      outlierRecordsCount: originalReport.outlierRecordsCount,
    },
    cleanedQuality: cleanedReport
      ? {
          totalRecords: cleanedReport.totalRecords,
          overallScore: cleanedReport.overallScore,
          dimensions: cleanedReport.dimensions,
          issuesByCategory: cleanedReport.issuesByCategory,
          missingCellsCount: cleanedReport.missingCellsCount,
          duplicateRecordsCount: cleanedReport.duplicateRecordsCount,
          invalidRecordsCount: cleanedReport.invalidRecordsCount,
          outlierRecordsCount: cleanedReport.outlierRecordsCount,
        }
      : null,
    validationSummary: validationReport
      ? {
          target: validationReport.target,
          overallPassRate: validationReport.overallPassRate,
          passedRules: validationReport.passedRules,
          failedRules: validationReport.failedRules,
          passedRecordsCount: validationReport.passedRecordsCount,
          failedRecordsCount: validationReport.failedRecordsCount,
          rules: validationReport.rules.map((r) => ({
            ruleName: r.ruleName,
            expectationType: r.expectationType,
            domain: r.domain,
            passedCount: r.passedCount,
            failedCount: r.failedCount,
            passRate: r.passRate,
            status: r.status,
          })),
        }
      : null,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  triggerDownload(blob, `${stripExtension(datasetName)}_quality_report.json`);
}

export function exportQualityReportHtml(
  datasetName: string,
  originalReport: QualityAssessmentReport,
  cleanedReport: QualityAssessmentReport | null,
  validationReport: ValidationSuiteReport | null
): void {
  const categoriesRows = Object.entries(originalReport.issuesByCategory)
    .map(([cat, origCount]) => {
      const cleanCount = cleanedReport ? cleanedReport.issuesByCategory[cat as keyof typeof originalReport.issuesByCategory] : '—';
      return `<tr><td>${cat}</td><td class="num">${origCount}</td><td class="num">${cleanCount}</td></tr>`;
    })
    .join('');

  const validationRows = validationReport
    ? validationReport.rules
        .map(
          (r) =>
            `<tr><td>${r.ruleName}</td><td>${r.domain}</td><td class="num">${r.passedCount}</td><td class="num">${r.failedCount}</td><td class="num">${r.passRate}%</td><td>${r.status}</td></tr>`
        )
        .join('')
    : '<tr><td colspan="6">Validation suite not executed yet.</td></tr>';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>MediClean Governance & Quality Report — ${datasetName}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #202923; background: #F5F7F5; margin: 0; padding: 40px; }
  .sheet { max-width: 920px; margin: 0 auto; background: #ffffff; border: 1px solid #d9e2dc; border-radius: 16px; padding: 36px; }
  h1 { margin: 0 0 6px; font-size: 24px; }
  .meta { color: #5A665E; font-size: 13px; margin-bottom: 28px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 28px; }
  .kpi { background: #F5F7F5; border: 1px solid #dde6e0; border-radius: 12px; padding: 14px; }
  .kpi-label { font-size: 12px; color: #5A665E; }
  .kpi-val { font-size: 22px; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; }
  h2 { font-size: 16px; margin: 26px 0 10px; border-bottom: 1px solid #e4ebe6; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid #edf2ee; }
  th { color: #5A665E; font-weight: 600; background: #f9fbf9; }
  .num { text-align: right; font-variant-numeric: tabular-nums; font-family: monospace; }
  .notice { margin-top: 28px; font-size: 12px; color: #5A665E; background: #f2f6f3; padding: 12px 14px; border-radius: 10px; }
</style>
</head>
<body>
  <div class="sheet">
    <h1>MediClean — Data Quality & Governance Report</h1>
    <div class="meta">Dataset: ${datasetName} · Generated: ${new Date().toLocaleString()} · HIPAA Safe Harbor Compliant</div>
    <div class="grid">
      <div class="kpi"><div class="kpi-label">Original Records</div><div class="kpi-val">${originalReport.totalRecords.toLocaleString()}</div></div>
      <div class="kpi"><div class="kpi-label">Initial Quality Score</div><div class="kpi-val">${originalReport.overallScore}%</div></div>
      <div class="kpi"><div class="kpi-label">Post-Clean Score</div><div class="kpi-val">${cleanedReport ? `${cleanedReport.overallScore}%` : 'Pending'}</div></div>
      <div class="kpi"><div class="kpi-label">Issues Detected</div><div class="kpi-val">${originalReport.totalIssuesCount.toLocaleString()}</div></div>
    </div>
    <h2>Data Quality Issues by Category (Before vs. After)</h2>
    <table>
      <thead><tr><th>Issue Category</th><th class="num">Original Dataset</th><th class="num">Cleaned Dataset</th></tr></thead>
      <tbody>${categoriesRows}</tbody>
    </table>
    <h2>Data Validation Suite Results</h2>
    <table>
      <thead><tr><th>Rule Name</th><th>Domain</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Pass Rate</th><th>Status</th></tr></thead>
      <tbody>${validationRows}</tbody>
    </table>
    <div class="notice">Privacy Guarantee: No raw Patient Names, Medical Record Numbers, Emails, or Telephone Numbers are disclosed in this governance report.</div>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  triggerDownload(blob, `${stripExtension(datasetName)}_governance_report.html`);
}

export function exportValidationResultsCsv(report: ValidationSuiteReport, datasetName: string): void {
  const rows = report.rules.map((r) => ({
    Rule_ID: r.ruleId,
    Rule_Name: r.ruleName,
    Expectation_Type: r.expectationType,
    Domain: r.domain,
    Column: r.column,
    Passed_Records: r.passedCount,
    Failed_Records: r.failedCount,
    Total_Evaluated: r.totalEvaluated,
    Pass_Rate_Pct: r.passRate,
    Status: r.status,
  }));
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${stripExtension(datasetName)}_validation_${report.target}.csv`);
}

function stripExtension(name: string): string {
  return name.replace(/\.(csv|xlsx|xls)$/i, '');
}
