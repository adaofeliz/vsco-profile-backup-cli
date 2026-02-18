/**
 * Artifact capture utility for debugging Playwright failures
 * Saves screenshot and HTML snapshots on discovery failure
 */

import { Page } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { getLogger } from './logger.js';

export interface CapturedArtifacts {
  screenshotPath: string;
  htmlPath: string;
}

/**
 * Capture screenshot and HTML snapshot on failure
 * Creates <backupRoot>/.vsco-backup/logs/ directory if needed
 * Filenames include phase, runId, and timestamp for identification
 *
 * @param page - Playwright page object
 * @param backupRoot - Root directory for backup
 * @param phase - Phase name (e.g., 'discovery')
 * @param runId - Run identifier for grouping artifacts
 * @returns Paths of captured artifacts, or null if capture failed
 */
export async function captureArtifacts(
  page: Page,
  backupRoot: string,
  phase: string,
  runId: string
): Promise<CapturedArtifacts | null> {
  const logger = getLogger();

  try {
    // Create logs directory
    const logsDir = join(backupRoot, '.vsco-backup', 'logs');
    await mkdir(logsDir, { recursive: true });

    // Generate timestamp for unique filenames
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const baseFilename = `${phase}-${runId}-${timestamp}`;

    // Capture screenshot
    const screenshotPath = join(logsDir, `${baseFilename}.png`);
    await page.screenshot({ path: screenshotPath });

    // Capture HTML
    const htmlPath = join(logsDir, `${baseFilename}.html`);
    const htmlContent = await page.content();
    await writeFile(htmlPath, htmlContent, 'utf-8');

    logger.debug(`Artifacts captured: ${screenshotPath}, ${htmlPath}`);

    return {
      screenshotPath,
      htmlPath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to capture artifacts: ${errorMessage}`);
    return null;
  }
}
