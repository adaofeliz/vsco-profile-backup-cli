#!/usr/bin/env node
/**
 * Offline verification test using Playwright
 * Opens generated HTML files via file:// protocol and captures screenshots
 */

import { chromium, Browser, Page } from 'playwright';
import { resolve, join } from 'path';
import { mkdir, stat } from 'fs/promises';
import { getIndexPath, getGalleryPath, getBlogPath } from '../utils/paths.js';
import { readManifest } from '../manifest/io.js';
import { getLogger } from '../utils/logger.js';

interface ScreenshotResult {
  page: string;
  path: string;
  success: boolean;
  error?: string;
}

export class OfflineVerification {
  private backupRoot: string;
  private evidenceDir: string;
  private browser: Browser | null = null;
  private logger = getLogger();

  constructor(backupRoot: string, evidenceDir: string = '.sisyphus/evidence') {
    this.backupRoot = resolve(backupRoot);
    this.evidenceDir = resolve(evidenceDir);
  }

  async run(): Promise<ScreenshotResult[]> {
    this.logger.info('Starting offline verification...');
    const results: ScreenshotResult[] = [];

    try {
      // Ensure evidence directory exists
      await mkdir(this.evidenceDir, { recursive: true });

      // Launch browser
      this.browser = await chromium.launch({ headless: true });
      const context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      const page = await context.newPage();

      // Test index page
      await this.verifyPage(page, 'index', getIndexPath(this.backupRoot), results);

      // Test gallery pages
      const manifest = await readManifest(this.backupRoot);
      if (manifest.content.galleries.length > 0) {
        const firstGallery = manifest.content.galleries[0];
        const gallerySlug = this.normalizeSlug(firstGallery.name);
        const galleryPath = getGalleryPath(this.backupRoot, gallerySlug);
        await this.verifyPage(page, 'gallery', galleryPath, results);
      }

      // Test blog post pages
      if (manifest.content.blog_posts.length > 0) {
        const firstPost = manifest.content.blog_posts[0];
        const blogPath = getBlogPath(this.backupRoot, firstPost.slug);
        await this.verifyPage(page, 'blog', blogPath, results);
      }

      await this.browser.close();
      this.browser = null;

      // Summary
      const successCount = results.filter((r) => r.success).length;
      this.logger.info(`Verification complete: ${successCount}/${results.length} pages verified`);

      return results;
    } catch (error) {
      this.logger.error(`Offline verification failed: ${error}`);
      throw error;
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }

  private async verifyPage(
    page: Page,
    pageName: string,
    filePath: string,
    results: ScreenshotResult[]
  ): Promise<void> {
    try {
      // Check if file exists
      try {
        await stat(filePath);
      } catch (error) {
        this.logger.warn(`File not found: ${filePath}`);
        results.push({
          page: pageName,
          path: filePath,
          success: false,
          error: 'File not found',
        });
        return;
      }

      // Convert file path to file:// URL
      const fileUrl = `file://${filePath}`;
      this.logger.info(`Loading ${pageName}: ${fileUrl}`);

      // Navigate to page
      await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 10000 });

      // Wait a moment for any lazy-loaded images
      await page.waitForTimeout(1000);

      // Verify page loaded by checking for body element
      const bodyExists = await page.locator('body').count();
      if (bodyExists === 0) {
        throw new Error('Page body not found - page may not have loaded correctly');
      }

      // Check if images are present and loading
      const imageCount = await page.locator('img').count();
      this.logger.info(`Found ${imageCount} images on ${pageName}`);

      // Verify at least some images have loaded (if any exist)
      if (imageCount > 0) {
        const loadedImages = await page.locator('img[src]').count();
        if (loadedImages === 0) {
          this.logger.warn(`No images have src attributes on ${pageName}`);
        }
      }

      // Take full-page screenshot
      const screenshotPath = join(this.evidenceDir, `offline-${pageName}.png`);
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
      });

      this.logger.info(`Screenshot saved: ${screenshotPath}`);

      results.push({
        page: pageName,
        path: filePath,
        success: true,
      });
    } catch (error) {
      this.logger.error(`Failed to verify ${pageName}: ${error}`);
      
      // Still try to capture screenshot on error
      try {
        const screenshotPath = join(this.evidenceDir, `offline-${pageName}-error.png`);
        await page.screenshot({
          path: screenshotPath,
          fullPage: true,
        });
        this.logger.info(`Error screenshot saved: ${screenshotPath}`);
      } catch (screenshotError) {
        this.logger.warn(`Could not capture error screenshot: ${screenshotError}`);
      }

      results.push({
        page: pageName,
        path: filePath,
        success: false,
        error: String(error),
      });
    }
  }

  /**
   * Simple slug normalization (matches generator logic)
   */
  private normalizeSlug(text: string): string {
    if (!text || typeof text !== 'string') {
      return '';
    }

    return text
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const backupRoot = process.argv[2] || '.';
  const evidenceDir = process.argv[3] || '.sisyphus/evidence';

  const verifier = new OfflineVerification(backupRoot, evidenceDir);
  verifier
    .run()
    .then((results) => {
      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        console.error('\nFailed pages:');
        failed.forEach((r) => {
          console.error(`  - ${r.page}: ${r.error}`);
        });
        process.exit(1);
      }
      console.log('\n✓ All pages verified successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Verification failed:', error);
      process.exit(1);
    });
}
