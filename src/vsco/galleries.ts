/**
 * Gallery scraping and enumeration
 * Discovers galleries and their photo memberships from VSCO profile
 */

import { chromium, Browser, Page } from 'playwright';
import type { Gallery } from '../manifest/types.js';
import { generateSlug } from '../utils/paths.js';
import { createHash } from 'crypto';

/**
 * Raw gallery data extracted from VSCO page
 */
interface RawGalleryData {
  /** Gallery name/title */
  name: string;
  /** Gallery URL (used to derive stable ID) */
  url: string;
  /** Array of photo IDs in this gallery */
  photoIds: string[];
  /** Gallery description (if present) */
  description?: string;
  /** Cover photo URL (if available) */
  coverPhotoUrl?: string;
}

/**
 * Generate stable gallery ID from URL
 * Uses hash of canonical URL for deterministic IDs
 *
 * @param url - Gallery URL
 * @returns Stable gallery ID
 */
function generateGalleryId(url: string): string {
  const hash = createHash('sha256').update(url).digest('hex');
  return `gallery-${hash.substring(0, 16)}`;
}

/**
 * Scrape gallery list and enumerate photo memberships
 *
 * @param username - VSCO username
 * @returns Array of Gallery objects with photo_ids
 */
export async function scrapeGalleries(username: string): Promise<Gallery[]> {
  let browser: Browser | undefined;
  
  try {
    // Launch browser
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Navigate to profile galleries page
    const profileUrl = `https://vsco.co/${username}/gallery`;
    await page.goto(profileUrl, { waitUntil: 'networkidle' });

    // Extract gallery data
    const rawGalleries = await extractGalleryData(page, username);

    // Convert to Gallery entities with stable slugs
    const galleries = convertToGalleries(rawGalleries);

    return galleries;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Extract raw gallery data from VSCO page
 * Handles gallery discovery and photo enumeration
 *
 * @param page - Playwright page
 * @param username - VSCO username
 * @returns Array of raw gallery data
 */
async function extractGalleryData(page: Page, username: string): Promise<RawGalleryData[]> {
  // Wait for galleries to load
  // VSCO uses dynamic rendering, so we need to wait for content
  await page.waitForTimeout(2000);

  // Check if galleries exist
  const hasGalleries = await page.locator('[data-gallery-id], .gallery-item, [href*="/gallery/"]').count() > 0;
  
  if (!hasGalleries) {
    // No galleries found, return empty array
    return [];
  }

  // Extract gallery links and metadata
  const galleries = await page.evaluate(() => {
    const result: RawGalleryData[] = [];
    
    // Try multiple selectors to find gallery elements
    // VSCO structure may vary, so we try common patterns
    const gallerySelectors = [
      '[data-gallery-id]',
      '.gallery-item',
      'a[href*="/gallery/"]',
      '[data-test-id*="gallery"]'
    ];

    const foundGalleries = new Set<string>();

    for (const selector of gallerySelectors) {
      const elements = document.querySelectorAll(selector);
      
      elements.forEach((el) => {
        // Extract gallery URL
        let galleryUrl = '';
        if (el.tagName === 'A') {
          galleryUrl = (el as HTMLAnchorElement).href;
        } else {
          const link = el.querySelector('a[href*="/gallery/"]');
          if (link) {
            galleryUrl = (link as HTMLAnchorElement).href;
          }
        }

        if (!galleryUrl || foundGalleries.has(galleryUrl)) {
          return;
        }
        foundGalleries.add(galleryUrl);

        // Extract gallery name
        let name = '';
        const titleEl = el.querySelector('[data-title], .gallery-title, h2, h3');
        if (titleEl) {
          name = titleEl.textContent?.trim() || '';
        }
        
        // Fallback: extract from URL
        if (!name && galleryUrl) {
          const urlParts = galleryUrl.split('/gallery/');
          if (urlParts[1]) {
            name = urlParts[1].replace(/-/g, ' ');
          }
        }

        if (!name) {
          name = 'Untitled Gallery';
        }

        // Extract description
        let description: string | undefined;
        const descEl = el.querySelector('[data-description], .gallery-description, p');
        if (descEl) {
          description = descEl.textContent?.trim() || undefined;
        }

        // Extract cover photo
        let coverPhotoUrl: string | undefined;
        const imgEl = el.querySelector('img');
        if (imgEl && imgEl.src) {
          coverPhotoUrl = imgEl.src;
        }

        result.push({
          name,
          url: galleryUrl,
          photoIds: [], // Will be populated in next step
          description,
          coverPhotoUrl
        });
      });
    }

    return result;
  });

  // For each gallery, navigate and extract photo IDs
  for (const gallery of galleries) {
    try {
      await page.goto(gallery.url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);

      // Extract photo IDs from gallery page
      const photoIds = await page.evaluate(() => {
        const ids: string[] = [];
        
        // Try multiple selectors for photos
        const photoSelectors = [
          '[data-photo-id]',
          'img[data-id]',
          'a[href*="/media/"]',
          '[data-medusa-id]'
        ];

        for (const selector of photoSelectors) {
          const elements = document.querySelectorAll(selector);
          
          elements.forEach((el) => {
            // Try to extract ID from data attributes
            let photoId = el.getAttribute('data-photo-id') 
              || el.getAttribute('data-id')
              || el.getAttribute('data-medusa-id');
            
            // Fallback: extract from href
            if (!photoId && el.tagName === 'A') {
              const href = (el as HTMLAnchorElement).href;
              const match = href.match(/\/media\/([a-f0-9]+)/);
              if (match) {
                photoId = match[1];
              }
            }

            // Fallback: extract from image src
            if (!photoId && el.tagName === 'IMG') {
              const src = (el as HTMLImageElement).src;
              const match = src.match(/\/([a-f0-9]{24,})\//);
              if (match) {
                photoId = match[1];
              }
            }

            if (photoId && !ids.includes(photoId)) {
              ids.push(photoId);
            }
          });
        }

        return ids;
      });

      gallery.photoIds = photoIds;
    } catch (error) {
      // Failed to load gallery, keep empty photo_ids
      console.warn(`Failed to load gallery: ${gallery.url}`, error);
    }
  }

  return galleries;
}

/**
 * Convert raw gallery data to Gallery entities with stable slugs
 *
 * @param rawGalleries - Raw gallery data
 * @returns Array of Gallery entities
 */
function convertToGalleries(rawGalleries: RawGalleryData[]): Gallery[] {
  const slugMap = new Map<string, string>();
  
  return rawGalleries.map((raw) => {
    const id = generateGalleryId(raw.url);
    generateSlug(raw.name, id, slugMap);

    return {
      id,
      name: raw.name,
      description: raw.description,
      cover_photo_url: raw.coverPhotoUrl,
      photo_ids: raw.photoIds
    };
  });
}
