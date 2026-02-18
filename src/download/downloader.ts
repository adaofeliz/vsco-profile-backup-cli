/**
 * Binary asset downloader with validation and re-download policy
 * - Downloads media to .vsco-backup/media/
 * - Validates files before/after download
 * - Re-downloads if: file missing, size == 0, or size mismatch
 * - Sequential downloads with conservative rate limiting
 * - Uses retry wrapper for transient failures
 */

import { stat, mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { getLogger } from '../utils/logger.js';
import { retry } from '../utils/retry.js';
import { rateLimit } from '../utils/ratelimit.js';
import { getMediaPath, generateMediaFilename } from '../utils/paths.js';

export interface DownloadTask {
  /** URL to download */
  url: string;
  /** Backup root directory */
  backupRoot: string;
  /** Media ID for filename generation */
  mediaId: string;
  /** Expected Content-Type (e.g., "image/jpeg") */
  contentType?: string;
  /** Expected file size in bytes (if known) */
  expectedSize?: number;
}

export interface DownloadResult {
  /** Download task */
  task: DownloadTask;
  /** Whether download succeeded */
  success: boolean;
  /** Local file path (if successful) */
  localPath?: string;
  /** Error message (if failed) */
  error?: string;
  /** Whether file was actually downloaded (false if already valid) */
  downloaded: boolean;
  /** File size in bytes */
  sizeBytes?: number;
}

export interface DownloadStats {
  total: number;
  successful: number;
  failed: number;
  skipped: number;
  redownloaded: number;
}

/**
 * Validate if a file needs to be downloaded
 * Returns: true if file needs download, false if already valid
 */
async function needsDownload(
  localPath: string,
  expectedSize?: number
): Promise<{ needs: boolean; reason?: string }> {
  try {
    const stats = await stat(localPath);

    // File exists but has size 0 → re-download
    if (stats.size === 0) {
      return { needs: true, reason: 'zero-byte file' };
    }

    // Expected size known and mismatch → re-download
    if (expectedSize !== undefined && expectedSize > 0 && stats.size !== expectedSize) {
      return {
        needs: true,
        reason: `size mismatch (expected ${expectedSize}, got ${stats.size})`,
      };
    }

    // File exists with valid size → skip
    return { needs: false };
  } catch (error) {
    // File missing → download
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { needs: true, reason: 'file missing' };
    }
    // Other errors (permission denied, etc.) → treat as needs download
    return { needs: true, reason: `file check error: ${(error as Error).message}` };
  }
}

/**
 * Download a single file with validation
 * Wrapped with retry for transient failures
 */
async function downloadFile(task: DownloadTask): Promise<DownloadResult> {
  const logger = getLogger();
  const { url, backupRoot, mediaId, contentType = 'image/jpeg', expectedSize } = task;

  // Generate filename and path
  const filename = generateMediaFilename(mediaId, contentType);
  const localPath = getMediaPath(backupRoot, filename);

  // Check if download is needed
  const validation = await needsDownload(localPath, expectedSize);
  if (!validation.needs) {
    logger.debug(`Skipping download (already valid): ${filename}`);
    return {
      task,
      success: true,
      localPath,
      downloaded: false,
      sizeBytes: (await stat(localPath)).size,
    };
  }

  logger.debug(
    `Downloading ${filename} from ${url} (reason: ${validation.reason})`
  );

  try {
    // Download with retry wrapper
    const fileBuffer = await retry(async () => {
      const response = await fetch(url);

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as any;
        error.status = response.status;
        throw error;
      }

      // Validate Content-Length if provided
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const actualSize = parseInt(contentLength, 10);
        if (expectedSize && expectedSize > 0 && actualSize !== expectedSize) {
          logger.warn(
            `Content-Length mismatch for ${filename}: expected ${expectedSize}, got ${actualSize}`
          );
        }
      }

      // Read response as buffer
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    });

    // Validate downloaded size
    if (fileBuffer.length === 0) {
      throw new Error('Downloaded file is empty (0 bytes)');
    }

    // Ensure directory exists
    await mkdir(dirname(localPath), { recursive: true });

    // Write file to disk
    await writeFile(localPath, fileBuffer);

    logger.debug(
      `Successfully downloaded ${filename} (${fileBuffer.length} bytes)`
    );

    return {
      task,
      success: true,
      localPath,
      downloaded: true,
      sizeBytes: fileBuffer.length,
    };
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : String(error);
    logger.error(`Failed to download ${filename}: ${errorMsg}`);

    return {
      task,
      success: false,
      error: errorMsg,
      downloaded: false,
    };
  }
}

/**
 * Download multiple assets sequentially with rate limiting
 * Returns download results and statistics
 */
export async function downloadAssets(
  tasks: DownloadTask[]
): Promise<{ results: DownloadResult[]; stats: DownloadStats }> {
  const logger = getLogger();
  const results: DownloadResult[] = [];
  const stats: DownloadStats = {
    total: tasks.length,
    successful: 0,
    failed: 0,
    skipped: 0,
    redownloaded: 0,
  };

  logger.info(`Starting download of ${tasks.length} assets`);

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];

    // Download with rate limiting (except for first request)
    const result =
      i === 0
        ? await downloadFile(task)
        : await rateLimit(() => downloadFile(task));

    results.push(result);

    if (result.success) {
      stats.successful++;
      if (result.downloaded) {
        stats.redownloaded++;
      } else {
        stats.skipped++;
      }
    } else {
      stats.failed++;
    }

    logger.progress({
      phase: 'Download',
      current: i + 1,
      total: tasks.length,
    });
  }

  logger.phaseComplete(
    'Download',
    `${stats.successful}/${stats.total} successful (${stats.redownloaded} downloaded, ${stats.skipped} skipped, ${stats.failed} failed)`
  );

  return { results, stats };
}

/**
 * Download a single asset (convenience wrapper)
 */
export async function downloadAsset(task: DownloadTask): Promise<DownloadResult> {
  const { results } = await downloadAssets([task]);
  return results[0];
}
