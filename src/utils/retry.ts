/**
 * Retry wrapper with exponential backoff + jitter
 * - Retries transient failures: timeouts, 5xx errors, 429 (rate limit)
 * - Fails fast on deterministic failures: 404, parse errors
 * - Formula: delay = baseDelay * 2^attempt + random(0, jitterMax)
 * - Conservative defaults: baseDelay=1000ms, maxDelay=30000ms, jitter=0-1000ms
 */

import { getLogger } from './logger.js';

export interface RetryOptions {
  maxAttempts?: number; // default 5
  baseDelayMs?: number; // default 1000
  maxDelayMs?: number; // default 30000
  jitterMaxMs?: number; // default 1000
}

export interface RetryError extends Error {
  isTransient: boolean;
  lastError?: Error;
  attempts: number;
}

/**
 * Determine if an error is transient (should retry) or deterministic (fail fast)
 */
function isTransientError(error: unknown): boolean {
  // Network timeouts
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('timeout') || msg.includes('econnrefused') || msg.includes('econnreset')) {
      return true;
    }
  }

  // HTTP status codes
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as any).status;
    // 5xx errors and 429 (rate limit) are transient
    if ((status >= 500 && status < 600) || status === 429) {
      return true;
    }
    // 404 and other 4xx (except 429) are deterministic
    if (status >= 400 && status < 500) {
      return false;
    }
  }

  // Parse errors are deterministic
  if (error instanceof SyntaxError) {
    return false;
  }

  // Default to transient for unknown errors
  return true;
}

/**
 * Calculate delay with exponential backoff and jitter
 * delay = baseDelay * 2^attempt + random(0, jitterMax)
 */
function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitterMaxMs: number
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  const jitter = Math.random() * jitterMaxMs;
  return cappedDelay + jitter;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper function
 * Executes fn with exponential backoff on transient failures
 * Fails fast on deterministic failures
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 5;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const maxDelayMs = options?.maxDelayMs ?? 30000;
  const jitterMaxMs = options?.jitterMaxMs ?? 1000;

  const logger = getLogger();
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is transient
      if (!isTransientError(error)) {
        logger.debug(
          `Deterministic failure (not retrying): ${lastError.message}`
        );
        const retryError = new Error(
          `Failed after ${attempt + 1} attempt(s): ${lastError.message}`
        ) as RetryError;
        retryError.isTransient = false;
        retryError.lastError = lastError;
        retryError.attempts = attempt + 1;
        throw retryError;
      }

      // If this was the last attempt, give up
      if (attempt === maxAttempts - 1) {
        logger.debug(
          `Max attempts (${maxAttempts}) reached. Giving up: ${lastError.message}`
        );
        const retryError = new Error(
          `Failed after ${maxAttempts} attempts: ${lastError.message}`
        ) as RetryError;
        retryError.isTransient = true;
        retryError.lastError = lastError;
        retryError.attempts = maxAttempts;
        throw retryError;
      }

      // Calculate delay and retry
      const delayMs = calculateDelay(
        attempt,
        baseDelayMs,
        maxDelayMs,
        jitterMaxMs
      );
      logger.debug(
        `Transient failure (attempt ${attempt + 1}/${maxAttempts}): ${lastError.message}. Retrying in ${Math.round(delayMs)}ms...`
      );

      await sleep(delayMs);
    }
  }

  // Should never reach here, but satisfy TypeScript
  throw new Error('Retry loop exited unexpectedly');
}

export { isTransientError };
