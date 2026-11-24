import type {
  CellDiff,
  CleaningConfig,
  CleaningOperationSummary,
  CleaningResult,
  PatientRecord,
} from '../types/mediclean';
import {
  CANONICAL_BLOOD_GROUPS,
  EMAIL_REGEX,
  MRN_REGEX,
  findColumnKey,
  isBlank,
  isValidStandardPhone,
  parseFlexibleDate,
  parseNumericValue,
} from './qualityAssessor';

export const DEFAULT_CLEANING_CONFIG: CleaningConfig = {
  handleMissingValues: true,
  missingStrategy: 'impute',
  removeDuplicates: true,
  standardizeDates: true,
  fixReversedDates: true,
  normalizeText: true,
  correctDataTypes: true,
  remediateInvalidAges: true,
  remediateContactFormats: true,
  standardizeCategories: true,
  handleOutliers: 'winsorize',
  flagInconsistentRecords: true,
};

function toTitleCase(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : ''))
    .join(' ');
}

function canonicalizeGender(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (['m', 'male', 'man'].includes(s)) return 'Male';
  if (['f', 'female', 'fem', 'woman'].includes(s)) return 'Female';
  if (['nb', 'non-binary', 'nonbinary', 'non binary'].includes(s)) return 'Non-Binary';
  return 'Unknown';
}

function canonicalizeDepartment(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s.includes('cardio')) return 'Cardiology';
  if (s === 'er' || s.includes('emerg')) return 'Emergency';
  if (s.includes('neuro')) return 'Neurology';
  if (s.includes('onco')) return 'Oncology';
  if (s.includes('ortho')) return 'Orthopedics';
  if (s.includes('ped') || s.includes('paed')) return 'Pediatrics';
  if (s.includes('int') || s.includes('internal')) return 'Internal Medicine';
  if (s.includes('rad') || s.includes('imag')) return 'Radiology';
  return toTitleCase(raw);
}

function canonicalizeBloodGroup(raw: string): string {
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (CANONICAL_BLOOD_GROUPS.has(s)) return s;
  if (s.includes('AB')) return s.includes('NEG') || s.includes('-') ? 'AB-' : 'AB+';
  if (s.startsWith('A')) return s.includes('NEG') || s.includes('-') ? 'A-' : 'A+';
  if (s.startsWith('B')) return s.includes('NEG') || s.includes('-') ? 'B-' : 'B+';
  if (s.startsWith('O')) return s.includes('NEG') || s.includes('-') ? 'O-' : 'O+';
  return 'Unknown';
}

function normalizeMrn(raw: string, fallbackIndex: number): string {
  const s = raw.trim().toUpperCase();
  if (MRN_REGEX.test(s)) return s;
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 6) {
    return `MRN-${digits.slice(0, 6)}`;
  }
  if (digits.length > 0) {
    return `MRN-${digits.padStart(6, '0')}`;
  }
  return `MRN-${String(900000 + fallbackIndex).slice(0, 6)}`;
}

function normalizePhone(raw: string): { formatted: string; valid: boolean } {
  const s = raw.trim();
  if (isValidStandardPhone(s)) return { formatted: s, valid: true };
  let digits = s.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    return {
      formatted: `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`,
      valid: true,
    };
  }
  return { formatted: s, valid: false };
}

