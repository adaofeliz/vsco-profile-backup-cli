/**
 * Utility functions for filesystem, logging, and rate limiting
 */

export function log(message: string): void {
  console.log(`[vsco-backup] ${message}`);
}

export function logError(message: string): void {
  console.error(`[vsco-backup] ERROR: ${message}`);
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
