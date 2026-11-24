import type {
  AuditLogEntry,
  GovernancePolicy,
  ProcessingRunRecord,
  UserRole,
} from '../types/mediclean';
import { sanitizeAuditText } from './governance';

export async function fetchProcessingHistory(): Promise<ProcessingRunRecord[]> {
  const res = await fetch('/api/history');
  if (!res.ok) throw new Error('Failed to load processing history');
  const data = (await res.json()) as { runs: ProcessingRunRecord[] };
  return data.runs || [];
}

export async function recordProcessingRun(
  run: Omit<ProcessingRunRecord, 'id' | 'createdAt'>
): Promise<ProcessingRunRecord> {
  const res = await fetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(run),
  });
  if (!res.ok) throw new Error('Failed to save processing run');
  const data = (await res.json()) as { run: ProcessingRunRecord };
  return data.run;
}

export async function removeProcessingRun(id: string): Promise<void> {
  const res = await fetch(`/api/history/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete processing run');
}

export async function fetchAuditLogs(limit = 150): Promise<AuditLogEntry[]> {
  const res = await fetch(`/api/audit?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to load audit logs');
  const data = (await res.json()) as { logs: AuditLogEntry[] };
  return data.logs || [];
}

export async function appendAuditLog(entry: {
  actorRole: UserRole;
  actionType: string;
  targetDataset: string;
  details: string;
  severity: 'Info' | 'Governance' | 'Security';
}): Promise<AuditLogEntry> {
  const res = await fetch('/api/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...entry,
      details: sanitizeAuditText(entry.details),
    }),
  });
  if (!res.ok) throw new Error('Failed to write audit log');
  const data = (await res.json()) as { log: AuditLogEntry };
  return data.log;
}

export async function fetchGovernancePolicy(): Promise<GovernancePolicy | null> {
  const res = await fetch('/api/policies');
  if (!res.ok) return null;
  const data = (await res.json()) as { policy?: GovernancePolicy };
  return data.policy ?? null;
}

export async function updateGovernancePolicy(
  policy: GovernancePolicy,
  updatedBy: UserRole
): Promise<GovernancePolicy> {
  const res = await fetch('/api/policies', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policy, updatedBy }),
  });
  if (!res.ok) throw new Error('Failed to persist governance policy');
  const data = (await res.json()) as { policy: GovernancePolicy };
  return data.policy;
}
