/**
 * VSCO blog post scraping and extraction
 * Enumerates posts and extracts normalized content for offline rendering
 */

import type { Page } from 'playwright';
import type { BlogPost } from '../manifest/types.js';
import { generateSlug } from '../utils/paths.js';
import { createHash } from 'crypto';

/**
 * Scrape all blog posts from a VSCO profile
 * @param page - Playwright page instance (already navigated to profile)
 * @param username - VSCO username
 * @returns Array of normalized blog posts
 */
export async function scrapeBlogPosts(page: Page, username: string): Promise<BlogPost[]> {
  // Navigate to the user's blog/journal page
  // VSCO typically uses /username/journal or similar
  const blogUrl = `https://vsco.co/${username}/journal`;
  
  try {
    await page.goto(blogUrl, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (error) {
    // If journal page doesn't exist or times out, return empty array
    console.warn(`No blog/journal found for user ${username}`);
    return [];
  }

  // Wait for journal entries to load
  // Adjust selectors based on actual VSCO DOM structure
  await page.waitForSelector('article, .journal-entry, [data-journal-entry]', { 
    timeout: 10000 
  }).catch(() => {
    // No journal entries found
    return null;
  });

  // Extract all blog post entries
  const blogPostData = await page.evaluate(() => {
    // Find all blog post/journal entry elements
    // This is a heuristic - adjust based on actual VSCO structure
    const entries = Array.from(document.querySelectorAll('article, .journal-entry, [data-journal-entry]'));
    
    if (entries.length === 0) {
      // Try alternative structure - look for links to journal posts
      const links = Array.from(document.querySelectorAll('a[href*="/journal/"]'));
      return links.map((link) => {
        const url = (link as HTMLAnchorElement).href;
        const match = url.match(/\/journal\/([^/]+)/);
        return {
          url: url,
          id: match ? match[1] : '',
        };
      });
    }

    return entries.map((entry) => {
      // Extract post URL/ID
      let postUrl = '';
      let postId = '';
      
      // Look for link to full post
      const link = entry.querySelector('a[href*="/journal/"]') as HTMLAnchorElement;
      if (link) {
        postUrl = link.href;
        const match = postUrl.match(/\/journal\/([^/]+)/);
        postId = match ? match[1] : '';
      }

      // Extract title
      let title = '';
      const titleEl = entry.querySelector('h1, h2, h3, .title, [class*="title"]');
      if (titleEl) {
        title = titleEl.textContent?.trim() || '';
      }

      // Extract date if visible
      let dateStr = '';
      const dateEl = entry.querySelector('time, .date, [datetime]');
      if (dateEl) {
        const datetime = dateEl.getAttribute('datetime');
        if (datetime) {
          dateStr = datetime;
        } else {
          dateStr = dateEl.textContent?.trim() || '';
        }
      }

      return {
        url: postUrl,
        id: postId,
        title,
        dateStr,
      };
    });
  });

  // Now visit each blog post to extract full content
  const blogPosts: BlogPost[] = [];
  const slugMap = new Map<string, string>();

  for (const postData of blogPostData) {
    if (!postData.url || !postData.id) {
      continue; // Skip invalid entries
    }

    try {
      // Navigate to the full post
      await page.goto(postData.url, { waitUntil: 'networkidle', timeout: 30000 });

      // Wait for post content to load
      await page.waitForSelector('article, .journal-post, [role="article"]', { 
        timeout: 10000 
      }).catch(() => null);

      // Extract full post data
      const postContent = await page.evaluate(() => {
        // Find the main post content container
        const article = document.querySelector('article, .journal-post, [role="article"]');
        if (!article) {
          return null;
        }

        // Extract title
        let title = '';
        const titleEl = article.querySelector('h1, h2, [class*="title"]');
        if (titleEl) {
          title = titleEl.textContent?.trim() || '';
        }

        // Extract publication date
        let publishedAt = '';
        const timeEl = article.querySelector('time[datetime]');
        if (timeEl) {
          publishedAt = timeEl.getAttribute('datetime') || '';
        } else {
          // Fallback: look for date text
          const dateEl = article.querySelector('.date, [class*="date"]');
          if (dateEl) {
            publishedAt = dateEl.textContent?.trim() || '';
          }
        }

        // Extract content HTML
        // Remove scripts, normalize structure
        const contentEl = article.querySelector('.content, [class*="content"], .body, [class*="body"]') || article;
        const clonedContent = contentEl.cloneNode(true) as HTMLElement;

        // Remove script tags
        clonedContent.querySelectorAll('script, noscript').forEach(el => el.remove());

        // Remove external stylesheets and links
        clonedContent.querySelectorAll('link[rel="stylesheet"]').forEach(el => el.remove());

        // Remove inline event handlers
        clonedContent.querySelectorAll('*').forEach(el => {
          const attrs = Array.from(el.attributes);
          attrs.forEach(attr => {
            if (attr.name.startsWith('on')) {
              el.removeAttribute(attr.name);
            }
          });
        });

        // Extract image URLs for normalization
        const images = Array.from(clonedContent.querySelectorAll('img'));
        const imageUrls = images.map(img => img.src);

        return {
          title,
          publishedAt,
          contentHtml: clonedContent.innerHTML,
          imageUrls,
        };
      });

      if (!postContent) {
        console.warn(`Could not extract content for post: ${postData.url}`);
        continue;
      }

      // Normalize content HTML
      const normalizedContent = normalizeContentHtml(
        postContent.contentHtml,
        postContent.imageUrls,
        postData.id
      );

      // Normalize published_at to ISO 8601
      const publishedAt = normalizeDate(postContent.publishedAt || postData.dateStr);

      // Generate collision-proof slug
      const title = postContent.title || postData.title || `Post ${postData.id}`;
      const slug = generateSlug(title, postData.id, slugMap);

      // Create stable ID (use VSCO ID or hash of URL)
      const stableId = postData.id || generateIdFromUrl(postData.url);

      blogPosts.push({
        id: stableId,
        slug,
        title,
        content_html: normalizedContent,
        published_at: publishedAt,
      });

    } catch (error) {
      console.warn(`Failed to scrape post ${postData.url}:`, error);
      continue;
    }
  }

  return blogPosts;
}

/**
 * Normalize HTML content for offline rendering
 * - Strip remote scripts
 * - Convert embedded image URLs to local paths
 * - Mark images for download
 *
 * @param html - Raw HTML content
 * @param imageUrls - Array of image URLs found in content
 * @param postId - Post ID for generating local paths
 * @returns Normalized HTML
 */
function normalizeContentHtml(html: string, imageUrls: string[], postId: string): string {
  let normalized = html;

  // Convert each image URL to local path
  imageUrls.forEach((remoteUrl, index) => {
    if (!remoteUrl) return;

    // Generate deterministic local path
    // Use hash of URL for stable filename
    const urlHash = createHash('sha256').update(remoteUrl).digest('hex').substring(0, 12);
    const ext = getExtensionFromUrl(remoteUrl);
    const localPath = `../.vsco-backup/media/blog-${postId}-img-${urlHash}${ext}`;

    // Replace all occurrences of this URL
    normalized = normalized.split(remoteUrl).join(localPath);
  });

  // Additional cleanup: remove any remaining script references
  normalized = normalized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove inline event handlers from string (backup to browser-side removal)
  normalized = normalized.replace(/\s+on\w+="[^"]*"/gi, '');
  normalized = normalized.replace(/\s+on\w+='[^']*'/gi, '');

  // Remove javascript: URLs
  normalized = normalized.replace(/href="javascript:[^"]*"/gi, 'href="#"');
  normalized = normalized.replace(/src="javascript:[^"]*"/gi, '');

  return normalized;
}

/**
 * Extract file extension from URL
 * @param url - Image URL
 * @returns Extension with dot (e.g., ".jpg") or empty string
 */
function getExtensionFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const match = pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i);
    return match ? `.${match[1].toLowerCase()}` : '.jpg'; // Default to .jpg
  } catch {
    return '.jpg';
  }
}

