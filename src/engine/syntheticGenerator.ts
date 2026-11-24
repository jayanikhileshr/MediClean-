import type { PatientRecord } from '../types/mediclean';

export interface SampleDatasetDescriptor {
  id: string;
  name: string;
  description: string;
  recordCount: number;
  facility: string;
  seed: number;
}

export const SAMPLE_DATASETS: SampleDatasetDescriptor[] = [
  {
    id: 'general-hospital-1200',
    name: 'Metro_General_Admissions_1200.csv',
    description:
      'Multi-department inpatient admissions registry with intentional missing demographics, exact/MRN duplicates, malformed contacts, mixed dates, and billing outliers.',
    recordCount: 1200,
    facility: 'Metropolitan General Hospital (Synthetic)',
    seed: 202611,
  },
  {
    id: 'cardiology-registry-1050',
    name: 'HeartCare_Cardiology_Registry_1050.csv',
    description:
      'Cardiovascular outpatient & catheterization dataset exhibiting legacy MRN formatting, inconsistent diagnosis codes, and reversed discharge timestamps.',
    recordCount: 1050,
    facility: 'HeartCare Regional Center (Synthetic)',
    seed: 884217,
  },
  {
    id: 'emergency-triage-1100',
    name: 'Cascade_Emergency_Triage_1100.csv',
    description:
      'High-volume emergency triage intake feed with rapid-entry typos, missing blood groups, unstandardized department aliases, and extreme cost spikes.',
    recordCount: 1100,
    facility: 'Cascade Trauma & Emergency (Synthetic)',
    seed: 551903,
  },
];

export const CANONICAL_COLUMNS = [
  'Patient_ID',
  'Patient_Name',
  'Age',
  'Gender',
  'Phone_Number',
  'Email',
  'Admission_Date',
  'Discharge_Date',
  'Department',
  'Diagnosis_Code',
  'Blood_Group',
  'Treatment_Cost',
];

export const CANONICAL_DEPARTMENTS = [
  'Cardiology',
  'Emergency',
  'Neurology',
  'Oncology',
  'Orthopedics',
  'Pediatrics',
  'Internal Medicine',
  'Radiology',
] as const;

// 100% fictional names strictly for synthetic generation
const FIRST_NAMES = [
  'Aarav', 'Elena', 'Marcus', 'Priya', 'Hannah', 'Liam', 'Nadia', 'Devon',
  'Sofia', 'Caleb', 'Mei', 'Julian', 'Amara', 'Owen', 'Tessa', 'Rohan',
  'Clara', 'Isaac', 'Yuki', 'Gabriel', 'Sienna', 'Nolan', 'Zara', 'Victor',
  'Leila', 'Henry', 'Anika', 'Miles', 'Freya', 'Samuel', 'Camila', 'Lucas',
];

const LAST_NAMES = [
  'Alder', 'Vance', 'Kulkarni', 'Mercer', 'Sato', 'Delgado', 'Whitaker', 'Okafor',
  'Lindqvist', 'Bhatia', 'Callahan', 'Moreau', 'Haddad', 'Kowalski', 'Sterling', 'Chen',
  'Alvarez', 'Bennett', 'Patel', 'Sorensen', 'Gallagher', 'Mendoza', 'Kimura', 'Thorne',
  'Navarro', 'Fletcher', 'Ibrahim', 'Richter', 'Pemberton', 'Solis', 'Chandra', 'Brooks',
];

const DEPT_VARIANTS: Record<string, string[]> = {
  Cardiology: ['Cardiology', 'cardiology', 'CARDIO', 'Cardio Dept', 'cardio'],
  Emergency: ['Emergency', 'ER', 'emerg', 'EMERGENCY', 'Emergency Room'],
  Neurology: ['Neurology', 'neuro', 'NEUROLOGY', 'Neuro Dept'],
  Oncology: ['Oncology', 'oncology', 'ONCO', 'Onco Care'],
  Orthopedics: ['Orthopedics', 'ortho', 'ORTHO', 'Orthopaedics'],
  Pediatrics: ['Pediatrics', 'peds', 'PEDIATRICS', 'Paediatrics'],
  'Internal Medicine': ['Internal Medicine', 'Int Med', 'INTERNAL MED', 'internal medicine'],
  Radiology: ['Radiology', 'rad', 'RADIOLOGY', 'Imaging/Rad'],
};

