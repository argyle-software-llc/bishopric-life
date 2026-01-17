import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const router = Router();

// Track sync state
let syncInProgress = false;
let lastSyncTime: Date | null = null;
let lastSyncStatus: 'success' | 'failed' | null = null;
let lastSyncOutput: string = '';

// Path to sync script and tokens
const SCRIPTS_DIR = path.resolve(__dirname, '../../../scripts');
const SYNC_SCRIPT = path.join(SCRIPTS_DIR, 'sync_from_membertools.py');
const TOKENS_FILE = path.resolve(__dirname, '../../../.oauth_tokens.json');

// Load last sync info from file on startup
const SYNC_STATE_FILE = path.resolve(__dirname, '../../../.sync_state.json');
try {
  if (fs.existsSync(SYNC_STATE_FILE)) {
    const state = JSON.parse(fs.readFileSync(SYNC_STATE_FILE, 'utf-8'));
    lastSyncTime = state.lastSyncTime ? new Date(state.lastSyncTime) : null;
    lastSyncStatus = state.lastSyncStatus || null;
  }
} catch (e) {
  console.error('Failed to load sync state:', e);
}

function saveSyncState() {
  try {
    fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify({
      lastSyncTime: lastSyncTime?.toISOString(),
      lastSyncStatus,
    }, null, 2));
  } catch (e) {
    console.error('Failed to save sync state:', e);
  }
}

/**
 * Run the sync script
 */
async function runSync(): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const output: string[] = [];

    // Check if tokens file exists
    if (!fs.existsSync(TOKENS_FILE)) {
      resolve({
        success: false,
        output: 'OAuth tokens file not found. Please set up authentication first.',
      });
      return;
    }

    // Check if sync script exists
    if (!fs.existsSync(SYNC_SCRIPT)) {
      resolve({
        success: false,
        output: `Sync script not found at ${SYNC_SCRIPT}`,
      });
      return;
    }

    const pythonProcess = spawn('python3', [SYNC_SCRIPT], {
      cwd: SCRIPTS_DIR,
      env: {
        ...process.env,
        OAUTH_TOKENS_FILE: TOKENS_FILE,
        DATABASE_URL: process.env.DATABASE_URL,
      },
    });

    pythonProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output.push(text);
      console.log('[sync]', text.trim());
    });

    pythonProcess.stderr.on('data', (data) => {
      const text = data.toString();
      output.push(`[stderr] ${text}`);
      console.error('[sync error]', text.trim());
    });

    pythonProcess.on('close', (code) => {
      resolve({
        success: code === 0,
        output: output.join(''),
      });
    });

    pythonProcess.on('error', (err) => {
      resolve({
        success: false,
        output: `Failed to start sync process: ${err.message}`,
      });
    });
  });
}

/**
 * GET /api/sync/status
 * Get current sync status
 */
router.get('/status', (_req, res) => {
  res.json({
    syncInProgress,
    lastSyncTime: lastSyncTime?.toISOString() || null,
    lastSyncStatus,
    tokensConfigured: fs.existsSync(TOKENS_FILE),
  });
});

/**
 * POST /api/sync/trigger
 * Manually trigger a sync
 */
router.post('/trigger', async (_req, res) => {
  if (syncInProgress) {
    return res.status(409).json({
      success: false,
      message: 'Sync already in progress',
    });
  }

  syncInProgress = true;
  lastSyncOutput = '';

  // Start sync in background and return immediately
  res.json({
    success: true,
    message: 'Sync started',
  });

  // Run the sync
  const result = await runSync();

  syncInProgress = false;
  lastSyncTime = new Date();
  lastSyncStatus = result.success ? 'success' : 'failed';
  lastSyncOutput = result.output;
  saveSyncState();

  console.log(`Sync completed: ${lastSyncStatus}`);
});

/**
 * GET /api/sync/output
 * Get the output from the last sync
 */
router.get('/output', (_req, res) => {
  res.json({
    syncInProgress,
    lastSyncTime: lastSyncTime?.toISOString() || null,
    lastSyncStatus,
    output: lastSyncOutput,
  });
});

/**
 * Export function to trigger sync programmatically (for scheduled sync)
 */
export async function triggerScheduledSync(): Promise<void> {
  if (syncInProgress) {
    console.log('Scheduled sync skipped - sync already in progress');
    return;
  }

  console.log('Starting scheduled sync...');
  syncInProgress = true;

  const result = await runSync();

  syncInProgress = false;
  lastSyncTime = new Date();
  lastSyncStatus = result.success ? 'success' : 'failed';
  lastSyncOutput = result.output;
  saveSyncState();

  console.log(`Scheduled sync completed: ${lastSyncStatus}`);
}

export default router;
