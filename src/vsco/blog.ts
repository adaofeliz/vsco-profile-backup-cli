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
  const blogUrl = `https://vsco.co/${username}/journal`;
  
  try {
    await page.goto(blogUrl, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (error) {
    console.warn(`No blog/journal found for user ${username}`);
    return [];
  }

  await page.waitForSelector('article, .journal-entry, [data-journal-entry]', { 
    timeout: 10000 
  }).catch(() => null);

  const blogPostData = await page.evaluate(() => {
    const entries = Array.from(document.querySelectorAll('article, .journal-entry, [data-journal-entry]'));
    
    if (entries.length === 0) {
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
      let postUrl = '';
      let postId = '';
      
      const link = entry.querySelector('a[href*="/journal/"]') as HTMLAnchorElement;
      if (link) {
        postUrl = link.href;
        const match = postUrl.match(/\/journal\/([^/]+)/);
        postId = match ? match[1] : '';
      }

      let title = '';
      const titleEl = entry.querySelector('h1, h2, h3, .title, [class*="title"]');
      if (titleEl) {
        title = titleEl.textContent?.trim() || '';
      }

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

  const blogPosts: BlogPost[] = [];
  const slugMap = new Map<string, string>();

  for (const postData of blogPostData) {
    if (!postData.url || !postData.id) {
      continue;
    }

    try {
      await page.goto(postData.url, { waitUntil: 'networkidle', timeout: 30000 });

      await page.waitForSelector('article, .journal-post, [role="article"]', { 
        timeout: 10000 
      }).catch(() => null);

      const postContent = await page.evaluate(() => {
        const article = document.querySelector('article, .journal-post, [role="article"]');
        if (!article) {
          return null;
        }

        let title = '';
        const titleEl = article.querySelector('h1, h2, [class*="title"]');
        if (titleEl) {
          title = titleEl.textContent?.trim() || '';
        }

        let publishedAt = '';
        const timeEl = article.querySelector('time[datetime]');
        if (timeEl) {
          publishedAt = timeEl.getAttribute('datetime') || '';
        } else {
          const dateEl = article.querySelector('.date, [class*="date"]');
          if (dateEl) {
            publishedAt = dateEl.textContent?.trim() || '';
          }
        }

        const contentEl = article.querySelector('.content, [class*="content"], .body, [class*="body"]') || article;
        const clonedContent = contentEl.cloneNode(true) as HTMLElement;

        clonedContent.querySelectorAll('script, noscript').forEach(el => el.remove());
        clonedContent.querySelectorAll('link[rel="stylesheet"]').forEach(el => el.remove());

        clonedContent.querySelectorAll('*').forEach(el => {
          const attrs = Array.from(el.attributes);
          attrs.forEach(attr => {
            if (attr.name.startsWith('on')) {
              el.removeAttribute(attr.name);
            }
          });
        });
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

      const normalizedContent = normalizeContentHtml(
        postContent.contentHtml,
        postContent.imageUrls,
        postData.id
      );

      const dateStr = 'dateStr' in postData && typeof postData.dateStr === 'string' ? postData.dateStr : '';
      const postTitle = 'title' in postData && typeof postData.title === 'string' ? postData.title : '';
      
      const publishedAt = normalizeDate(postContent.publishedAt || dateStr);
      const title = postContent.title || postTitle || `Post ${postData.id}`;
      const slug = generateSlug(title, postData.id, slugMap);
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

  imageUrls.forEach((remoteUrl) => {
    if (!remoteUrl) return;

    const urlHash = createHash('sha256').update(remoteUrl).digest('hex').substring(0, 12);
    const ext = getExtensionFromUrl(remoteUrl);
    const localPath = `../.vsco-backup/media/blog-${postId}-img-${urlHash}${ext}`;

    normalized = normalized.split(remoteUrl).join(localPath);
  });

  normalized = normalized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  normalized = normalized.replace(/\s+on\w+="[^"]*"/gi, '');
  normalized = normalized.replace(/\s+on\w+='[^']*'/gi, '');
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
    return match ? `.${match[1].toLowerCase()}` : '.jpg';
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

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateStr)) {
    return dateStr;
  }

  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  } catch {}

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
    const imgMatches = post.content_html.matchAll(/src="([^"]+)"/g);
    
    for (const match of imgMatches) {
      const localPath = match[1];
      if (localPath.startsWith('../.vsco-backup/media/')) {
        assetMap.set(localPath, localPath);
      }
    }
  }

  return assetMap;
}
