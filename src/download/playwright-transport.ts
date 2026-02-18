/**
 * Playwright-backed download transport for cookie/session-protected assets
 * - Uses browser network stack to inherit cookies/TLS from discovery session
 * - Primary approach: page.route() + route.fetch() for network interception
 * - Streams response body to disk with atomic write (.tmp → rename)
 * - Detects Cloudflare blocks and returns clear diagnostics
 */

import { writeFile, rename, unlink } from 'fs/promises';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { Page } from 'playwright';
import { getLogger } from '../utils/logger.js';
import { isCloudflareBlocked } from '../utils/cloudflare-block.js';

export interface PlaywrightDownloadResult {
  /** Whether download succeeded */
  success: boolean;
  /** HTTP status code */
  status?: number;
  /** Content-Type header */
  contentType?: string;
  /** Error message (if failed) */
  error?: string;
  /** File size in bytes (if successful) */
  sizeBytes?: number;
}

/**
 * Download a single asset using Playwright's browser network stack
 * 
 * Uses page.route() to intercept the request and capture the response body.
 * This approach inherits cookies/session from the browser context.
 * 
 * @param page Playwright page (must be from active browser context)
 * @param url Asset URL to download
 * @param filepath Local filesystem path to write (will write atomically via .tmp)
 * @returns Download result with status, contentType, and error info
 */
export async function downloadWithPlaywright(
  page: Page,
  url: string,
  filepath: string
): Promise<PlaywrightDownloadResult> {
  const logger = getLogger();
  const tmpPath = `${filepath}.tmp`;

  logger.debug(`Playwright transport: downloading ${url}`);

  try {
    let responseData: Buffer | null = null;
    let responseStatus: number | undefined;
    let responseContentType: string | undefined;
    let routeError: string | null = null;

    // Set up route handler to intercept the request
    await page.route(url, async (route) => {
      try {
        // Fetch the resource using the browser's network stack
        const response = await route.fetch();
        responseStatus = response.status();
        responseContentType = response.headers()['content-type'] || '';

        logger.debug(
          `Playwright response: ${responseStatus} (${responseContentType})`
        );

        const body = await response.body();
        
        // Check if response is blocked HTML (for both 403 and 200 with HTML markers)
        const blocked = await isCloudflareBlocked({
          status: responseStatus,
          headers: {
            get: (name: string) => response.headers()[name.toLowerCase()] || null,
          },
          arrayBuffer: async () => body.buffer as ArrayBuffer,
        });

        if (blocked) {
          routeError = `Cloudflare block detected: status=${responseStatus}, content-type=${responseContentType}`;
          await route.abort();
          return;
        }

        if (!response.ok()) {
          routeError = `HTTP ${responseStatus}: ${response.statusText()}`;
          await route.abort();
          return;
        }

        // Capture response body as buffer
        responseData = Buffer.from(body);

        // Fulfill the route (though we're not actually loading it in the page)
        await route.fulfill({
          status: response.status(),
          headers: response.headers(),
          body: body,
        });
      } catch (error) {
        routeError = error instanceof Error ? error.message : String(error);
        await route.abort();
      }
    });

    // Navigate to the URL to trigger the route
    // We use a short timeout since we just need to trigger the network request
    try {
      await page.goto(url, { 
        timeout: 30000, 
        waitUntil: 'domcontentloaded' 
      });
    } catch (error) {
      // Navigation might fail, but the route handler may have captured the data
      logger.debug(`Navigation error (may be expected): ${error}`);
    }

    // Unroute to clean up
    await page.unroute(url);

    // Check if route encountered an error
    if (routeError) {
      return {
        success: false,
        status: responseStatus,
        contentType: responseContentType,
        error: routeError,
      };
    }

    // Check if we captured response data
    if (!responseData) {
      return {
        success: false,
        status: responseStatus,
        contentType: responseContentType,
        error: 'No response data captured',
      };
    }

    const finalData = responseData as Buffer;
    if (finalData.length === 0) {
      return {
        success: false,
        status: responseStatus,
        contentType: responseContentType,
        error: 'No response data captured',
      };
    }

    // Ensure directory exists
    await mkdir(dirname(filepath), { recursive: true });

    // Write atomically: write to .tmp then rename
    await writeFile(tmpPath, finalData);
    await rename(tmpPath, filepath);

    logger.debug(
      `Successfully downloaded via Playwright: ${filepath} (${finalData.length} bytes)`
    );

    return {
      success: true,
      status: responseStatus,
      contentType: responseContentType,
      sizeBytes: finalData.length,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Playwright download failed for ${url}: ${errorMsg}`);

    // Clean up tmp file if it exists
    try {
      await unlink(tmpPath);
    } catch {
      // Ignore cleanup errors
    }

    return {
      success: false,
      error: errorMsg,
    };
  }
}