const VALID_ICD10_BY_DEPT: Record<string, string[]> = {
  Cardiology: ['I10', 'I25.10', 'I48.91', 'I50.9', 'I21.4'],
  Emergency: ['R07.9', 'S06.0X0A', 'R51.9', 'T14.90', 'J96.00'],
  Neurology: ['G43.909', 'G40.909', 'I63.9', 'G20', 'G35'],
  Oncology: ['C50.919', 'C34.90', 'C18.9', 'C61', 'C91.00'],
  Orthopedics: ['M17.11', 'S72.001A', 'M54.50', 'M25.561', 'S82.891A'],
  Pediatrics: ['J06.9', 'J45.909', 'H66.90', 'R50.9', 'A08.4'],
  'Internal Medicine': ['E11.9', 'J18.9', 'E78.5', 'N39.0', 'K21.9'],
  Radiology: ['R91.8', 'R93.1', 'M81.0', 'R94.31', 'Z01.89'],
};

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const MESSY_BLOOD_GROUPS = ['a+', 'o pos', 'B positive', 'AB-neg', 'O-', 'Unknown', ''];
const MESSY_GENDERS = ['M', 'male', 'MALE', 'F', 'female', 'fem', 'Non-binary', 'NB', 'UNK', 'Other'];
const EMAIL_DOMAINS = ['clinicmail.example', 'healthnet.example', 'careportal.example', 'medmail.example'];

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDateIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function formatMessyDate(d: Date, variant: number): string {
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (variant === 0) return `${m}/${day}/${y}`;
  if (variant === 1) return `${day}-${months[d.getUTCMonth()]}-${y}`;
  if (variant === 2) return `${y}/${m}/${day}`;
  return `${y}-13-${day}`; // intentionally invalid month
}

