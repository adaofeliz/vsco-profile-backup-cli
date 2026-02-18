/**
 * Utility functions for filesystem, logging, and rate limiting
 */

export { getLogger, resetLogger, Logger } from './logger.js';
export type { LoggerConfig, ProgressStats, SummaryStats } from './logger.js';

export { retry, isTransientError } from './retry.js';
export type { RetryOptions, RetryError } from './retry.js';

export { rateLimit, createRateLimitedFn } from './ratelimit.js';
export type { RateLimitOptions } from './ratelimit.js';

export {
  OUTPUT_LAYOUT,
  getManifestPath,
  getMediaDir,
  getMediaPath,
  getAssetsDir,
  getGalleriesDir,
  getGalleryPath,
  getBlogDir,
  getBlogPath,
  getIndexPath,
  normalizeSlug,
  generateSlug,
  generateMediaFilename,
  isValidFilename,
  isValidSlug,
} from './paths.js';

export { fetchRobotsTxt, isCrawlAllowed, checkRobotsPolicy } from './robots.js';
export type { RobotsCheckResult } from './robots.js';

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
