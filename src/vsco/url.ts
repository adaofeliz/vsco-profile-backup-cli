/**
 * VSCO-specific URL normalization helpers
 * Wraps core normalizeRemoteUrl() utility with VSCO-specific validation
 */

import { normalizeRemoteUrl, NormalizeResult } from '../utils/url.js';

/**
 * Normalize a VSCO asset URL for download
 * 
 * This is a VSCO-specific wrapper around normalizeRemoteUrl that:
 * - Handles protocol-relative URLs (//im.vsco.co/...)
 * - Preserves query strings (?w=480&c=1)
 * - Upgrades http to https
 * - Rejects unsupported protocols
 * 
 * @param input - The URL string from VSCO DOM or API JSON
 * @returns Result object with normalized URL or error reason
 */
export function normalizeVscoAssetUrl(input: string): NormalizeResult {
  return normalizeRemoteUrl(input);
}
