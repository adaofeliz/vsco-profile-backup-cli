/**
 * Logger utility with verbose mode support
 * - info(): always prints (concise mode)
 * - debug(): only prints with --verbose
 * - progress(): phase progress indicator
 * - summary(): final summary statistics
 */

export interface LoggerConfig {
  verbose?: boolean;
}

export interface ProgressStats {
  phase: string;
  current: number;
  total: number;
}

export interface SummaryStats {
  discovered?: {
    photos?: number;
    galleries?: number;
    blog?: number;
  };
  queue?: {
    size: number;
    completed: number;
    failed: number;
  };
  summary?: {
    new: number;
    missing: number;
    invalid: number;
    redownloaded: number;
  };
}

class Logger {
  private verbose: boolean = false;

  constructor(config?: LoggerConfig) {
    this.verbose = config?.verbose ?? false;
  }

  /**
   * Set verbose mode
   */
  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  /**
   * Always prints - used for concise summary lines
   */
  info(message: string): void {
    console.log(`[vsco-backup] ${message}`);
  }

  /**
   * Only prints in verbose mode - used for detailed steps, backoff/retry notes
   */
  debug(message: string): void {
    if (this.verbose) {
      console.log(`[vsco-backup] DEBUG: ${message}`);
    }
  }

  /**
   * Progress indicator for a phase
   * Prints concise summary in default mode, detailed in verbose
   */
  progress(stats: ProgressStats): void {
    const { phase, current, total } = stats;
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

    if (this.verbose) {
      console.log(
        `[vsco-backup] PROGRESS: ${phase} - ${current}/${total} (${percentage}%)`
      );
    } else {
      // In concise mode, only log at milestones (0%, 50%, 100%)
      if (current === 0 || current === total || percentage === 50) {
        console.log(
          `[vsco-backup] ${phase}: ${current}/${total} (${percentage}%)`
        );
      }
    }
  }

  /**
   * Print final summary statistics
   */
  summary(stats: SummaryStats): void {
    const lines: string[] = [];

    if (stats.discovered) {
      const { photos = 0, galleries = 0, blog = 0 } = stats.discovered;
      lines.push(
        `Discovered: ${photos} photos, ${galleries} galleries, ${blog} blog posts`
      );
    }

    if (stats.queue) {
      const { size, completed, failed } = stats.queue;
      lines.push(
        `Queue: ${size} items (${completed} completed, ${failed} failed)`
      );
    }

    if (stats.summary) {
      const { new: newCount, missing, invalid, redownloaded } = stats.summary;
      lines.push(
        `Summary: ${newCount} new, ${missing} missing, ${invalid} invalid, ${redownloaded} redownloaded`
      );
    }

    if (lines.length > 0) {
      lines.forEach((line) => this.info(line));
    }
  }

  /**
   * Print a phase completion message
   */
  phaseComplete(phaseName: string, details?: string): void {
    const msg = details
      ? `${phaseName} complete: ${details}`
      : `${phaseName} complete`;
    this.info(msg);
  }

  /**
   * Print a phase start message (verbose only)
   */
  phaseStart(phaseName: string): void {
    this.debug(`Starting phase: ${phaseName}`);
  }

  /**
   * Print a warning message
   */
  warn(message: string): void {
    console.warn(`[vsco-backup] WARNING: ${message}`);
  }

  /**
   * Print an error message
   */
  error(message: string): void {
    console.error(`[vsco-backup] ERROR: ${message}`);
  }
}

// Singleton instance
let loggerInstance: Logger | null = null;

/**
 * Get or create the logger singleton
 */
export function getLogger(config?: LoggerConfig): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger(config);
  }
  return loggerInstance;
}

/**
 * Reset logger (useful for testing)
 */
export function resetLogger(): void {
  loggerInstance = null;
}

export { Logger };
