import type {
  PatientRecord,
  ValidationRuleConfig,
  ValidationRuleResult,
  ValidationSuiteReport,
} from '../types/mediclean';
import {
  CANONICAL_DEPARTMENT_SET,
  CANONICAL_GENDERS,
  ICD10_REGEX,
  MRN_REGEX,
  findColumnKey,
  isBlank,
  parseFlexibleDate,
  parseNumericValue,
} from './qualityAssessor';

export const DEFAULT_VALIDATION_CONFIG: ValidationRuleConfig = {
  minAge: 0,
  maxAge: 120,
  requireIsoDates: true,
  requireDischargeAfterAdmission: true,
  strictMrnPattern: true,
  strictIcd10Pattern: true,
  requireCanonicalDepartment: true,
  mandatoryFields: ['Patient_ID', 'Patient_Name', 'Admission_Date', 'Department', 'Diagnosis_Code'],
};

export function runValidationSuite(
  rows: PatientRecord[],
  columns: string[],
  config: ValidationRuleConfig,
  target: 'original' | 'cleaned'
): ValidationSuiteReport {
  const idCol = findColumnKey(columns, /^(patient_id|mrn|medical_record)$/);
  const ageCol = findColumnKey(columns, /^age$/);
  const genderCol = findColumnKey(columns, /^(gender|sex)$/);
  const admitCol = findColumnKey(columns, /^(admission_date|admit_date)$/);
  const dischargeCol = findColumnKey(columns, /^discharge_date$/);
  const deptCol = findColumnKey(columns, /^(department|dept|ward)$/);
  const diagCol = findColumnKey(columns, /^(diagnosis_code|icd10|diagnosis)$/);

  const rules: ValidationRuleResult[] = [];
  const failedRecordIndices = new Set<number>();

  const evalRule = (
    ruleId: string,
    ruleName: string,
    expectationType: string,
    domain: string,
    column: string,
    predicate: (row: PatientRecord, idx: number) => { ok: boolean; value: string; detail: string }
  ) => {
    let passedCount = 0;
    let failedCount = 0;
    const failedSamples: ValidationRuleResult['failedSamples'] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const res = predicate(row, i);
      if (res.ok) {
        passedCount++;
      } else {
        failedCount++;
        failedRecordIndices.add(i);
        if (failedSamples.length < 40) {
          failedSamples.push({
            rowIndex: i,
            patientId: idCol && !isBlank(row[idCol]) ? String(row[idCol]) : `ROW-${i + 1}`,
            value: res.value,
            detail: res.detail,
          });
        }
      }
    }

    const totalEvaluated = rows.length;
    const passRate = totalEvaluated > 0 ? Number(((passedCount / totalEvaluated) * 100).toFixed(1)) : 100;
    rules.push({
      ruleId,
      ruleName,
      expectationType,
      domain,
      column,
      passedCount,
      failedCount,
      totalEvaluated,
      passRate,
      status: failedCount === 0 ? 'Passed' : 'Failed',
      failedSamples,
    });
  };

  // Rule 1: Patient Age bounds
  if (ageCol) {
    evalRule(
      'exp-age-bounds',
      `Patient Age between ${config.minAge} and ${config.maxAge}`,
      'expect_column_values_to_be_between',
      'Patient Age',
      ageCol,
      (row) => {
        const raw = row[ageCol];
        const num = parseNumericValue(raw);
        if (num === null) {
          return { ok: false, value: String(raw ?? '(empty)'), detail: 'Missing or non-numeric age' };
        }
        if (num < config.minAge || num > config.maxAge || !Number.isInteger(num)) {
          return {
            ok: false,
            value: String(raw),
            detail: `Age ${num} outside [${config.minAge}, ${config.maxAge}]`,
          };
        }
        return { ok: true, value: String(num), detail: 'Valid' };
      }
    );
  }

  // Rule 2: Admission & Discharge Dates format and chronological order
  if (admitCol || dischargeCol) {
    evalRule(
      'exp-dates-chronology',
      'Admission & Discharge Date ISO-8601 & Chronology',
      'expect_chronological_date_pair',
      'Admission & Discharge Dates',
      `${admitCol || 'Admission'} / ${dischargeCol || 'Discharge'}`,
      (row) => {
        const aRaw = admitCol ? row[admitCol] : '';
        const dRaw = dischargeCol ? row[dischargeCol] : '';
        const aParsed = admitCol ? parseFlexibleDate(aRaw) : null;
        const dParsed = dischargeCol ? parseFlexibleDate(dRaw) : null;

        if (admitCol && (!aParsed?.valid || (config.requireIsoDates && !aParsed.isStrictIso))) {
          return { ok: false, value: String(aRaw ?? '(empty)'), detail: 'Invalid or non-ISO admission date' };
        }
        if (dischargeCol && (!dParsed?.valid || (config.requireIsoDates && !dParsed.isStrictIso))) {
          return { ok: false, value: String(dRaw ?? '(empty)'), detail: 'Invalid or non-ISO discharge date' };
        }
        if (
          config.requireDischargeAfterAdmission &&
          aParsed?.iso &&
          dParsed?.iso &&
          dParsed.iso < aParsed.iso
        ) {
          return {
            ok: false,
            value: `${aParsed.iso} -> ${dParsed.iso}`,
            detail: 'Discharge date precedes admission date',
          };
        }
        return { ok: true, value: `${aParsed?.iso || ''} -> ${dParsed?.iso || ''}`, detail: 'Valid' };
      }
    );
  }

  // Rule 3: Medical Record Numbers (MRN)
  if (idCol) {
    evalRule(
      'exp-mrn-pattern',
      'Medical Record Number Format (MRN-XXXXXX)',
      'expect_column_values_to_match_regex',
      'Medical Record Numbers',
      idCol,
      (row) => {
        const raw = String(row[idCol] ?? '').trim();
        if (!raw) return { ok: false, value: '(empty)', detail: 'Missing Patient_ID' };
        const ok = config.strictMrnPattern ? MRN_REGEX.test(raw) : raw.length >= 4;
        return {
          ok,
          value: raw,
          detail: ok ? 'Valid' : 'Fails MRN-XXXXXX pattern compliance',
        };
      }
    );
  }

  // Rule 4: Gender Categories
  if (genderCol) {
    evalRule(
      'exp-gender-set',
      'Standardized Clinical Gender Categories',
      'expect_column_values_to_be_in_set',
      'Gender Categories',
      genderCol,
      (row) => {
        const raw = String(row[genderCol] ?? '').trim();
        if (!raw) return { ok: false, value: '(empty)', detail: 'Missing gender value' };
        const ok = CANONICAL_GENDERS.has(raw);
        return {
          ok,
          value: raw,
          detail: ok ? 'Valid' : 'Non-canonical gender label',
        };
      }
    );
  }

  // Rule 5: Diagnosis Codes (ICD-10-CM)
  if (diagCol) {
    evalRule(
      'exp-icd10-code',
      'ICD-10-CM Diagnosis Code Structure',
      'expect_column_values_to_match_regex',
      'Diagnosis Codes',
      diagCol,
      (row) => {
        const raw = String(row[diagCol] ?? '').trim();
        if (!raw) return { ok: false, value: '(empty)', detail: 'Missing diagnosis code' };
        const ok = config.strictIcd10Pattern ? ICD10_REGEX.test(raw) : raw.length >= 3;
        return {
          ok,
          value: raw,
          detail: ok ? 'Valid' : 'Invalid ICD-10-CM syntax',
        };
      }
    );
  }

  // Rule 6: Healthcare Department Names
  if (deptCol) {
    evalRule(
      'exp-department-taxonomy',
      'Approved Hospital Department Taxonomy',
      'expect_column_values_to_be_in_set',
      'Healthcare Departments',
      deptCol,
      (row) => {
        const raw = String(row[deptCol] ?? '').trim();
        if (!raw) return { ok: false, value: '(empty)', detail: 'Missing department name' };
        const ok = config.requireCanonicalDepartment ? CANONICAL_DEPARTMENT_SET.has(raw) : raw.length >= 2;
        return {
          ok,
          value: raw,
          detail: ok ? 'Valid' : 'Department outside canonical hospital directory',
        };
      }
    );
  }

  // Rule 7: Mandatory Patient Fields Completeness
  const activeMandatory = config.mandatoryFields.filter((f) => columns.includes(f));
  evalRule(
    'exp-mandatory-fields',
    `Mandatory Patient Fields Non-Null (${activeMandatory.length} fields)`,
    'expect_compound_columns_to_not_be_null',
    'Mandatory Patient Fields',
    activeMandatory.join(', ') || 'Core Fields',
    (row) => {
      const missing = activeMandatory.filter((f) => isBlank(row[f]));
      if (missing.length > 0) {
        return {
          ok: false,
          value: missing.join(', '),
          detail: `Missing mandatory field(s): ${missing.join(', ')}`,
        };
      }
      return { ok: true, value: 'Complete', detail: 'Valid' };
    }
  );

  const passedRules = rules.filter((r) => r.status === 'Passed').length;
  const failedRules = rules.length - passedRules;
  const overallPassRate =
    rules.length > 0
      ? Number((rules.reduce((sum, r) => sum + r.passRate, 0) / rules.length).toFixed(1))
      : 100;

  return {
    target,
    executedAt: new Date().toISOString(),
    totalRules: rules.length,
    passedRules,
    failedRules,
    overallPassRate,
    passedRecordsCount: rows.length - failedRecordIndices.size,
    failedRecordsCount: failedRecordIndices.size,
    rules,
  };
}
