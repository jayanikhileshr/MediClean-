import type {
  AnomalyPoint,
  IssueCategory,
  PatientRecord,
  QualityAssessmentReport,
  QualityIssue,
} from '../types/mediclean';
import { CANONICAL_DEPARTMENTS } from './syntheticGenerator';

export const ALL_ISSUE_CATEGORIES: IssueCategory[] = [
  'Missing Values',
  'Duplicate Records',
  'Invalid Emails',
  'Invalid Phone Numbers',
  'Invalid Dates',
  'Inconsistent Gender',
  'Invalid Ages',
  'Invalid MRN Identifiers',
  'Inconsistent Departments',
  'Numerical Outliers',
];

export const CANONICAL_GENDERS = new Set(['Male', 'Female', 'Non-Binary', 'Unknown']);
export const CANONICAL_DEPARTMENT_SET = new Set<string>(CANONICAL_DEPARTMENTS);
export const CANONICAL_BLOOD_GROUPS = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);

export const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
export const MRN_REGEX = /^MRN-\d{6}$/;
export const ICD10_REGEX = /^[A-TV-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$/;
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export function findColumnKey(columns: string[], candidates: RegExp): string | undefined {
  return columns.find((col) => candidates.test(col.toLowerCase()));
}

export function isBlank(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  const s = String(val).trim();
  return s === '' || s.toLowerCase() === 'null' || s.toLowerCase() === 'nan';
}

export function parseNumericValue(val: unknown): number | null {
  if (isBlank(val)) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const cleaned = String(val).trim().replace(/[$,\s]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseFlexibleDate(val: unknown): { iso: string | null; isStrictIso: boolean; valid: boolean } {
  if (isBlank(val)) return { iso: null, isStrictIso: false, valid: false };
  const s = String(val).trim();

  // Strict ISO YYYY-MM-DD
  if (ISO_DATE_REGEX.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    if (isValidYmd(y, m, d)) {
      return { iso: s, isStrictIso: true, valid: true };
    }
    return { iso: null, isStrictIso: false, valid: false };
  }

  // YYYY/MM/DD
  const slashYmd = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (slashYmd) {
    const y = Number(slashYmd[1]);
    const m = Number(slashYmd[2]);
    const d = Number(slashYmd[3]);
    if (isValidYmd(y, m, d)) {
      return { iso: formatYmd(y, m, d), isStrictIso: false, valid: true };
    }
    return { iso: null, isStrictIso: false, valid: false };
  }

  // MM/DD/YYYY or MM-DD-YYYY
  const mdy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (mdy) {
    const m = Number(mdy[1]);
    const d = Number(mdy[2]);
    const y = Number(mdy[3]);
    if (isValidYmd(y, m, d)) {
      return { iso: formatYmd(y, m, d), isStrictIso: false, valid: true };
    }
    return { iso: null, isStrictIso: false, valid: false };
  }

  // DD-Mon-YYYY
  const dMonY = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s);
  if (dMonY) {
    const d = Number(dMonY[1]);
    const m = MONTH_MAP[dMonY[2].toLowerCase()];
    const y = Number(dMonY[3]);
    if (m && isValidYmd(y, m, d)) {
      return { iso: formatYmd(y, m, d), isStrictIso: false, valid: true };
    }
    return { iso: null, isStrictIso: false, valid: false };
  }

  return { iso: null, isStrictIso: false, valid: false };
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function formatYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function isValidStandardPhone(val: string): boolean {
  const s = val.trim();
  return /^\+1 \(\d{3}\) \d{3}-\d{4}$/.test(s);
}

export function assessDatasetQuality(
  rows: PatientRecord[],
  columns: string[]
): QualityAssessmentReport {
  const totalRecords = rows.length;
  const totalColumns = columns.length;
  const totalCells = totalRecords * totalColumns;

  const issuesByCategory: Record<IssueCategory, number> = {
    'Missing Values': 0,
    'Duplicate Records': 0,
    'Invalid Emails': 0,
    'Invalid Phone Numbers': 0,
    'Invalid Dates': 0,
    'Inconsistent Gender': 0,
    'Invalid Ages': 0,
    'Invalid MRN Identifiers': 0,
    'Inconsistent Departments': 0,
    'Numerical Outliers': 0,
  };

  const issues: QualityIssue[] = [];
  const invalidRowSet = new Set<number>();
  const outlierRowSet = new Set<number>();

  const idCol = findColumnKey(columns, /^(patient_id|mrn|medical_record)$/);
  const nameCol = findColumnKey(columns, /^(patient_name|full_name|name)$/);
  const ageCol = findColumnKey(columns, /^age$/);
  const genderCol = findColumnKey(columns, /^(gender|sex)$/);
  const phoneCol = findColumnKey(columns, /^(phone_number|phone|telephone|mobile)$/);
  const emailCol = findColumnKey(columns, /^(email|e_mail)$/);
  const admitCol = findColumnKey(columns, /^(admission_date|admit_date)$/);
  const dischargeCol = findColumnKey(columns, /^discharge_date$/);
  const deptCol = findColumnKey(columns, /^(department|dept|ward)$/);
  const costCol = findColumnKey(columns, /^(treatment_cost|cost|billing_amount|charges)$/);

  let issueCounter = 0;
  const pushIssue = (issue: Omit<QualityIssue, 'id'>) => {
    issueCounter++;
    issuesByCategory[issue.category]++;
    invalidRowSet.add(issue.rowIndex);
    // Keep up to 1,500 detailed issue records in memory for responsive UI drill-down
    if (issues.length < 1500) {
      issues.push({ ...issue, id: `iss-${issueCounter}` });
    }
  };

  // 1. Pre-compute statistical fences for Treatment_Cost (IQR + Z-score)
  const validCosts: number[] = [];
  if (costCol) {
    for (const row of rows) {
      const n = parseNumericValue(row[costCol]);
      if (n !== null && n >= 0) validCosts.push(n);
    }
  }
  validCosts.sort((a, b) => a - b);
  const meanCost =
    validCosts.length > 0
      ? validCosts.reduce((sum, v) => sum + v, 0) / validCosts.length
      : 0;
  const varianceCost =
    validCosts.length > 1
      ? validCosts.reduce((sum, v) => sum + (v - meanCost) ** 2, 0) / validCosts.length
      : 1;
  const stdCost = Math.sqrt(varianceCost) || 1;
  const q1 = validCosts[Math.floor(validCosts.length * 0.25)] ?? 0;
  const q3 = validCosts[Math.floor(validCosts.length * 0.75)] ?? 0;
  const iqr = q3 - q1;
  const upperFence = q3 + 2.5 * iqr;

  // Duplicate detection trackers
  const seenRowSignatures = new Set<string>();
  const seenMrnSignatures = new Set<string>();
  let duplicateRecordsCount = 0;
  let missingCellsCount = 0;

  const anomalies: AnomalyPoint[] = [];
  const deptBuckets = new Map<string, { recordCount: number; costSum: number; costCount: number; issueCount: number }>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawId = idCol ? String(row[idCol] ?? '').trim() : `ROW-${i + 1}`;
    const displayId = rawId || `ROW-${i + 1}`;
    let rowIssuesBefore = issueCounter;

    // Duplicate check (normalized exact row OR duplicate valid Patient_ID + Name)
    const sig = columns
      .filter((c) => !c.startsWith('_'))
      .map((c) => String(row[c] ?? '').trim().toLowerCase())
      .join('|');
    const mrnKey =
      idCol && !isBlank(row[idCol])
        ? `${String(row[idCol]).trim().toUpperCase()}|${nameCol ? String(row[nameCol] ?? '').trim().toLowerCase() : ''}`
        : '';

    if (seenRowSignatures.has(sig) || (mrnKey !== '' && seenMrnSignatures.has(mrnKey))) {
      duplicateRecordsCount++;
      pushIssue({
        rowIndex: i,
        patientId: displayId,
        column: idCol || 'Record',
        category: 'Duplicate Records',
        severity: 'Critical',
        rawValue: displayId,
        reason: 'Duplicate patient admission record detected (matching MRN or complete field fingerprint).',
        recommendedFix: 'Deduplicate keeping the earliest complete clinical record.',
      });
    } else {
      seenRowSignatures.add(sig);
      if (mrnKey !== '') seenMrnSignatures.add(mrnKey);
    }

    // Missing values across visible data columns
    for (const col of columns) {
      if (col.startsWith('_')) continue;
      if (isBlank(row[col])) {
        missingCellsCount++;
        pushIssue({
          rowIndex: i,
          patientId: displayId,
          column: col,
          category: 'Missing Values',
          severity: ['Patient_ID', 'Patient_Name', 'Admission_Date', 'Department', 'Diagnosis_Code'].includes(col)
            ? 'Critical'
            : 'Moderate',
          rawValue: '(empty)',
          reason: `Missing value in ${col}.`,
          recommendedFix: 'Impute using clinical median/mode or assign standardized Unknown marker.',
        });
      }
    }

    // MRN validation
    if (idCol && !isBlank(row[idCol])) {
      const mrn = String(row[idCol]).trim();
      if (!MRN_REGEX.test(mrn)) {
        pushIssue({
          rowIndex: i,
          patientId: displayId,
          column: idCol,
          category: 'Invalid MRN Identifiers',
          severity: 'Critical',
          rawValue: mrn,
          reason: 'Identifier does not match required MRN-XXXXXX 6-digit hospital pattern.',
          recommendedFix: 'Normalize prefix/padding to canonical MRN-XXXXXX format.',
        });
      }
    }

    // Age validation
    let parsedAgeForAnomaly: number | null = null;
    if (ageCol && !isBlank(row[ageCol])) {
      const ageNum = parseNumericValue(row[ageCol]);
      if (ageNum === null || ageNum < 0 || ageNum > 120 || !Number.isInteger(ageNum)) {
        pushIssue({
          rowIndex: i,
          patientId: displayId,
          column: ageCol,
          category: 'Invalid Ages',
          severity: 'Critical',
          rawValue: String(row[ageCol]),
          reason:
            ageNum === null
              ? 'Age contains non-numeric text.'
              : `Age (${ageNum}) falls outside biologically valid bounds [0, 120].`,
          recommendedFix: 'Coerce numeric type and replace out-of-range age with department median.',
        });
      } else {
        parsedAgeForAnomaly = ageNum;
      }
    }

    // Gender consistency
    if (genderCol && !isBlank(row[genderCol])) {
      const g = String(row[genderCol]).trim();
      if (!CANONICAL_GENDERS.has(g)) {
        pushIssue({
          rowIndex: i,
          patientId: displayId,
          column: genderCol,
          category: 'Inconsistent Gender',
          severity: 'Moderate',
          rawValue: g,
          reason: `Non-canonical gender label "${g}" violates HL7/clinical vocabulary.`,
          recommendedFix: 'Map to canonical set: Male, Female, Non-Binary, or Unknown.',
        });
      }
    }

    // Email validation
    if (emailCol && !isBlank(row[emailCol])) {
      const em = String(row[emailCol]).trim();
      if (!EMAIL_REGEX.test(em)) {
        pushIssue({
          rowIndex: i,
          patientId: displayId,
          column: emailCol,
          category: 'Invalid Emails',
          severity: 'Warning',
          rawValue: em,
          reason: 'Email address fails RFC syntax verification.',
          recommendedFix: 'Repair common [at] typos or nullify unrecoverable address and flag.',
        });
      }
    }

    // Phone validation
    if (phoneCol && !isBlank(row[phoneCol])) {
      const ph = String(row[phoneCol]).trim();
      if (!isValidStandardPhone(ph)) {
        pushIssue({
          rowIndex: i,
          patientId: displayId,
          column: phoneCol,
          category: 'Invalid Phone Numbers',
          severity: 'Warning',
          rawValue: ph,
          reason: 'Phone number does not match standard +1 (XXX) XXX-XXXX clinical format.',
          recommendedFix: 'Standardize valid 10-digit numbers or flag malformed entries.',
        });
      }
    }

    // Date validation & Admission <= Discharge logic
    let admitParsed = admitCol ? parseFlexibleDate(row[admitCol]) : null;
    let dischargeParsed = dischargeCol ? parseFlexibleDate(row[dischargeCol]) : null;

    if (admitCol && !isBlank(row[admitCol]) && admitParsed && (!admitParsed.valid || !admitParsed.isStrictIso)) {
      pushIssue({
        rowIndex: i,
        patientId: displayId,
        column: admitCol,
        category: 'Invalid Dates',
        severity: admitParsed.valid ? 'Moderate' : 'Critical',
        rawValue: String(row[admitCol]),
        reason: admitParsed.valid
          ? 'Non-ISO date format detected (requires YYYY-MM-DD).'
          : 'Impossible or unparseable calendar date.',
        recommendedFix: admitParsed.valid
          ? `Convert to ISO-8601 (${admitParsed.iso}).`
          : 'Flag record and quarantine unparseable timestamp.',
      });
    }

    if (
      dischargeCol &&
      !isBlank(row[dischargeCol]) &&
      dischargeParsed &&
      (!dischargeParsed.valid || !dischargeParsed.isStrictIso)
    ) {
      pushIssue({
        rowIndex: i,
        patientId: displayId,
        column: dischargeCol,
        category: 'Invalid Dates',
        severity: dischargeParsed.valid ? 'Moderate' : 'Critical',
        rawValue: String(row[dischargeCol]),
        reason: dischargeParsed.valid
          ? 'Non-ISO discharge date format (requires YYYY-MM-DD).'
          : 'Impossible or unparseable discharge date.',
        recommendedFix: dischargeParsed.valid
          ? `Convert to ISO-8601 (${dischargeParsed.iso}).`
          : 'Flag record for clinical timestamp review.',
      });
    }

    if (admitParsed?.iso && dischargeParsed?.iso && dischargeParsed.iso < admitParsed.iso) {
      pushIssue({
        rowIndex: i,
        patientId: displayId,
        column: dischargeCol || 'Discharge_Date',
        category: 'Invalid Dates',
        severity: 'Critical',
        rawValue: `${admitParsed.iso} -> ${dischargeParsed.iso}`,
        reason: 'Discharge date occurs chronologically before admission date.',
        recommendedFix: 'Swap or align discharge date and annotate governance audit flag.',
      });
    }

    // Department consistency
    const rawDept = deptCol ? String(row[deptCol] ?? '').trim() : 'Unassigned';
    if (deptCol && !isBlank(row[deptCol])) {
      if (!CANONICAL_DEPARTMENT_SET.has(rawDept)) {
        pushIssue({
          rowIndex: i,
          patientId: displayId,
          column: deptCol,
          category: 'Inconsistent Departments',
          severity: 'Moderate',
          rawValue: rawDept,
          reason: `Department alias "${rawDept}" is outside approved hospital taxonomy.`,
          recommendedFix: 'Normalize to canonical hospital department nomenclature.',
        });
      }
    }

    // Numerical outliers & currency-formatted strings on Treatment_Cost
    let parsedCost: number | null = null;
    if (costCol && !isBlank(row[costCol])) {
      const rawCostStr = String(row[costCol]).trim();
      parsedCost = parseNumericValue(rawCostStr);
      if (parsedCost === null) {
        pushIssue({
          rowIndex: i,
          patientId: displayId,
          column: costCol,
          category: 'Numerical Outliers',
          severity: 'Warning',
          rawValue: rawCostStr,
          reason: 'Treatment cost contains unparseable non-numeric text.',
          recommendedFix: 'Strip formatting symbols or impute department median.',
        });
      } else {
        const zScore = (parsedCost - meanCost) / stdCost;
        const isOutlier = parsedCost < 0 || parsedCost > upperFence || Math.abs(zScore) > 3.0;
        if (isOutlier) {
          outlierRowSet.add(i);
          pushIssue({
            rowIndex: i,
            patientId: displayId,
            column: costCol,
            category: 'Numerical Outliers',
            severity: parsedCost < 0 ? 'Critical' : 'Warning',
            rawValue: String(parsedCost),
            reason:
              parsedCost < 0
                ? `Negative treatment charge ($${parsedCost.toLocaleString()}) violates billing integrity.`
                : `Statistical billing outlier detected (Z-score ${zScore.toFixed(2)}, above IQR upper fence $${Math.round(upperFence).toLocaleString()}).`,
            recommendedFix: 'Winsorize extreme values or attach _Data_Quality_Flag for billing audit.',
          });
        } else if (/^\$/.test(rawCostStr) || rawCostStr.includes(',')) {
          pushIssue({
            rowIndex: i,
            patientId: displayId,
            column: costCol,
            category: 'Numerical Outliers',
            severity: 'Moderate',
            rawValue: rawCostStr,
            reason: 'Currency string formatting prevents numeric analytics aggregation.',
            recommendedFix: 'Coerce formatted currency text into numeric float.',
          });
        }

        // Sample up to 240 anomaly scatter points (always include all outliers)
        if (parsedAgeForAnomaly !== null && (isOutlier || i % Math.max(1, Math.floor(rows.length / 180)) === 0)) {
          anomalies.push({
            rowIndex: i,
            patientId: displayId,
            department: rawDept || 'Unassigned',
            age: parsedAgeForAnomaly,
            treatmentCost: parsedCost,
            zScoreCost: Number(zScore.toFixed(2)),
            isOutlier,
          });
        }
      }
    }

    // Track department aggregate stats
    const deptBucketKey = rawDept || 'Unassigned';
    const bucket = deptBuckets.get(deptBucketKey) ?? {
      recordCount: 0,
      costSum: 0,
      costCount: 0,
      issueCount: 0,
    };
    bucket.recordCount++;
    if (parsedCost !== null && parsedCost >= 0) {
      bucket.costSum += parsedCost;
      bucket.costCount++;
    }
    bucket.issueCount += issueCounter - rowIssuesBefore;
    deptBuckets.set(deptBucketKey, bucket);
  }

  // Compute transparent 5-dimension quality scores (0 - 100)
  const safeTotal = Math.max(totalRecords, 1);
  const safeCells = Math.max(totalCells, 1);

  const completeness = clampScore(100 - (missingCellsCount / safeCells) * 100 * 1.6);
  const uniqueness = clampScore(100 - (duplicateRecordsCount / safeTotal) * 100 * 3.5);
  const validityErrors =
    issuesByCategory['Invalid Emails'] +
    issuesByCategory['Invalid Phone Numbers'] +
    issuesByCategory['Invalid Dates'] +
    issuesByCategory['Invalid Ages'] +
    issuesByCategory['Invalid MRN Identifiers'];
  const validity = clampScore(100 - (validityErrors / (safeTotal * 5)) * 100 * 2.4);

  const consistencyErrors =
    issuesByCategory['Inconsistent Gender'] + issuesByCategory['Inconsistent Departments'];
  const consistency = clampScore(100 - (consistencyErrors / (safeTotal * 2)) * 100 * 1.8);

  const integrity = clampScore(100 - (outlierRowSet.size / safeTotal) * 100 * 4.5);

  const overallScore = Number(
    (
      completeness * 0.25 +
      uniqueness * 0.2 +
      validity * 0.25 +
      consistency * 0.15 +
      integrity * 0.15
    ).toFixed(1)
  );

  const departmentStats = Array.from(deptBuckets.entries())
    .map(([department, b]) => ({
      department,
      recordCount: b.recordCount,
      avgCost: b.costCount > 0 ? Math.round(b.costSum / b.costCount) : 0,
      issueCount: b.issueCount,
    }))
    .sort((a, b) => b.recordCount - a.recordCount)
    .slice(0, 10);

  return {
    totalRecords,
    totalColumns,
    totalCells,
    overallScore,
    dimensions: {
      completeness: Number(completeness.toFixed(1)),
      uniqueness: Number(uniqueness.toFixed(1)),
      validity: Number(validity.toFixed(1)),
      consistency: Number(consistency.toFixed(1)),
      integrity: Number(integrity.toFixed(1)),
    },
    issuesByCategory,
    missingCellsCount,
    duplicateRecordsCount,
    invalidRecordsCount: invalidRowSet.size,
    outlierRecordsCount: outlierRowSet.size,
    totalIssuesCount: issueCounter,
    issues,
    anomalies,
    departmentStats,
    assessedAt: new Date().toISOString(),
  };
}

function clampScore(val: number): number {
  return Math.max(0, Math.min(100, val));
}
