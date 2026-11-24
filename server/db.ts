import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';

export interface StoredProcessingRun {
  id: string;
  datasetName: string;
  sourceType: string;
  recordCountBefore: number;
  recordCountAfter: number;
  qualityScoreBefore: number;
  qualityScoreAfter: number;
  issuesDetected: number;
  issuesResolved: number;
  rulesApplied: string[];
  originalHash: string;
  cleanedHash: string;
  operatorRole: string;
  createdAt: string;
}

export interface StoredAuditLog {
  id: string;
  timestamp: string;
  actorRole: string;
  actionType: string;
  targetDataset: string;
  details: string;
  severity: string;
  integrityHash: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'mediclean.sqlite');

let dbInstance: Database | null = null;

function sanitizeLogDetails(text: string): string {
  // Scrub any accidental emails, phone numbers, or raw MRN digits before writing to SQLite audit log
  return String(text || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[REDACTED_PHONE]')
    .replace(/\bMRN-\d{6}\b/g, 'MRN-******')
    .slice(0, 600);
}

function persistDb(): void {
  if (!dbInstance) return;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const binary = dbInstance.export();
  fs.writeFileSync(DB_PATH, Buffer.from(binary));
}

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
  }

  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS processing_runs (
      id TEXT PRIMARY KEY,
      dataset_name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      record_count_before INTEGER NOT NULL,
      record_count_after INTEGER NOT NULL,
      quality_score_before REAL NOT NULL,
      quality_score_after REAL NOT NULL,
      issues_detected INTEGER NOT NULL,
      issues_resolved INTEGER NOT NULL,
      rules_applied_json TEXT NOT NULL,
      original_hash TEXT NOT NULL,
      cleaned_hash TEXT NOT NULL,
      operator_role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_dataset TEXT NOT NULL,
      details_sanitized TEXT NOT NULL,
      severity TEXT NOT NULL,
      integrity_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS governance_policies (
      policy_key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );
  `);

  // Seed default governance policy if absent
  const existingPolicy = dbInstance.exec(
    "SELECT value_json FROM governance_policies WHERE policy_key = 'default_privacy'"
  );
  if (existingPolicy.length === 0) {
    const defaultPolicy = {
      maskPatientId: true,
      maskPatientName: true,
      maskEmail: true,
      maskPhone: true,
      enforceHipaaSafeHarborOnExport: true,
      autoLogAllActions: true,
    };
    dbInstance.run(
      'INSERT INTO governance_policies (policy_key, value_json, updated_at, updated_by) VALUES (?, ?, ?, ?)',
      ['default_privacy', JSON.stringify(defaultPolicy), new Date().toISOString(), 'System Initialization']
    );
  }

  persistDb();
  return dbInstance;
}

export async function listProcessingRuns(): Promise<StoredProcessingRun[]> {
  const db = await getDb();
  const res = db.exec(
    `SELECT id, dataset_name, source_type, record_count_before, record_count_after,
            quality_score_before, quality_score_after, issues_detected, issues_resolved,
            rules_applied_json, original_hash, cleaned_hash, operator_role, created_at
     FROM processing_runs
     ORDER BY created_at DESC
     LIMIT 100`
  );
  if (res.length === 0) return [];
  return res[0].values.map((row) => ({
    id: String(row[0]),
    datasetName: String(row[1]),
    sourceType: String(row[2]),
    recordCountBefore: Number(row[3]),
    recordCountAfter: Number(row[4]),
    qualityScoreBefore: Number(row[5]),
    qualityScoreAfter: Number(row[6]),
    issuesDetected: Number(row[7]),
    issuesResolved: Number(row[8]),
    rulesApplied: safeJsonParse<string[]>(String(row[9]), []),
    originalHash: String(row[10]),
    cleanedHash: String(row[11]),
    operatorRole: String(row[12]),
    createdAt: String(row[13]),
  }));
}

export async function insertProcessingRun(run: StoredProcessingRun): Promise<StoredProcessingRun> {
  const db = await getDb();
  const id = run.id || `run-${crypto.randomUUID().slice(0, 8)}`;
  const createdAt = run.createdAt || new Date().toISOString();
  db.run(
    `INSERT OR REPLACE INTO processing_runs (
      id, dataset_name, source_type, record_count_before, record_count_after,
      quality_score_before, quality_score_after, issues_detected, issues_resolved,
      rules_applied_json, original_hash, cleaned_hash, operator_role, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      String(run.datasetName).slice(0, 200),
      String(run.sourceType).slice(0, 60),
      Math.max(0, Math.floor(Number(run.recordCountBefore) || 0)),
      Math.max(0, Math.floor(Number(run.recordCountAfter) || 0)),
      Number(run.qualityScoreBefore) || 0,
      Number(run.qualityScoreAfter) || 0,
      Math.max(0, Math.floor(Number(run.issuesDetected) || 0)),
      Math.max(0, Math.floor(Number(run.issuesResolved) || 0)),
      JSON.stringify(Array.isArray(run.rulesApplied) ? run.rulesApplied : []),
      String(run.originalHash || '').slice(0, 128),
      String(run.cleanedHash || '').slice(0, 128),
      String(run.operatorRole || 'Data Steward').slice(0, 60),
      createdAt,
    ]
  );
  persistDb();
  return { ...run, id, createdAt };
}

