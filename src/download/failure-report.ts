/**
 * Failure report writer for download failures
 * Writes JSON report to <backupRoot>/.vsco-backup/logs/download-failures-<runId>.json
 * Includes manual recovery guidance per failure
 */

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { getLogger } from '../utils/logger.js';

export interface FailureAttempt {
  status?: number;
  contentType?: string;
  snippetMarker?: string;
}

export interface FailureEntry {
  mediaId: string;
  originalUrl: string;
  normalizedUrl: string;
  nodeAttempt: FailureAttempt;
  playwrightAttempt: FailureAttempt;
  errorMessage: string;
  timestamp: string;
  manualRecovery: string[];
}

export interface FailureSummary {
  discovered: number;
  attempted: number;
  skippedValid: number;
  succeeded: number;
  failed: number;
  failRate: number;
  failThreshold: number;
  verdict: string;
}

export interface FailureReport {
  runId: string;
  timestamp: string;
  summary: FailureSummary;
  failures: FailureEntry[];
}

/**
 * Write a JSON failure report when downloads fail
 * Creates log directory if needed
 * Handles write errors gracefully (logs but doesn't throw)
 *
 * @param backupRoot - Root directory for backup
 * @param runId - Run identifier
 * @param summary - Summary statistics
 * @param failures - Array of failure entries
 * @returns Promise that resolves when write completes
 */
export async function writeFailureReport(
  backupRoot: string,
  runId: string,
  summary: FailureSummary,
  failures: FailureEntry[]
): Promise<void> {
  const logger = getLogger();

  try {
    // Create logs directory
    const logsDir = join(backupRoot, '.vsco-backup', 'logs');
    await mkdir(logsDir, { recursive: true });

    // Generate report filename
    const reportPath = join(logsDir, `download-failures-${runId}.json`);

    // Build report object
    const report: FailureReport = {
      runId,
      timestamp: new Date().toISOString(),
      summary,
      failures,
    };

    // Write pretty-printed JSON
    const jsonContent = JSON.stringify(report, null, 2);
    await writeFile(reportPath, jsonContent, 'utf-8');

    logger.debug(`Failure report written: ${reportPath}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to write failure report: ${errorMessage}`);
    // Do not throw - allow backup to continue
  }
}

/**
 * Generate manual recovery guidance for a failure entry
 * Provides actionable steps to manually recover the asset
 *
 * @param failure - Failure entry
 * @returns Array of recovery guidance strings
 */
export function generateManualRecovery(failure: FailureEntry): string[] {
  const guidance: string[] = [];

  // Guidance 1: Open URL in browser
  guidance.push(`Open URL in browser: ${failure.originalUrl}`);

  // Guidance 2: Use DevTools Network tab
  guidance.push(
    `Open profile in browser → DevTools Network → filter by mediaId: ${failure.mediaId}`
  );

  return guidance;
}
