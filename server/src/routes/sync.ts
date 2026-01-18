import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const router = Router();

// =============================================================================
// OAuth Configuration (from LDS Member Tools mobile app)
// =============================================================================

const OAUTH_CONFIG = {
  authorizeUrl: 'https://id.churchofjesuschrist.org/oauth2/default/v1/authorize',
  tokenUrl: 'https://id.churchofjesuschrist.org/oauth2/default/v1/token',
  clientId: '0oa18r3e96fyH2lUI358',
  redirectUri: 'membertoolsauth://login',
  scopes: 'openid profile offline_access cmisid no_links',
};

// Store pending auth flows (code_verifier keyed by state)
const pendingAuthFlows: Map<string, { codeVerifier: string; createdAt: Date }> = new Map();

// Clean up old pending flows every 10 minutes
setInterval(() => {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  for (const [state, flow] of pendingAuthFlows.entries()) {
    if (flow.createdAt < tenMinutesAgo) {
      pendingAuthFlows.delete(state);
    }
  }
}, 10 * 60 * 1000);

// =============================================================================
// PKCE Helpers
// =============================================================================

function generatePKCEPair(): { codeVerifier: string; codeChallenge: string } {
  // Generate a random code verifier (43-128 characters)
  const codeVerifier = crypto.randomBytes(32).toString('base64url');

  // Create code challenge using S256 method
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return { codeVerifier, codeChallenge };
}

function buildAuthorizeUrl(codeChallenge: string, state: string): string {
  const params = new URLSearchParams({
    client_id: OAUTH_CONFIG.clientId,
    redirect_uri: OAUTH_CONFIG.redirectUri,
    response_type: 'code',
    scope: OAUTH_CONFIG.scopes,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: state,
    nonce: crypto.randomBytes(16).toString('base64url'),
  });

  return `${OAUTH_CONFIG.authorizeUrl}?${params.toString()}`;
}

async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<any> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: OAUTH_CONFIG.clientId,
    redirect_uri: OAUTH_CONFIG.redirectUri,
    code: code,
    code_verifier: codeVerifier,
  });

  const response = await fetch(OAUTH_CONFIG.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${text}`);
  }

  return response.json();
}

// Track sync state
let syncInProgress = false;
let lastSyncTime: Date | null = null;
let lastSyncStatus: 'success' | 'failed' | null = null;
let lastSyncOutput: string = '';

// Path to sync script and tokens
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SCRIPTS_DIR = path.join(REPO_ROOT, 'scripts');
const SYNC_SCRIPT = path.join(SCRIPTS_DIR, 'sync_from_membertools.py');
const TOKENS_FILE = path.join(REPO_ROOT, '.oauth_tokens.json');
const VENV_PYTHON = path.join(REPO_ROOT, '.venv', 'bin', 'python3');
const PYTHON_CMD = process.env.PYTHON_CMD || (require('fs').existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3');

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

    console.log(`Using Python: ${PYTHON_CMD}`);
    const pythonProcess = spawn(PYTHON_CMD, [SYNC_SCRIPT], {
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

// =============================================================================
// OAuth Setup Endpoints
// =============================================================================

/**
 * POST /api/sync/auth/start
 * Start OAuth flow - generates PKCE pair and returns authorize URL
 */
router.post('/auth/start', (_req, res) => {
  const { codeVerifier, codeChallenge } = generatePKCEPair();
  const state = crypto.randomBytes(16).toString('base64url');

  // Store the code verifier for later use
  pendingAuthFlows.set(state, { codeVerifier, createdAt: new Date() });

  const authorizeUrl = buildAuthorizeUrl(codeChallenge, state);

  res.json({
    success: true,
    authorizeUrl,
    state,
  });
});

/**
 * POST /api/sync/auth/complete
 * Complete OAuth flow - exchange authorization code for tokens
 */
router.post('/auth/complete', async (req, res) => {
  const { redirectUrl } = req.body;

  if (!redirectUrl) {
    return res.status(400).json({
      success: false,
      message: 'Missing redirectUrl parameter',
    });
  }

  // Parse the redirect URL to extract code and state
  let code: string;
  let state: string;

  try {
    const url = new URL(redirectUrl);
    code = url.searchParams.get('code') || '';
    state = url.searchParams.get('state') || '';

    if (!code) {
      throw new Error('No code parameter found in URL');
    }
    if (!state) {
      throw new Error('No state parameter found in URL');
    }
  } catch (e: any) {
    return res.status(400).json({
      success: false,
      message: `Invalid redirect URL: ${e.message}`,
    });
  }

  // Look up the code verifier
  const pendingFlow = pendingAuthFlows.get(state);
  if (!pendingFlow) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or expired state. Please start the authentication process again.',
    });
  }

  // Clean up the pending flow
  pendingAuthFlows.delete(state);

  // Exchange the code for tokens
  try {
    const tokens = await exchangeCodeForTokens(code, pendingFlow.codeVerifier);

    // Save tokens to file
    const tokenData = {
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      updated_at: new Date().toISOString(),
    };

    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokenData, null, 2));
    fs.chmodSync(TOKENS_FILE, 0o600);

    res.json({
      success: true,
      message: 'Authentication successful! Tokens have been saved.',
    });
  } catch (e: any) {
    console.error('Token exchange failed:', e);
    return res.status(500).json({
      success: false,
      message: `Token exchange failed: ${e.message}`,
    });
  }
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