export async function deleteProcessingRun(id: string): Promise<boolean> {
  const db = await getDb();
  db.run('DELETE FROM processing_runs WHERE id = ?', [id]);
  persistDb();
  return true;
}

export async function listAuditLogs(limit = 150): Promise<StoredAuditLog[]> {
  const db = await getDb();
  const safeLimit = Math.min(Math.max(1, limit), 500);
  const res = db.exec(
    `SELECT id, timestamp, actor_role, action_type, target_dataset, details_sanitized, severity, integrity_hash
     FROM audit_logs
     ORDER BY timestamp DESC
     LIMIT ${safeLimit}`
  );
  if (res.length === 0) return [];
  return res[0].values.map((row) => ({
    id: String(row[0]),
    timestamp: String(row[1]),
    actorRole: String(row[2]),
    actionType: String(row[3]),
    targetDataset: String(row[4]),
    details: String(row[5]),
    severity: String(row[6]),
    integrityHash: String(row[7]),
  }));
}

export async function insertAuditLog(entry: Omit<StoredAuditLog, 'id' | 'timestamp' | 'integrityHash'> & {
  id?: string;
  timestamp?: string;
}): Promise<StoredAuditLog> {
  const db = await getDb();
  const id = entry.id || `aud-${crypto.randomUUID().slice(0, 8)}`;
  const timestamp = entry.timestamp || new Date().toISOString();
  const sanitizedDetails = sanitizeLogDetails(entry.details);
  const integrityHash = crypto
    .createHash('sha256')
    .update(`${id}|${timestamp}|${entry.actorRole}|${entry.actionType}|${entry.targetDataset}|${sanitizedDetails}`)
    .digest('hex')
    .slice(0, 16);

  db.run(
    `INSERT INTO audit_logs (
      id, timestamp, actor_role, action_type, target_dataset, details_sanitized, severity, integrity_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      timestamp,
      String(entry.actorRole || 'Data Steward').slice(0, 60),
      String(entry.actionType || 'Event').slice(0, 80),
      String(entry.targetDataset || 'Active Workspace').slice(0, 160),
      sanitizedDetails,
      String(entry.severity || 'Info').slice(0, 30),
      integrityHash,
    ]
  );
  persistDb();
  return {
    id,
    timestamp,
    actorRole: entry.actorRole,
    actionType: entry.actionType,
    targetDataset: entry.targetDataset,
    details: sanitizedDetails,
    severity: entry.severity,
    integrityHash,
  };
}

export async function getGovernancePolicy(): Promise<Record<string, unknown>> {
  const db = await getDb();
  const res = db.exec(
    "SELECT value_json FROM governance_policies WHERE policy_key = 'default_privacy'"
  );
  if (res.length === 0 || res[0].values.length === 0) {
    return {
      maskPatientId: true,
      maskPatientName: true,
      maskEmail: true,
      maskPhone: true,
      enforceHipaaSafeHarborOnExport: true,
      autoLogAllActions: true,
    };
  }
  return safeJsonParse<Record<string, unknown>>(String(res[0].values[0][0]), {});
}

export async function saveGovernancePolicy(
  policy: Record<string, unknown>,
  updatedBy: string
): Promise<Record<string, unknown>> {
  const db = await getDb();
  db.run(
    `INSERT OR REPLACE INTO governance_policies (policy_key, value_json, updated_at, updated_by)
     VALUES (?, ?, ?, ?)`,
    ['default_privacy', JSON.stringify(policy), new Date().toISOString(), String(updatedBy || 'Privacy Officer')]
  );
  persistDb();
  return policy;
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
