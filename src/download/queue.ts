/**
 * Download queue builder from scraped entities
 * Converts scraped photos and blog assets into a deduplicated download queue
 */

import type { Photo, BlogPost } from '../manifest/types.js';
import { generateMediaFilename } from '../utils/paths.js';
import { createHash } from 'crypto';

export interface QueueItem {
  /** URL to download */
  url: string;
  /** Local path relative to backup root */
  localPath: string;
  /** Stable media ID */
  mediaId: string;
  /** Asset type: 'photo' | 'blog-asset' */
  type: 'photo' | 'blog-asset';
  /** Expected content type (if known) */
  contentType?: string;
  /** Expected size in bytes (if known) */
  expectedSize?: number;
}

export interface QueueStats {
  /** Number of new items */
  new: number;
  /** Number of missing items */
  missing: number;
  /** Number of invalid items */
  invalid: number;
}

export interface QueueResult {
  /** Deduplicated queue items */
  queue: QueueItem[];
  /** Statistics */
  stats: QueueStats;
}

/**
 * Generate a stable media ID from a URL
 * Used as fallback when VSCO-provided ID is not available
 */
function generateIdFromUrl(url: string): string {
  const hash = createHash('sha256').update(url).digest('hex');
  return hash.substring(0, 16);
}

/**
 * Extract embedded asset URLs from blog post HTML content
 * Matches image sources that need to be downloaded
 */
function extractBlogAssetUrls(posts: BlogPost[]): Array<{ url: string; mediaId: string }> {
  const assets: Array<{ url: string; mediaId: string }> = [];
  const seenUrls = new Set<string>();

  for (const post of posts) {
    // Match src="..." in img tags and other embedded assets
    const imgMatches = post.content_html.matchAll(/src="([^"]+)"/g);

    for (const match of imgMatches) {
      const url = match[1];

      // Skip already-localized paths (they were processed in a previous run)
      if (url.startsWith('../.vsco-backup/media/') || url.startsWith('.vsco-backup/media/')) {
        continue;
      }

      // Skip data URIs and relative paths that aren't absolute URLs
      if (url.startsWith('data:') || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        continue;
      }

      // Deduplicate
      if (seenUrls.has(url)) {
        continue;
      }
      seenUrls.add(url);

      // Generate stable ID from URL
      const mediaId = `blog-${generateIdFromUrl(url)}`;
      assets.push({ url, mediaId });
    }
  }

  return assets;
}

/**
 * Build download queue from scraped entities
 * 
 * @param photos - Array of photos to download (new, missing, or invalid)
 * @param blogPosts - Array of blog posts (for extracting embedded assets)
 * @param contentTypeById - Map of media ID to content type
 * @param expectedSizesById - Map of media ID to expected size in bytes
 * @returns Queue result with deduplicated items and statistics
 */
export function buildDownloadQueue(
  photos: {
    new: Photo[];
    missing: Photo[];
    invalid: Photo[];
  },
  blogPosts: BlogPost[],
  contentTypeById: Map<string, string> = new Map(),
  expectedSizesById: Map<string, number> = new Map()
): QueueResult {
  const queue: QueueItem[] = [];
  const seenMediaIds = new Set<string>();

  const stats: QueueStats = {
    new: 0,
    missing: 0,
    invalid: 0,
  };

  // Helper to add item to queue with deduplication
  const addToQueue = (
    url: string,
    mediaId: string,
    type: 'photo' | 'blog-asset',
    category: 'new' | 'missing' | 'invalid',
    contentType?: string,
    expectedSize?: number
  ) => {
    // Deduplicate by media ID
    if (seenMediaIds.has(mediaId)) {
      return;
    }
    seenMediaIds.add(mediaId);

    // Generate local path
    const filename = generateMediaFilename(
      mediaId,
      contentType ?? contentTypeById.get(mediaId) ?? 'image/jpeg'
    );
    const localPath = `.vsco-backup/media/${filename}`;

    // Add to queue
    queue.push({
      url,
      localPath,
      mediaId,
      type,
      contentType: contentType ?? contentTypeById.get(mediaId),
      expectedSize: expectedSize ?? expectedSizesById.get(mediaId),
    });

    // Update stats
    stats[category]++;
  };

  // Process new photos
  for (const photo of photos.new) {
    addToQueue(photo.url_highres, photo.id, 'photo', 'new');
  }

  // Process missing photos
  for (const photo of photos.missing) {
    addToQueue(photo.url_highres, photo.id, 'photo', 'missing');
  }

  // Process invalid photos
  for (const photo of photos.invalid) {
    addToQueue(photo.url_highres, photo.id, 'photo', 'invalid');
  }

  // Extract and process blog embedded assets
  // All blog assets are treated as "new" since they're discovered from current blog content
  const blogAssets = extractBlogAssetUrls(blogPosts);
  for (const asset of blogAssets) {
    addToQueue(asset.url, asset.mediaId, 'blog-asset', 'new');
  }

  return { queue, stats };
}