export function generateSyntheticDataset(descriptor: SampleDatasetDescriptor): PatientRecord[] {
  const rand = createRng(descriptor.seed);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
  const rows: PatientRecord[] = [];
  const baseRecordsCount = descriptor.recordCount - 36; // Reserve 36 exact/near duplicates to hit exact recordCount

  const startMs = Date.UTC(2024, 0, 1);
  const dayMs = 86400000;

  for (let i = 0; i < baseRecordsCount; i++) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const canonicalDept =
      descriptor.id === 'cardiology-registry-1050' && rand() < 0.55
        ? 'Cardiology'
        : descriptor.id === 'emergency-triage-1100' && rand() < 0.52
        ? 'Emergency'
        : pick(CANONICAL_DEPARTMENTS);

    const mrnNum = 100000 + i * 7 + Math.floor(rand() * 5);
    let patientId = `MRN-${mrnNum}`;
    const rMrn = rand();
    if (rMrn < 0.028) {
      patientId = `PAT${mrnNum}`; // invalid prefix
    } else if (rMrn < 0.044) {
      patientId = `MRN-${String(mrnNum).slice(0, 4)}`; // too short
    } else if (rMrn < 0.05) {
      patientId = ''; // missing mandatory MRN
    }

    let patientName = `${first} ${last}`;
    const rName = rand();
    if (rName < 0.03) {
      patientName = `  ${first.toLowerCase()}   ${last.toUpperCase()} `; // whitespace & casing noise
    } else if (rName < 0.042) {
      patientName = ''; // missing name
    }

    let age: string | number =
      canonicalDept === 'Pediatrics'
        ? Math.floor(1 + rand() * 17)
        : Math.floor(19 + rand() * 73);
    const rAge = rand();
    if (rAge < 0.015) age = -Math.floor(2 + rand() * 18); // negative age
    else if (rAge < 0.028) age = Math.floor(126 + rand() * 65); // impossible age > 120
    else if (rAge < 0.038) age = 'N/A'; // non-numeric age
    else if (rAge < 0.068) age = ''; // missing age

    let gender: string = rand() < 0.49 ? 'Male' : rand() < 0.96 ? 'Female' : 'Non-Binary';
    const rGen = rand();
    if (rGen < 0.14) {
      gender = pick(MESSY_GENDERS);
    } else if (rGen < 0.165) {
      gender = '';
    }

    const area = 210 + Math.floor(rand() * 740);
    const mid = 200 + Math.floor(rand() * 790);
    const tail = 1000 + Math.floor(rand() * 8999);
    let phone = `+1 (${area}) ${mid}-${tail}`;
    const rPhone = rand();
    if (rPhone < 0.055) phone = `${area}${mid}${tail}`; // unformatted 10 digits
    else if (rPhone < 0.095) phone = `${area}-${tail}`; // invalid short phone
    else if (rPhone < 0.115) phone = '555-CALL-NOW'; // alphabetic phone
    else if (rPhone < 0.15) phone = ''; // missing phone

    const domain = pick(EMAIL_DOMAINS);
    let email = `${first.toLowerCase()}.${last.toLowerCase()}${mrnNum % 97}@${domain}`;
    const rEmail = rand();
    if (rEmail < 0.04) email = `${first.toLowerCase()}.${last.toLowerCase()}[at]${domain}`;
    else if (rEmail < 0.072) email = `${first.toLowerCase()}@invalid_domain`;
    else if (rEmail < 0.105) email = '';

    const admitOffsetDays = Math.floor(rand() * 640);
    const stayDays = Math.floor(1 + rand() * 14);
    const admitDateObj = new Date(startMs + admitOffsetDays * dayMs);
    const dischargeDateObj = new Date(startMs + (admitOffsetDays + stayDays) * dayMs);

    let admissionDate = formatDateIso(admitDateObj);
    let dischargeDate = formatDateIso(dischargeDateObj);
    const rDate = rand();
    if (rDate < 0.065) {
      admissionDate = formatMessyDate(admitDateObj, Math.floor(rand() * 3));
    } else if (rDate < 0.082) {
      admissionDate = formatMessyDate(admitDateObj, 3); // invalid month 13
    } else if (rDate < 0.105) {
      // Discharge BEFORE admission logical error
      const reversed = new Date(startMs + Math.max(0, admitOffsetDays - Math.floor(2 + rand() * 6)) * dayMs);
      dischargeDate = formatDateIso(reversed);
    } else if (rDate < 0.13) {
      dischargeDate = formatMessyDate(dischargeDateObj, Math.floor(rand() * 3));
    } else if (rDate < 0.145) {
      dischargeDate = '';
    }

    let department: string = canonicalDept;
    if (rand() < 0.15) {
      department = pick(DEPT_VARIANTS[canonicalDept]);
    } else if (rand() < 0.015) {
      department = '';
    }

    let diagnosisCode = pick(VALID_ICD10_BY_DEPT[canonicalDept]);
    const rDiag = rand();
    if (rDiag < 0.032) diagnosisCode = '999-ERR'; // invalid ICD-10
    else if (rDiag < 0.05) diagnosisCode = '';

    let bloodGroup = pick(BLOOD_GROUPS);
    const rBlood = rand();
    if (rBlood < 0.06) bloodGroup = pick(MESSY_BLOOD_GROUPS);
    else if (rBlood < 0.095) bloodGroup = '';

    // Department-realistic base cost
    const deptBaseCost: Record<string, number> = {
      Cardiology: 14500,
      Oncology: 21000,
      Neurology: 16200,
      Orthopedics: 13800,
      Emergency: 6400,
      'Internal Medicine': 8200,
      Pediatrics: 5100,
      Radiology: 3400,
    };
    const base = deptBaseCost[canonicalDept] ?? 9500;
    let costVal: string | number = Number((base * (0.55 + rand() * 1.15)).toFixed(2));
    const rCost = rand();
    if (rCost < 0.022) {
      // Extreme high statistical billing outlier (Z > 4)
      costVal = Number((base * (6.2 + rand() * 4.5)).toFixed(2));
    } else if (rCost < 0.03) {
      // Negative billing entry
      costVal = Number((-Math.floor(400 + rand() * 2500)).toFixed(2));
    } else if (rCost < 0.05) {
      // String currency symbol needing type correction
      costVal = `$${Number(costVal).toLocaleString('en-US')}`;
    } else if (rCost < 0.072) {
      costVal = '';
    }

    rows.push({
      Patient_ID: patientId,
      Patient_Name: patientName,
      Age: age,
      Gender: gender,
      Phone_Number: phone,
      Email: email,
      Admission_Date: admissionDate,
      Discharge_Date: dischargeDate,
      Department: department,
      Diagnosis_Code: diagnosisCode,
      Blood_Group: bloodGroup,
      Treatment_Cost: costVal,
    });
  }

  // Inject 36 exact and near-duplicate records distributed through the dataset
  for (let d = 0; d < 36; d++) {
    const sourceIdx = Math.floor(rand() * Math.min(rows.length, 800));
    const clone: PatientRecord = { ...rows[sourceIdx] };
    if (d % 3 === 0) {
      // Near duplicate with whitespace variation on name
      clone.Patient_Name = `${String(clone.Patient_Name || '')} `;
    }
    const insertAt = Math.floor(rand() * rows.length);
    rows.splice(insertAt, 0, clone);
  }

  return rows;
}