/**
 * Normalize date string to ISO 8601 format
 * @param dateStr - Date string (various formats)
 * @returns ISO 8601 date string
 */
function normalizeDate(dateStr: string): string {
  if (!dateStr) {
    return new Date().toISOString();
  }

  // If already ISO 8601, return as-is
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateStr)) {
    return dateStr;
  }

  // Try to parse and convert
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  } catch {
    // Fallback: use current date
  }

  return new Date().toISOString();
}

/**
 * Generate stable ID from URL hash
 * @param url - Post URL
 * @returns Stable ID
 */
function generateIdFromUrl(url: string): string {
  const hash = createHash('sha256').update(url).digest('hex');
  return hash.substring(0, 16);
}

/**
 * Extract embedded asset URLs from blog posts for download queue
 * @param posts - Array of blog posts
 * @returns Map of asset URL to local path
 */
export function extractAssetUrls(posts: BlogPost[]): Map<string, string> {
  const assetMap = new Map<string, string>();

  for (const post of posts) {
    // Parse content_html to find local paths and reverse-engineer original URLs
    // This is a heuristic - in practice, we'd track during normalization
    const imgMatches = post.content_html.matchAll(/src="([^"]+)"/g);
    
    for (const match of imgMatches) {
      const localPath = match[1];
      // If it's a local path, we already normalized it
      if (localPath.startsWith('../.vsco-backup/media/')) {
        // Extract the hash from the path to lookup original URL
        // In real implementation, we'd maintain a mapping during normalization
        // For now, store the local path
        assetMap.set(localPath, localPath);
      }
    }
  }

  return assetMap;
}
