/**
 * URL normalization and validation utilities for remote asset downloads
 * Handles protocol-relative URLs, scheme upgrades, and rejects unsupported protocols
 */

export type NormalizeResult =
  | { ok: true; url: string }
  | { ok: false; reason: string; input: string };

/**
 * Normalize and validate a remote asset URL
 *
 * Rules:
 * - Protocol-relative URLs (//host/path) → https://host/path
 * - HTTP URLs → HTTPS (upgrade for security)
 * - HTTPS URLs → unchanged
 * - Query strings preserved exactly
 * - Rejects: data:, blob:, empty, and other non-http(s) schemes
 *
 * @param input - The URL string to normalize
 * @returns Result object with normalized URL or error reason
 */
export function normalizeRemoteUrl(input: string): NormalizeResult {
  // Reject empty input
  if (!input || typeof input !== 'string' || input.trim() === '') {
    return {
      ok: false,
      reason: 'Invalid URL: empty input',
      input,
    };
  }

  const trimmed = input.trim();

  // Handle protocol-relative URLs (//host/path)
  if (trimmed.startsWith('//')) {
    try {
      const url = new URL(`https:${trimmed}`);
      return {
        ok: true,
        url: url.toString(),
      };
    } catch {
      return {
        ok: false,
        reason: `Invalid URL: malformed protocol-relative URL`,
        input,
      };
    }
  }

  // Try to parse as absolute URL
  try {
    const url = new URL(trimmed);

    // Reject unsupported schemes
    if (url.protocol === 'data:') {
      return {
        ok: false,
        reason: 'Unsupported protocol: data:',
        input,
      };
    }

    if (url.protocol === 'blob:') {
      return {
        ok: false,
        reason: 'Unsupported protocol: blob:',
        input,
      };
    }

    // Only allow http and https
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return {
        ok: false,
        reason: `Unsupported protocol: ${url.protocol}`,
        input,
      };
    }

    // Upgrade http to https
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
    }

    return {
      ok: true,
      url: url.toString(),
    };
  } catch {
    return {
      ok: false,
      reason: 'Invalid URL: failed to parse',
      input,
    };
  }
}
