/**
 * Manifest IO operations: initialization, loading, atomic saving, and run recording
 */

import { mkdir, readFile, writeFile, rename } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import {
  BackupManifest,
  Profile,
  BackupRun,
  SCHEMA_VERSION,
  isValidBackupManifest,
} from './types.js';

const MANIFEST_DIR = '.vsco-backup';
const MANIFEST_FILENAME = 'manifest.json';

/**
 * Get the full path to the manifest file
 */
export function getManifestPath(backupRoot: string): string {
  return join(backupRoot, MANIFEST_DIR, MANIFEST_FILENAME);
}

/**
 * Ensure backup root directory and .vsco-backup subdirectory exist
 */
export async function ensureBackupRoot(backupRoot: string): Promise<void> {
  const manifestDir = join(backupRoot, MANIFEST_DIR);
  await mkdir(manifestDir, { recursive: true });
}

/**
 * Read manifest from disk without initialization
 * Throws error if manifest is missing or invalid
 */
export async function readManifest(backupRoot: string): Promise<BackupManifest> {
  const manifestPath = getManifestPath(backupRoot);
  const content = await readFile(manifestPath, 'utf-8');
  const parsed = JSON.parse(content);

  if (!isValidBackupManifest(parsed)) {
    throw new Error('Invalid manifest structure');
  }

  return parsed;
}

/**
 * Load manifest from disk, or initialize a new one if missing
 */
export async function loadManifest(
  backupRoot: string,
  username: string,
  profileUrl: string
): Promise<BackupManifest> {
  const manifestPath = getManifestPath(backupRoot);

  try {
    const content = await readFile(manifestPath, 'utf-8');
    const parsed = JSON.parse(content);

    if (!isValidBackupManifest(parsed)) {
      throw new Error('Invalid manifest structure');
    }

    return parsed;
  } catch (error) {
    // File doesn't exist or is invalid - create new manifest
    if (
      error instanceof Error &&
      (error.message.includes('ENOENT') || error.message.includes('Invalid manifest'))
    ) {
      return initializeManifest(username, profileUrl);
    }
    throw error;
  }
}

/**
 * Initialize a new manifest with default values
 */
function initializeManifest(username: string, profileUrl: string): BackupManifest {
  const now = new Date().toISOString();

  const profile: Profile = {
    username,
    profile_url: profileUrl,
    last_backup_ts: now,
    backup_version: SCHEMA_VERSION,
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    profile,
    content: {
      photos: [],
      galleries: [],
      blog_posts: [],
    },
    backup_runs: [],
  };
}

/**
 * Save manifest atomically: write to temp file, then rename
 * Prevents corruption if process is interrupted mid-write
 */
export async function saveManifestAtomic(
  backupRoot: string,
  manifest: BackupManifest
): Promise<void> {
  const manifestPath = getManifestPath(backupRoot);
  const tempPath = `${manifestPath}.tmp`;

  // Ensure directory exists
  await ensureBackupRoot(backupRoot);

  // Write to temporary file
  const jsonContent = JSON.stringify(manifest, null, 2);
  await writeFile(tempPath, jsonContent, 'utf-8');

  // Atomic rename
  await rename(tempPath, manifestPath);
}

/**
 * Generate a unique run ID (timestamp + random suffix)
 */
function generateRunId(): string {
  const timestamp = Date.now();
  const randomSuffix = randomBytes(4).toString('hex');
  return `${timestamp}-${randomSuffix}`;
}

/**
 * Record the start of a backup run
 * Returns the run_id for tracking
 */
export function recordBackupRunStart(manifest: BackupManifest): string {
  const runId = generateRunId();
  const now = new Date().toISOString();

  const run: BackupRun = {
    run_id: runId,
    ts: now,
    new_content_count: 0,
    missing_content_count: 0,
    invalid_content_count: 0,
    downloaded_items: [],
    status: 'success',
  };

  manifest.backup_runs.push(run);
  manifest.profile.last_backup_ts = now;

  return runId;
}

/**
 * Record the completion of a backup run with counts and status
 */
export function recordBackupRunFinish(
  manifest: BackupManifest,
  runId: string,
  counts: {
    new_content_count: number;
    missing_content_count: number;
    invalid_content_count: number;
    downloaded_items: string[];
  },
  status: 'success' | 'partial' | 'failed' = 'success',
  errorMessage?: string
): void {
  const run = manifest.backup_runs.find((r) => r.run_id === runId);

  if (!run) {
    throw new Error(`Run ${runId} not found in manifest`);
  }

  run.new_content_count = counts.new_content_count;
  run.missing_content_count = counts.missing_content_count;
  run.invalid_content_count = counts.invalid_content_count;
  run.downloaded_items = counts.downloaded_items;
  run.status = status;

  if (errorMessage) {
    run.error_message = errorMessage;
  }
}
