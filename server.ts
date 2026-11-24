import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDb,
  listProcessingRuns,
  insertProcessingRun,
  deleteProcessingRun,
  listAuditLogs,
  insertAuditLog,
  getGovernancePolicy,
  saveGovernancePolicy,
} from './server/db.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createServer(): Promise<void> {
  // Initialize SQLite database early
  await getDb();

  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'MediClean Governance API' });
  });

  app.get('/api/history', async (_req, res) => {
    try {
      const runs = await listProcessingRuns();
      res.json({ runs });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve processing history', detail: String(err) });
    }
  });

  app.post('/api/history', async (req, res) => {
    try {
      const body = req.body;
      if (!body || !body.datasetName) {
        res.status(400).json({ error: 'Missing datasetName in processing run payload' });
        return;
      }
      const created = await insertProcessingRun(body);
      res.status(201).json({ run: created });
    } catch (err) {
      res.status(500).json({ error: 'Failed to store processing run', detail: String(err) });
    }
  });

  app.delete('/api/history/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '');
      if (!id) {
        res.status(400).json({ error: 'Missing run ID' });
        return;
      }
      await deleteProcessingRun(id);
      res.json({ deleted: true, id });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete processing run', detail: String(err) });
    }
  });

  app.get('/api/audit', async (req, res) => {
    try {
      const limit = Number(req.query.limit) || 150;
      const logs = await listAuditLogs(limit);
      res.json({ logs });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve audit logs', detail: String(err) });
    }
  });

  app.post('/api/audit', async (req, res) => {
    try {
      const body = req.body;
      if (!body || !body.actionType) {
        res.status(400).json({ error: 'Missing actionType in audit entry' });
        return;
      }
      const log = await insertAuditLog({
        actorRole: String(body.actorRole || 'Data Steward'),
        actionType: String(body.actionType),
        targetDataset: String(body.targetDataset || 'Active Workspace'),
        details: String(body.details || ''),
        severity: String(body.severity || 'Info'),
      });
      res.status(201).json({ log });
    } catch (err) {
      res.status(500).json({ error: 'Failed to record audit entry', detail: String(err) });
    }
  });

  app.get('/api/policies', async (_req, res) => {
    try {
      const policy = await getGovernancePolicy();
      res.json({ policy });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch governance policy', detail: String(err) });
    }
  });

  app.put('/api/policies', async (req, res) => {
    try {
      const { policy, updatedBy } = req.body || {};
      if (!policy || typeof policy !== 'object') {
        res.status(400).json({ error: 'Invalid policy payload' });
        return;
      }
      const saved = await saveGovernancePolicy(policy, String(updatedBy || 'Privacy Officer'));
      res.json({ policy: saved });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save governance policy', detail: String(err) });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MediClean server listening on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start MediClean server:', err);
  process.exit(1);
});
