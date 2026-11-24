import type {
  ColumnProfile,
  GovernancePolicy,
  PatientRecord,
  RolePermissions,
  UserRole,
} from '../types/mediclean';

export const ROLE_MATRIX: Record<UserRole, RolePermissions> = {
  'Privacy Officer': {
    role: 'Privacy Officer',
    description: 'Full governance oversight, masking policy authority, controlled PHI unmasking (audit logged), cleaning execution, and archive administration.',
    canUpload: true,
    canClean: true,
    canUnmaskPii: true,
    canEditGovernance: true,
    canExportClean: true,
    canDeleteHistory: true,
  },
  'Data Steward': {
    role: 'Data Steward',
    description: 'Ingests clinical datasets, configures and executes automated cleaning pipelines, runs validation suites, and exports de-identified outputs.',
    canUpload: true,
    canClean: true,
    canUnmaskPii: false,
    canEditGovernance: false,
    canExportClean: true,
    canDeleteHistory: false,
  },
  'Clinical Analyst': {
    role: 'Clinical Analyst',
    description: 'Inspects quality diagnostics, anomaly charts, and validation outcomes under mandatory HIPAA Safe Harbor masking. Cannot modify datasets.',
    canUpload: false,
    canClean: false,
    canUnmaskPii: false,
    canEditGovernance: false,
    canExportClean: true,
    canDeleteHistory: false,
  },
  'Compliance Auditor': {
    role: 'Compliance Auditor',
    description: 'Read-only access to governance policies, dataset integrity hashes, validation compliance reports, and immutable SQLite audit trails.',
    canUpload: false,
    canClean: false,
    canUnmaskPii: false,
    canEditGovernance: false,
    canExportClean: false,
    canDeleteHistory: false,
  },
};

export const DEFAULT_GOVERNANCE_POLICY: GovernancePolicy = {
  maskPatientId: true,
  maskPatientName: true,
  maskEmail: true,
  maskPhone: true,
  enforceHipaaSafeHarborOnExport: true,
  autoLogAllActions: true,
};

export function maskPatientId(value: unknown): string {
  const str = String(value ?? '').trim();
  if (!str) return '—';
  if (str.length <= 3) return '•••';
  if (str.toUpperCase().startsWith('MRN-')) {
    const tail = str.slice(-3);
    return `MRN-•••${tail}`;
  }
  return `${str.slice(0, 2)}••••${str.slice(-2)}`;
}

export function maskPatientName(value: unknown): string {
  const str = String(value ?? '').trim();
  if (!str) return '—';
  return str
    .split(/\s+/)
    .map((part) => {
      if (part.length <= 1) return '•';
      return `${part[0]}${'•'.repeat(Math.min(Math.max(part.length - 1, 2), 6))}`;
    })
    .join(' ');
}

export function maskEmail(value: unknown): string {
  const str = String(value ?? '').trim();
  if (!str) return '—';
  const atIdx = str.indexOf('@');
  if (atIdx <= 0) return '•••••• (invalid)';
  const local = str.slice(0, atIdx);
  const domain = str.slice(atIdx + 1);
  const dotIdx = domain.lastIndexOf('.');
  const domainName = dotIdx > 0 ? domain.slice(0, dotIdx) : domain;
  const tld = dotIdx > 0 ? domain.slice(dotIdx) : '';
  return `${local[0]}••••@${domainName[0] || '•'}•••${tld}`;
}

export function maskPhone(value: unknown): string {
  const str = String(value ?? '').trim();
  if (!str) return '—';
  const digits = str.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `(•••) •••-${digits.slice(-4)}`;
  }
  return '(•••) •••-••••';
}

export function classifyColumnPii(
  columnName: string
): { piiCategory: ColumnProfile['piiCategory']; hipaaTag: string } {
  const lower = columnName.toLowerCase();
  if (/(patient_name|full_name|first_name|last_name|\bname\b)/.test(lower)) {
    return { piiCategory: 'Direct Identifier (PHI)', hipaaTag: 'HIPAA §164.514(b)(2) — Names' };
  }
  if (/(patient_id|mrn|medical_record|ssn|national_id)/.test(lower)) {
    return { piiCategory: 'Direct Identifier (PHI)', hipaaTag: 'HIPAA §164.514(b)(2) — Medical Record Number' };
  }
  if (/(email|e_mail)/.test(lower)) {
    return { piiCategory: 'Direct Identifier (PHI)', hipaaTag: 'HIPAA §164.514(b)(2) — Electronic Mail' };
  }
  if (/(phone|mobile|tel|contact)/.test(lower)) {
    return { piiCategory: 'Direct Identifier (PHI)', hipaaTag: 'HIPAA §164.514(b)(2) — Telephone Number' };
  }
  if (/(admission_date|discharge_date|dob|birth|date)/.test(lower)) {
    return { piiCategory: 'Quasi-Identifier', hipaaTag: 'HIPAA §164.514(b)(2) — Service Dates' };
  }
  if (/(age|gender|sex|zip|postal)/.test(lower)) {
    return { piiCategory: 'Quasi-Identifier', hipaaTag: 'Demographics — Re-identification Risk' };
  }
  if (/(diagnosis|icd|blood_group|treatment_cost|medication|lab)/.test(lower)) {
    return { piiCategory: 'Clinical Sensitive', hipaaTag: 'Clinical & Financial Health Data' };
  }
  return { piiCategory: 'Operational', hipaaTag: 'Facility & Workflow Metadata' };
}

