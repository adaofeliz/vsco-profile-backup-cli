/**
 * Standardized error taxonomy with stable exit codes
 * Each error class extends Error and provides:
 * - code: stable exit code (1-5)
 * - message: user-friendly, actionable message
 * - details: optional verbose details
 */

import { getLogger } from './logger';

/**
 * Base error class with exit code
 */
export abstract class VSCOBackupError extends Error {
  abstract readonly code: number;
  readonly details?: string;

  constructor(message: string, details?: string) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    Object.setPrototypeOf(this, VSCOBackupError.prototype);
  }

  /**
   * Get the exit code for this error
   */
  getExitCode(): number {
    return this.code;
  }

  /**
   * Log error with appropriate level
   */
  log(): void {
    const logger = getLogger();
    logger.error(this.message);
    if (this.details) {
      logger.debug(`Details: ${this.details}`);
    }
  }
}

/**
 * Invalid input error (exit code 1)
 * Triggered by: malformed URL, invalid arguments, missing required options
 */
export class InvalidInputError extends VSCOBackupError {
  readonly code = 1;

  constructor(message: string, details?: string) {
    super(message, details);
    Object.setPrototypeOf(this, InvalidInputError.prototype);
  }

  static fromInvalidUrl(url: string): InvalidInputError {
    return new InvalidInputError(
      `Invalid VSCO profile URL: "${url}". Expected format: https://vsco.co/<username>`,
      `URL must be a valid VSCO profile URL. Example: https://vsco.co/myprofile`
    );
  }

  static fromMissingUrl(): InvalidInputError {
    return new InvalidInputError(
      'Profile URL is required. Usage: vsco-backup <url> [--out-root <dir>] [--verbose]',
      'Provide a VSCO profile URL as the first argument'
    );
  }

  static fromInvalidOutRoot(path: string): InvalidInputError {
    return new InvalidInputError(
      `Invalid output root path: "${path}". Path must be writable.`,
      `Ensure the directory exists and you have write permissions`
    );
  }
}

/**
 * Robots.txt disallowed error (exit code 2)
 * Triggered by: robots.txt policy violation
 */
export class RobotsDisallowedError extends VSCOBackupError {
  readonly code = 2;

  constructor(message: string, details?: string) {
    super(message, details);
    Object.setPrototypeOf(this, RobotsDisallowedError.prototype);
  }

  static fromRobotsPolicy(username: string): RobotsDisallowedError {
    return new RobotsDisallowedError(
      `Profile "${username}" is disallowed by robots.txt policy. Backup cannot proceed.`,
      `To override this check, use the --ignore-robots flag (use with caution and respect the site's policies)`
    );
  }

  static fromRobotsFetchFailure(): RobotsDisallowedError {
    return new RobotsDisallowedError(
      'Failed to fetch robots.txt. Proceeding with conservative rate limiting.',
      'Network error while fetching robots.txt; will use default throttling'
    );
  }
}

/**
 * Profile not found error (exit code 3)
 * Triggered by: private profile, suspended account, non-existent profile
 */
export class ProfileNotFoundError extends VSCOBackupError {
  readonly code = 3;

  constructor(message: string, details?: string) {
    super(message, details);
    Object.setPrototypeOf(this, ProfileNotFoundError.prototype);
  }

  static fromNotFound(username: string): ProfileNotFoundError {
    return new ProfileNotFoundError(
      `Profile "${username}" not found or is private. Cannot proceed with backup.`,
      `Verify the username is correct and the profile is public`
    );
  }

  static fromPrivate(username: string): ProfileNotFoundError {
    return new ProfileNotFoundError(
      `Profile "${username}" is private. Backup requires a public profile.`,
      `Only public VSCO profiles can be backed up`
    );
  }

  static fromSuspended(username: string): ProfileNotFoundError {
    return new ProfileNotFoundError(
      `Profile "${username}" appears to be suspended or deleted.`,
      `Check the profile URL and try again later`
    );
  }
}

/**
 * Scrape error (exit code 4)
 * Triggered by: parse failures, unexpected DOM structure, network errors during scraping
 */
export class ScrapeError extends VSCOBackupError {
  readonly code = 4;

  constructor(message: string, details?: string) {
    super(message, details);
    Object.setPrototypeOf(this, ScrapeError.prototype);
  }

  static fromParseFailure(phase: string, reason: string): ScrapeError {
    return new ScrapeError(
      `Failed to parse ${phase} data. The profile structure may have changed.`,
      `Parse error: ${reason}. Try running again or check for VSCO updates`
    );
  }

  static fromNetworkFailure(phase: string): ScrapeError {
    return new ScrapeError(
      `Network error while scraping ${phase}. Connection lost or timeout.`,
      `Check your internet connection and try again`
    );
  }

  static fromTimeout(phase: string): ScrapeError {
    return new ScrapeError(
      `Scraping ${phase} timed out. The profile may be slow to load.`,
      `Try again with --verbose to see detailed progress`
    );
  }

  static fromUnexpectedStructure(phase: string): ScrapeError {
    return new ScrapeError(
      `Unexpected page structure while scraping ${phase}. VSCO may have changed their layout.`,
      `This is a temporary issue. Try again later or report if it persists`
    );
  }
}

/**
 * Download error (exit code 5)
 * Triggered by: failed downloads, validation failures, disk space issues
 */
export class DownloadError extends VSCOBackupError {
  readonly code = 5;

  constructor(message: string, details?: string) {
    super(message, details);
    Object.setPrototypeOf(this, DownloadError.prototype);
  }

  static fromNetworkFailure(url: string, attempts: number): DownloadError {
    return new DownloadError(
      `Failed to download asset after ${attempts} attempts: ${url}`,
      `Network error or server unavailable. Check your connection and try again`
    );
  }

  static fromValidationFailure(filename: string, reason: string): DownloadError {
    return new DownloadError(
      `Downloaded file failed validation: ${filename}`,
      `Validation error: ${reason}. File may be corrupted; will retry on next run`
    );
  }

  static fromDiskSpace(path: string): DownloadError {
    return new DownloadError(
      `Insufficient disk space to save: ${path}`,
      `Free up disk space and try again`
    );
  }

  static fromPermissionDenied(path: string): DownloadError {
    return new DownloadError(
      `Permission denied writing to: ${path}`,
      `Check directory permissions and ensure the path is writable`
    );
  }

  static fromPartialDownload(completed: number, total: number): DownloadError {
    return new DownloadError(
      `Download incomplete: ${completed}/${total} assets downloaded successfully.`,
      `Run the command again to resume and download remaining assets`
    );
  }
}

/**
 * Map error to exit code
 */
export function getExitCode(error: unknown): number {
  if (error instanceof VSCOBackupError) {
    return error.getExitCode();
  }
  // Default to 1 for unknown errors
  return 1;
}

/**
 * Handle and log error, then exit
 */
export function handleError(error: unknown): never {
  if (error instanceof VSCOBackupError) {
    error.log();
    process.exit(error.getExitCode());
  }

  // Fallback for non-VSCO errors
  const logger = getLogger();
  if (error instanceof Error) {
    logger.error(`Unexpected error: ${error.message}`);
    if (error.stack) {
      logger.debug(`Stack: ${error.stack}`);
    }
  } else {
    logger.error(`Unexpected error: ${String(error)}`);
  }
  process.exit(1);
}
