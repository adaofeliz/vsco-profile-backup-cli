/**
 * Rate limiting wrapper with fixed/random delay between actions
 * - Enforces minimum delay between consecutive calls
 * - Conservative defaults: 500-1500ms random delay between requests
 * - Respects rate limiting etiquette for web scraping
 */

import { getLogger } from './logger.js';

export interface RateLimitOptions {
  minDelayMs?: number; // default 500
  maxDelayMs?: number; // default 1500
}

/**
 * Calculate random delay between minDelayMs and maxDelayMs
 */
function calculateRandomDelay(minDelayMs: number, maxDelayMs: number): number {
  return minDelayMs + Math.random() * (maxDelayMs - minDelayMs);
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rate limit wrapper function
 * Enforces minimum delay between consecutive calls to fn
 */
export async function rateLimit<T>(
  fn: () => Promise<T>,
  options?: RateLimitOptions
): Promise<T> {
  const minDelayMs = options?.minDelayMs ?? 500;
  const maxDelayMs = options?.maxDelayMs ?? 1500;

  const logger = getLogger();
  const delayMs = calculateRandomDelay(minDelayMs, maxDelayMs);

  logger.debug(
    `Rate limiting: waiting ${Math.round(delayMs)}ms before next request`
  );

  await sleep(delayMs);
  return fn();
}

/**
 * Create a rate-limited version of a function
 * Each call to the returned function will be rate-limited
 */
export function createRateLimitedFn<T>(
  fn: () => Promise<T>,
  options?: RateLimitOptions
): () => Promise<T> {
  return () => rateLimit(fn, options);
}