export function maskCellValue(
  columnName: string,
  value: unknown,
  policy: GovernancePolicy,
  allowUnmask: boolean
): string {
  if (value === null || value === undefined || String(value).trim() === '') {
    return '—';
  }
  if (allowUnmask) {
    return String(value);
  }
  const lower = columnName.toLowerCase();
  if (policy.maskPatientId && /(patient_id|mrn|medical_record)/.test(lower)) {
    return maskPatientId(value);
  }
  if (policy.maskPatientName && /(patient_name|full_name|\bname\b)/.test(lower)) {
    return maskPatientName(value);
  }
  if (policy.maskEmail && /(email|e_mail)/.test(lower)) {
    return maskEmail(value);
  }
  if (policy.maskPhone && /(phone|mobile|tel)/.test(lower)) {
    return maskPhone(value);
  }
  return String(value);
}

export function applySafeHarborMasking(
  rows: PatientRecord[],
  policy: GovernancePolicy
): PatientRecord[] {
  return rows.map((row) => {
    const masked: PatientRecord = {};
    for (const [key, val] of Object.entries(row)) {
      if (val === null || val === undefined || String(val).trim() === '') {
        masked[key] = '';
        continue;
      }
      const lower = key.toLowerCase();
      if (policy.maskPatientId && /(patient_id|mrn|medical_record)/.test(lower)) {
        masked[key] = maskPatientId(val);
      } else if (policy.maskPatientName && /(patient_name|full_name|\bname\b)/.test(lower)) {
        masked[key] = maskPatientName(val);
      } else if (policy.maskEmail && /(email|e_mail)/.test(lower)) {
        masked[key] = maskEmail(val);
      } else if (policy.maskPhone && /(phone|mobile|tel)/.test(lower)) {
        masked[key] = maskPhone(val);
      } else {
        masked[key] = val;
      }
    }
    return masked;
  });
}

export function profileDatasetColumns(
  columns: string[],
  rows: PatientRecord[],
  policy: GovernancePolicy,
  allowUnmask: boolean
): ColumnProfile[] {
  const total = rows.length || 1;
  return columns.map((name) => {
    let nonNullCount = 0;
    const uniqueSet = new Set<string>();
    const samples: string[] = [];
    let numMatches = 0;
    let dateMatches = 0;

    for (const row of rows) {
      const raw = row[name];
      const str = raw === null || raw === undefined ? '' : String(raw).trim();
      if (str !== '') {
        nonNullCount++;
        uniqueSet.add(str);
        if (samples.length < 3 && !samples.includes(str)) {
          samples.push(maskCellValue(name, str, policy, allowUnmask));
        }
        const cleanedNum = str.replace(/[$,]/g, '');
        if (!Number.isNaN(Number(cleanedNum)) && cleanedNum !== '') {
          numMatches++;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(str) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(str)) {
          dateMatches++;
        }
      }
    }

    const lower = name.toLowerCase();
    let inferredType: ColumnProfile['inferredType'] = 'string';
    if (/(patient_id|mrn|id$)/.test(lower)) inferredType = 'identifier';
    else if (/(email)/.test(lower)) inferredType = 'email';
    else if (/(phone|tel|mobile)/.test(lower)) inferredType = 'phone';
    else if (/(date|dob)/.test(lower) || (nonNullCount > 0 && dateMatches / nonNullCount > 0.6)) inferredType = 'date';
    else if (nonNullCount > 0 && numMatches / nonNullCount > 0.75) inferredType = 'number';
    else if (uniqueSet.size <= 25 && nonNullCount > 20) inferredType = 'categorical';

    const { piiCategory, hipaaTag } = classifyColumnPii(name);
    const missingCount = rows.length - nonNullCount;

    return {
      name,
      inferredType,
      nonNullCount,
      missingCount,
      completenessPct: Number(((nonNullCount / total) * 100).toFixed(1)),
      uniqueCount: uniqueSet.size,
      sampleValues: samples,
      piiCategory,
      hipaaTag,
    };
  });
}

export async function computeDatasetHash(rows: PatientRecord[]): Promise<string> {
  const payload = JSON.stringify(rows);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(payload);
    const buffer = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 24);
  }
  // Deterministic fallback hash
  let h = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h).toString(16).padStart(16, '0');
}

export function sanitizeAuditText(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[REDACTED_PHONE]')
    .replace(/\bMRN-\d{6}\b/g, 'MRN-******');
}