function repairEmail(raw: string): { value: string; valid: boolean } {
  let s = raw.trim().toLowerCase().replace(/\s+/g, '');
  s = s.replace(/\[at\]|\(at\)/g, '@');
  if (EMAIL_REGEX.test(s)) return { value: s, valid: true };
  if (s.includes('@') && !s.split('@')[1].includes('.')) {
    const fixed = `${s}.org`;
    if (EMAIL_REGEX.test(fixed)) return { value: fixed, valid: true };
  }
  return { value: s, valid: false };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function runCleaningPipeline(
  originalRows: PatientRecord[],
  columns: string[],
  config: CleaningConfig
): CleaningResult {
  const idCol = findColumnKey(columns, /^(patient_id|mrn|medical_record)$/);
  const nameCol = findColumnKey(columns, /^(patient_name|full_name|name)$/);
  const ageCol = findColumnKey(columns, /^age$/);
  const genderCol = findColumnKey(columns, /^(gender|sex)$/);
  const phoneCol = findColumnKey(columns, /^(phone_number|phone|telephone|mobile)$/);
  const emailCol = findColumnKey(columns, /^(email|e_mail)$/);
  const admitCol = findColumnKey(columns, /^(admission_date|admit_date)$/);
  const dischargeCol = findColumnKey(columns, /^discharge_date$/);
  const deptCol = findColumnKey(columns, /^(department|dept|ward)$/);
  const diagCol = findColumnKey(columns, /^(diagnosis_code|icd10|diagnosis)$/);
  const bloodCol = findColumnKey(columns, /^(blood_group|blood_type)$/);
  const costCol = findColumnKey(columns, /^(treatment_cost|cost|billing_amount|charges)$/);

  // Compute robust statistics from valid values for imputation & Winsorization
  const validAges: number[] = [];
  const validCosts: number[] = [];
  const deptCounts = new Map<string, number>();

  for (const row of originalRows) {
    if (ageCol) {
      const a = parseNumericValue(row[ageCol]);
      if (a !== null && a >= 0 && a <= 120) validAges.push(a);
    }
    if (costCol) {
      const c = parseNumericValue(row[costCol]);
      if (c !== null && c >= 0) validCosts.push(c);
    }
    if (deptCol && !isBlank(row[deptCol])) {
      const canon = canonicalizeDepartment(String(row[deptCol]));
      deptCounts.set(canon, (deptCounts.get(canon) ?? 0) + 1);
    }
  }

  const medianAge = Math.round(median(validAges) || 44);
  const medianCost = Number((median(validCosts) || 9200).toFixed(2));
  const sortedCosts = [...validCosts].sort((a, b) => a - b);
  const q1 = sortedCosts[Math.floor(sortedCosts.length * 0.25)] ?? 0;
  const q3 = sortedCosts[Math.floor(sortedCosts.length * 0.75)] ?? 20000;
  const upperCostCap = Number((q3 + 2.5 * (q3 - q1)).toFixed(2));
  const modeDept =
    Array.from(deptCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Internal Medicine';

  const opCounts = new Map<string, { count: number; description: string }>();
  const bumpOp = (operation: string, description: string) => {
    const existing = opCounts.get(operation);
    if (existing) existing.count++;
    else opCounts.set(operation, { count: 1, description });
  };

  const diffs: CellDiff[] = [];
  let cellsModifiedCount = 0;
  let removedDuplicateCount = 0;
  let droppedCriticalRowsCount = 0;
  let flaggedRecordsCount = 0;
  const modifiedRowsSet = new Set<number>();

  const recordChange = (
    rowIndex: number,
    patientId: string,
    column: string,
    before: unknown,
    after: unknown,
    operation: string,
    description: string
  ) => {
    const bStr = before === null || before === undefined || String(before) === '' ? '(empty)' : String(before);
    const aStr = after === null || after === undefined || String(after) === '' ? '(empty)' : String(after);
    if (bStr === aStr) return;
    cellsModifiedCount++;
    modifiedRowsSet.add(rowIndex);
    bumpOp(operation, description);
    if (diffs.length < 1000) {
      diffs.push({
        rowIndex,
        patientId: patientId || `ROW-${rowIndex + 1}`,
        column,
        before: bStr,
        after: aStr,
        operation,
      });
    }
  };

  const seenRowSignatures = new Set<string>();
  const seenMrnKeys = new Set<string>();
  const cleanedRows: PatientRecord[] = [];

  for (let i = 0; i < originalRows.length; i++) {
    const orig = originalRows[i];
    const row: PatientRecord = { ...orig };
    const rowFlags: string[] = [];

    // 1. Deduplication check
    if (config.removeDuplicates) {
      const sig = columns
        .filter((c) => !c.startsWith('_'))
        .map((c) => String(orig[c] ?? '').trim().toLowerCase())
        .join('|');
      const mrnKey =
        idCol && !isBlank(orig[idCol])
          ? `${String(orig[idCol]).trim().toUpperCase()}|${nameCol ? String(orig[nameCol] ?? '').trim().toLowerCase() : ''}`
          : '';
      if (seenRowSignatures.has(sig) || (mrnKey !== '' && seenMrnKeys.has(mrnKey))) {
        removedDuplicateCount++;
        bumpOp('Duplicate Record Removal', 'Removed exact and MRN-matching duplicate clinical entries.');
        continue;
      }
      seenRowSignatures.add(sig);
      if (mrnKey !== '') seenMrnKeys.add(mrnKey);
    }

    // 2. Drop critical missing records if configured
    if (config.handleMissingValues && config.missingStrategy === 'drop_critical') {
      const missingMandatory =
        (idCol && isBlank(row[idCol])) ||
        (nameCol && isBlank(row[nameCol])) ||
        (admitCol && isBlank(row[admitCol]));
      if (missingMandatory) {
        droppedCriticalRowsCount++;
        bumpOp('Critical Missing Record Removal', 'Dropped records missing mandatory identifiers or admission dates.');
        continue;
      }
    }

    const initialId = idCol ? String(row[idCol] ?? '').trim() : `ROW-${i + 1}`;

    // 3. MRN Standardization & Missing ID generation
    if (idCol) {
      const rawId = row[idCol];
      if (isBlank(rawId)) {
        if (config.handleMissingValues) {
          const generated = `MRN-${String(900000 + i).slice(0, 6)}`;
          row[idCol] = generated;
          rowFlags.push('IMPUTED_MRN');
          recordChange(i, generated, idCol, rawId, generated, 'Missing Value Handling', 'Generated sequential MRN for missing identifier.');
        }
      } else if (config.normalizeText && !MRN_REGEX.test(String(rawId).trim())) {
        const fixedId = normalizeMrn(String(rawId), i);
        row[idCol] = fixedId;
        recordChange(i, fixedId, idCol, rawId, fixedId, 'MRN Identifier Standardization', 'Normalized medical record number to canonical MRN-XXXXXX format.');
      }
    }

    const activeId = idCol ? String(row[idCol] ?? '').trim() : initialId;

    // 4. Text Normalization on Name
    if (nameCol) {
      const rawName = row[nameCol];
      if (isBlank(rawName)) {
        if (config.handleMissingValues) {
          const fallback = 'Unknown Patient';
          row[nameCol] = fallback;
          rowFlags.push('MISSING_NAME');
          recordChange(i, activeId, nameCol, rawName, fallback, 'Missing Value Handling', 'Filled missing patient names with governed placeholder.');
        }
      } else if (config.normalizeText) {
        const normalized = toTitleCase(String(rawName));
        if (normalized !== String(rawName)) {
          row[nameCol] = normalized;
          recordChange(i, activeId, nameCol, rawName, normalized, 'Text Normalization', 'Trimmed excess whitespace and standardized patient name casing.');
        }
      }
    }

    // 5. Age Type Correction & Out-of-Range Remediation
    if (ageCol) {
      const rawAge = row[ageCol];
      if (isBlank(rawAge)) {
        if (config.handleMissingValues) {
          const filled = config.missingStrategy === 'impute' ? medianAge : 'Unknown';
          row[ageCol] = filled;
          rowFlags.push('IMPUTED_AGE');
          recordChange(i, activeId, ageCol, rawAge, filled, 'Missing Value Handling', 'Imputed missing patient age using cohort median.');
        }
      } else {
        const parsed = parseNumericValue(rawAge);
        if (parsed === null || parsed < 0 || parsed > 120 || !Number.isInteger(parsed)) {
          if (config.remediateInvalidAges) {
            row[ageCol] = medianAge;
            rowFlags.push('CORRECTED_AGE');
            recordChange(i, activeId, ageCol, rawAge, medianAge, 'Invalid Age Remediation', 'Replaced impossible or non-numeric age with cohort median.');
          }
        } else if (config.correctDataTypes && typeof rawAge !== 'number') {
          row[ageCol] = parsed;
          recordChange(i, activeId, ageCol, rawAge, parsed, 'Data Type Correction', 'Coerced text-formatted numeric values to strict numbers.');
        }
      }
    }

    // 6. Categorical Standardization (Gender, Department, Blood Group)
    if (genderCol) {
      const rawG = row[genderCol];
      if (isBlank(rawG)) {
        if (config.handleMissingValues) {
          row[genderCol] = 'Unknown';
          recordChange(i, activeId, genderCol, rawG, 'Unknown', 'Missing Value Handling', 'Assigned Unknown to missing gender records.');
        }
      } else if (config.standardizeCategories) {
        const canon = canonicalizeGender(String(rawG));
        if (canon !== String(rawG)) {
          row[genderCol] = canon;
          recordChange(i, activeId, genderCol, rawG, canon, 'Categorical Standardization', 'Standardized gender values to canonical HL7 vocabulary.');
        }
      }
    }

    if (deptCol) {
      const rawD = row[deptCol];
      if (isBlank(rawD)) {
        if (config.handleMissingValues) {
          const fillDept = config.missingStrategy === 'impute' ? modeDept : 'Unassigned';
          row[deptCol] = fillDept;
          rowFlags.push('IMPUTED_DEPT');
          recordChange(i, activeId, deptCol, rawD, fillDept, 'Missing Value Handling', 'Imputed missing department using modal hospital unit.');
        }
      } else if (config.standardizeCategories) {
        const canon = canonicalizeDepartment(String(rawD));
        if (canon !== String(rawD)) {
          row[deptCol] = canon;
          recordChange(i, activeId, deptCol, rawD, canon, 'Categorical Standardization', 'Mapped non-standard department aliases to canonical clinical taxonomy.');
        }
      }
    }

    if (bloodCol) {
      const rawB = row[bloodCol];
      if (isBlank(rawB)) {
        if (config.handleMissingValues) {
          row[bloodCol] = 'Unknown';
          recordChange(i, activeId, bloodCol, rawB, 'Unknown', 'Missing Value Handling', 'Assigned Unknown to missing blood group fields.');
        }
      } else if (config.standardizeCategories) {
        const canon = canonicalizeBloodGroup(String(rawB));
        if (canon !== String(rawB)) {
          row[bloodCol] = canon;
          recordChange(i, activeId, bloodCol, rawB, canon, 'Categorical Standardization', 'Normalized blood group notation (e.g., A+, O-).');
        }
      }
    }

    // 7. Contact Formats (Phone & Email)
    if (phoneCol) {
      const rawP = row[phoneCol];
      if (isBlank(rawP)) {
        if (config.handleMissingValues) {
          row[phoneCol] = '+1 (000) 000-0000';
          rowFlags.push('MISSING_PHONE');
          recordChange(i, activeId, phoneCol, rawP, '+1 (000) 000-0000', 'Missing Value Handling', 'Filled missing phone numbers with placeholder pattern.');
        }
      } else if (config.remediateContactFormats) {
        const { formatted, valid } = normalizePhone(String(rawP));
        if (valid && formatted !== String(rawP)) {
          row[phoneCol] = formatted;
          recordChange(i, activeId, phoneCol, rawP, formatted, 'Contact Format Standardization', 'Reformatted phone numbers into +1 (XXX) XXX-XXXX syntax.');
        } else if (!valid) {
          row[phoneCol] = '+1 (000) 000-0000';
          rowFlags.push('INVALID_PHONE_REPLACED');
          recordChange(i, activeId, phoneCol, rawP, '+1 (000) 000-0000', 'Contact Format Standardization', 'Replaced unrecoverable phone strings and flagged record.');
        }
      }
    }

    if (emailCol) {
      const rawE = row[emailCol];
      if (isBlank(rawE)) {
        if (config.handleMissingValues) {
          const fallback = `unverified.${activeId.toLowerCase()}@records.example`;
          row[emailCol] = fallback;
          rowFlags.push('MISSING_EMAIL');
          recordChange(i, activeId, emailCol, rawE, fallback, 'Missing Value Handling', 'Assigned governed synthetic placeholder for missing emails.');
        }
      } else if (config.remediateContactFormats) {
        const { value, valid } = repairEmail(String(rawE));
        if (valid && value !== String(rawE)) {
          row[emailCol] = value;
          recordChange(i, activeId, emailCol, rawE, value, 'Contact Format Standardization', 'Repaired malformed email syntax and lowercased addresses.');
        } else if (!valid) {
          const fallback = `invalid.${activeId.toLowerCase()}@review.example`;
          row[emailCol] = fallback;
          rowFlags.push('INVALID_EMAIL_FLAGGED');
          recordChange(i, activeId, emailCol, rawE, fallback, 'Contact Format Standardization', 'Quarantined unrecoverable email syntax and flagged record.');
        }
      }
    }

    // 8. Date Standardization & Chronological Integrity
    let finalAdmitIso: string | null = null;
    let finalDischargeIso: string | null = null;

    if (admitCol) {
      const rawA = row[admitCol];
      const parsedA = parseFlexibleDate(rawA);
      if (isBlank(rawA)) {
        if (config.handleMissingValues) {
          row[admitCol] = '2025-01-15';
          finalAdmitIso = '2025-01-15';
          rowFlags.push('IMPUTED_ADMIT_DATE');
          recordChange(i, activeId, admitCol, rawA, '2025-01-15', 'Missing Value Handling', 'Imputed missing admission date with audit flag.');
        }
      } else if (config.standardizeDates) {
        if (parsedA.valid && parsedA.iso) {
          finalAdmitIso = parsedA.iso;
          if (!parsedA.isStrictIso) {
            row[admitCol] = parsedA.iso;
            recordChange(i, activeId, admitCol, rawA, parsedA.iso, 'Date Format Standardization', 'Converted mixed calendar strings to strict ISO-8601 (YYYY-MM-DD).');
          }
        } else {
          row[admitCol] = '2025-01-15';
          finalAdmitIso = '2025-01-15';
          rowFlags.push('INVALID_ADMIT_DATE');
          recordChange(i, activeId, admitCol, rawA, '2025-01-15', 'Date Format Standardization', 'Replaced impossible calendar dates and flagged for review.');
        }
      } else if (parsedA.iso) {
        finalAdmitIso = parsedA.iso;
      }
    }

    if (dischargeCol) {
      const rawDis = row[dischargeCol];
      const parsedD = parseFlexibleDate(rawDis);
      if (isBlank(rawDis)) {
        if (config.handleMissingValues) {
          const fallbackDis = finalAdmitIso ? addDaysIso(finalAdmitIso, 3) : '2025-01-18';
          row[dischargeCol] = fallbackDis;
          finalDischargeIso = fallbackDis;
          rowFlags.push('IMPUTED_DISCHARGE_DATE');
          recordChange(i, activeId, dischargeCol, rawDis, fallbackDis, 'Missing Value Handling', 'Imputed missing discharge date (+3 days post-admission).');
        }
      } else if (config.standardizeDates) {
        if (parsedD.valid && parsedD.iso) {
          finalDischargeIso = parsedD.iso;
          if (!parsedD.isStrictIso) {
            row[dischargeCol] = parsedD.iso;
            recordChange(i, activeId, dischargeCol, rawDis, parsedD.iso, 'Date Format Standardization', 'Converted discharge dates to strict ISO-8601 (YYYY-MM-DD).');
          }
        } else {
          const fallbackDis = finalAdmitIso ? addDaysIso(finalAdmitIso, 3) : '2025-01-18';
          row[dischargeCol] = fallbackDis;
          finalDischargeIso = fallbackDis;
          rowFlags.push('INVALID_DISCHARGE_DATE');
          recordChange(i, activeId, dischargeCol, rawDis, fallbackDis, 'Date Format Standardization', 'Replaced unparseable discharge timestamps.');
        }
      } else if (parsedD.iso) {
        finalDischargeIso = parsedD.iso;
      }
    }

    if (
      config.fixReversedDates &&
      admitCol &&
      dischargeCol &&
      finalAdmitIso &&
      finalDischargeIso &&
      finalDischargeIso < finalAdmitIso
    ) {
      // Swap reversed admission & discharge timestamps
      const prevAdmit = row[admitCol];
      const prevDis = row[dischargeCol];
      row[admitCol] = finalDischargeIso;
      row[dischargeCol] = finalAdmitIso;
      rowFlags.push('SWAPPED_REVERSED_DATES');
      recordChange(i, activeId, dischargeCol, prevDis, finalAdmitIso, 'Chronological Date Repair', 'Swapped inverted Admission/Discharge dates so discharge >= admission.');
      recordChange(i, activeId, admitCol, prevAdmit, finalDischargeIso, 'Chronological Date Repair', 'Swapped inverted Admission/Discharge dates so discharge >= admission.');
    }

    // 9. Diagnosis code normalization
    if (diagCol) {
      const rawDiag = row[diagCol];
      if (isBlank(rawDiag)) {
        if (config.handleMissingValues) {
          row[diagCol] = 'Z00.00';
          rowFlags.push('IMPUTED_ICD10');
          recordChange(i, activeId, diagCol, rawDiag, 'Z00.00', 'Missing Value Handling', 'Assigned Z00.00 review code to blank diagnosis entries.');
        }
      } else if (config.standardizeCategories) {
        const up = String(rawDiag).trim().toUpperCase();
        if (!/^[A-TV-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$/.test(up)) {
          row[diagCol] = 'R69';
          rowFlags.push('INVALID_ICD10_MAPPED');
          recordChange(i, activeId, diagCol, rawDiag, 'R69', 'Diagnosis Code Standardization', 'Mapped invalid diagnosis strings to ICD-10 R69 (Unspecified) with flag.');
        } else if (up !== String(rawDiag)) {
          row[diagCol] = up;
          recordChange(i, activeId, diagCol, rawDiag, up, 'Diagnosis Code Standardization', 'Uppercased ICD-10 diagnosis codes.');
        }
      }
    }

    // 10. Treatment_Cost Type Correction & Outlier Handling
    if (costCol) {
      const rawCost = row[costCol];
      if (isBlank(rawCost)) {
        if (config.handleMissingValues) {
          row[costCol] = medianCost;
          rowFlags.push('IMPUTED_COST');
          recordChange(i, activeId, costCol, rawCost, medianCost, 'Missing Value Handling', 'Imputed missing treatment costs with cohort median.');
        }
      } else {
        const parsedC = parseNumericValue(rawCost);
        if (parsedC === null) {
          if (config.correctDataTypes) {
            row[costCol] = medianCost;
            rowFlags.push('COERCED_COST');
            recordChange(i, activeId, costCol, rawCost, medianCost, 'Data Type Correction', 'Replaced unparseable cost text with cohort median.');
          }
        } else {
          let nextVal = parsedC;
          if (config.correctDataTypes && typeof rawCost !== 'number') {
            row[costCol] = parsedC;
            recordChange(i, activeId, costCol, rawCost, parsedC, 'Data Type Correction', 'Converted currency-formatted cost strings into numeric values.');
          }
          if (parsedC < 0 || parsedC > upperCostCap) {
            if (config.handleOutliers === 'winsorize') {
              nextVal = parsedC < 0 ? Math.abs(parsedC) : upperCostCap;
              row[costCol] = Number(nextVal.toFixed(2));
              rowFlags.push(parsedC < 0 ? 'CORRECTED_NEG_COST' : 'WINSORIZED_OUTLIER');
              recordChange(i, activeId, costCol, rawCost, row[costCol], 'Outlier Remediation', 'Winsorized extreme billing spikes and corrected negative charges.');
            } else if (config.handleOutliers === 'flag') {
              rowFlags.push('OUTLIER_COST_FLAG');
            }
          }
        }
      }
    }

    if (config.flagInconsistentRecords) {
      if (rowFlags.length > 0) {
        flaggedRecordsCount++;
        row._Data_Quality_Flag = rowFlags.join('; ');
      } else {
        row._Data_Quality_Flag = 'Verified';
      }
    }

    cleanedRows.push(row);
  }

  const operations: CleaningOperationSummary[] = Array.from(opCounts.entries())
    .map(([operation, meta]) => ({
      operation,
      affectedCount: meta.count,
      description: meta.description,
    }))
    .sort((a, b) => b.affectedCount - a.affectedCount);

  return {
    cleanedRows,
    removedDuplicateCount,
    droppedCriticalRowsCount,
    cellsModifiedCount,
    recordsCleanedCount: modifiedRowsSet.size + removedDuplicateCount + droppedCriticalRowsCount,
    flaggedRecordsCount,
    operations,
    diffs,
    appliedAt: new Date().toISOString(),
  };
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
