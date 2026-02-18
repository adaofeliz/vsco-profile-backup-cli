/**
 * Cloudflare block/challenge response detection
 * Identifies when HTTP responses are blocked by Cloudflare and should trigger fallback
 */

/**
 * Response-like object for type compatibility with both fetch Response and test mocks
 */
export interface ResponseLike {
  status: number;
  statusText?: string;
  headers: {
    get(name: string): string | null;
  };
  body?: ReadableStream<Uint8Array> | null;
  text?(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
}

/**
 * Cloudflare block detection markers (case-insensitive)
 */
const CLOUDFLARE_MARKERS = [
  'Attention Required! | Cloudflare',
  'Sorry, you have been blocked',
  '__cf_bm=',
  'cf-ray',
];

/**
 * Maximum bytes to read from response body for detection (8KB)
 * Prevents memory issues with large responses
 */
const MAX_BODY_BYTES = 8192;

/**
 * Detects if an HTTP response is a Cloudflare block/challenge page
 *
 * Detection rules (conservative - prefer false negatives):
 * 1. Status 403 → blocked (fast path)
 * 2. Status 200 + content-type contains 'text/html' + body contains Cloudflare markers → blocked
 * 3. Otherwise → not blocked
 *
 * @param response Response-like object with status, headers, and optional body
 * @returns true if response is classified as blocked, false otherwise
 */
export async function isCloudflareBlocked(response: ResponseLike): Promise<boolean> {
  // Fast path: 403 is always blocked
  if (response.status === 403) {
    return true;
  }

  // Only check HTML responses for markers
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('text/html')) {
    return false;
  }

  // For HTML responses, check body for Cloudflare markers
  // Only read first N bytes to avoid memory issues
  try {
    let bodyText = '';

    // Try to read body using text() method if available
    if (response.text && typeof response.text === 'function') {
      const fullText = await response.text();
      bodyText = fullText.substring(0, MAX_BODY_BYTES);
    }
    // Fallback: try arrayBuffer if available
    else if (response.arrayBuffer && typeof response.arrayBuffer === 'function') {
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const truncated = bytes.slice(0, MAX_BODY_BYTES);
      bodyText = new TextDecoder().decode(truncated);
    }
    // If no body reading method available, assume not blocked (conservative)
    else {
      return false;
    }

    // Check for Cloudflare markers (case-insensitive)
    const bodyLower = bodyText.toLowerCase();
    for (const marker of CLOUDFLARE_MARKERS) {
      if (bodyLower.includes(marker.toLowerCase())) {
        return true;
      }
    }

    return false;
  } catch (error) {
    // If we can't read the body, assume not blocked (conservative)
    return false;
  }
}
