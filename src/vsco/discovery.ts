import { chromium, Browser, BrowserContext, Page, Response } from 'playwright';
import { getLogger } from '../utils/logger.js';
import { retry } from '../utils/retry.js';
import { captureArtifacts } from '../utils/artifacts.js';
import { normalizeVscoAssetUrl } from './url.js';
import {
  ProfileDiscoveryResult,
  DiscoveryOptions,
  Photo,
  Gallery,
  BlogPost,
  ScrollState,
} from './types.js';

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function discoverProfile(
  username: string,
  options?: DiscoveryOptions
): Promise<ProfileDiscoveryResult> {
  const logger = getLogger();
  const opts = {
    noNewContentThreshold: options?.noNewContentThreshold ?? 3,
    maxScrollCycles: options?.maxScrollCycles ?? 50,
    maxItems: options?.maxItems,
    navigationTimeout: options?.navigationTimeout ?? 30000,
    headless: options?.headless ?? true,
    userAgent: options?.userAgent ?? DEFAULT_USER_AGENT,
  };

  logger.phaseStart('Profile Discovery');
  logger.debug(`Discovering profile: ${username}`);

  const profileUrl = `https://vsco.co/${username}/gallery`;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  const externalPage = options?.page;
  const ownsBrowser = !externalPage;

  try {
    if (externalPage) {
      page = externalPage;
    } else {
      browser = await chromium.launch({ headless: opts.headless });
      context = await browser.newContext({
        userAgent: opts.userAgent,
      });
      page = await context.newPage();
    }

    if (!page) {
      throw new Error('Failed to initialize Playwright page');
    }

    const activePage = page;

    const networkData = await setupNetworkInterception(activePage);

    logger.debug(`Navigating to: ${profileUrl}`);
    const response = await retry(
      () => activePage.goto(profileUrl, { 
        timeout: opts.navigationTimeout,
        waitUntil: 'domcontentloaded'
      }),
      { maxAttempts: 3 }
    );

    if (!response) {
      throw new Error('Navigation failed: no response received');
    }

    const status = response.status();
    logger.debug(`Page loaded with status: ${status}`);

    if (status === 404) {
      logger.warn(`Profile not found: ${username}`);
      return {
        username,
        profileUrl,
        photos: [],
        galleries: [],
        blogPosts: [],
        isEmpty: true,
        errorMessage: 'Profile not found',
      };
    }

    if (status >= 400) {
      throw new Error(`HTTP ${status}: Failed to load profile`);
    }

    // Wait for DOM readiness via selectors instead of networkidle
    await waitForPageReady(activePage, opts.navigationTimeout, logger);

    const isPrivateOrSuspended = await checkIfPrivateOrSuspended(activePage);
    if (isPrivateOrSuspended) {
      logger.warn(`Profile is private or suspended: ${username}`);
      return {
        username,
        profileUrl,
        photos: [],
        galleries: [],
        blogPosts: [],
        isEmpty: true,
        isPrivate: true,
        errorMessage: 'Profile is private or suspended',
      };
    }

    const scrollState: ScrollState = {
      currentCycle: 0,
      totalIds: new Set<string>(),
      cyclesWithoutNewContent: 0,
      lastIdCount: 0,
    };

    logger.debug('Starting scroll discovery loop');
    while (
      scrollState.currentCycle < opts.maxScrollCycles &&
      scrollState.cyclesWithoutNewContent < opts.noNewContentThreshold &&
      (opts.maxItems === undefined || scrollState.totalIds.size < opts.maxItems)
    ) {
      scrollState.currentCycle++;

      await scrollToBottom(activePage);
      await activePage.waitForTimeout(1500);

      const currentIds = await extractContentIds(activePage, networkData);
      const previousIdCount = scrollState.lastIdCount;
      currentIds.forEach((id) => scrollState.totalIds.add(id));
      scrollState.lastIdCount = scrollState.totalIds.size;

      if (scrollState.lastIdCount === previousIdCount) {
        scrollState.cyclesWithoutNewContent++;
        logger.debug(
          `Cycle ${scrollState.currentCycle}: No new IDs (${scrollState.cyclesWithoutNewContent}/${opts.noNewContentThreshold})`
        );
      } else {
        const newCount = scrollState.lastIdCount - previousIdCount;
        scrollState.cyclesWithoutNewContent = 0;
        logger.debug(
          `Cycle ${scrollState.currentCycle}: Found ${newCount} new IDs (total: ${scrollState.lastIdCount})`
        );
      }
    }

    let stoppingReason = '';
    if (opts.maxItems !== undefined && scrollState.totalIds.size >= opts.maxItems) {
      stoppingReason = `Reached max items limit: ${opts.maxItems}`;
    } else if (scrollState.currentCycle >= opts.maxScrollCycles) {
      stoppingReason = `Reached max scroll cycles: ${opts.maxScrollCycles}`;
    } else {
      stoppingReason = `No new content for ${opts.noNewContentThreshold} consecutive cycles`;
    }
    logger.debug(`Stopping reason: ${stoppingReason}`);

    const photos = await extractPhotos(activePage, networkData);
    const galleries = await extractGalleries(activePage);
    const blogPosts = await extractBlogPosts(activePage);

    logger.debug(
      `Discovery complete: ${photos.length} photos, ${galleries.length} galleries, ${blogPosts.length} blog posts`
    );

    const isEmpty = photos.length === 0 && galleries.length === 0 && blogPosts.length === 0;

    if (ownsBrowser && browser) {
      await browser.close();
      browser = null;
      context = null;
      page = null;
    }

    return {
      username,
      profileUrl,
      photos,
      galleries,
      blogPosts,
      isEmpty,
    };
  } catch (error) {
    const logger = getLogger();
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Profile discovery failed: ${errorMessage}`);

    if (options?.backupRoot && options?.runId) {
      try {
        const capturePage =
          options?.page ?? page ?? (browser ? (await browser.contexts())[0]?.pages()[0] : undefined);
        if (capturePage) {
          const artifacts = await captureArtifacts(
            capturePage,
            options.backupRoot,
            'discovery',
            options.runId
          );
          if (artifacts) {
            logger.info(`Artifacts captured: ${artifacts.screenshotPath}`);
            logger.info(`Artifacts captured: ${artifacts.htmlPath}`);
          }
        }
      } catch (captureError) {
        const captureMsg = captureError instanceof Error ? captureError.message : String(captureError);
        logger.warn(`Failed to capture artifacts: ${captureMsg}`);
      }
    }

    if (ownsBrowser && browser) {
      await browser.close();
    }

    return {
      username,
      profileUrl,
      photos: [],
      galleries: [],
      blogPosts: [],
      isEmpty: true,
      errorMessage,
    };
  }
}

interface NetworkData {
  apiResponses: any[];
  mediaUrls: Set<string>;
}

async function setupNetworkInterception(page: Page): Promise<NetworkData> {
  const networkData: NetworkData = {
    apiResponses: [],
    mediaUrls: new Set<string>(),
  };

  page.on('response', async (response: Response) => {
    const url = response.url();

    if (url.includes('/api/') || url.includes('/media/')) {
      try {
        if (url.includes('.json') || response.headers()['content-type']?.includes('application/json')) {
          const json = await response.json();
          networkData.apiResponses.push({ url, data: json });
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    if (url.includes('.jpg') || url.includes('.png') || url.includes('.webp')) {
      networkData.mediaUrls.add(url);
    }
  });

  return networkData;
}

async function waitForPageReady(page: Page, timeout: number, logger: any): Promise<void> {
  const contentSelectors = [
    '[data-id]',
    '[data-image-id]',
    'a[href*="/media/"]',
  ];

  const privateSelectors = [
    'text=private profile',
    'text=This profile is private',
    'text=account suspended',
    'text=Account Suspended',
    '[data-test="private-profile"]',
    '[aria-label*="private"]',
  ];

  const notFoundSelectors = [
    'text=not found',
    'text=Page not found',
    'text=404',
  ];

  const emptySelectors = [
    'text=No images yet',
    'text=No content',
  ];

  const allSelectors = [
    ...contentSelectors,
    ...privateSelectors,
    ...notFoundSelectors,
    ...emptySelectors,
  ];

  try {
    logger.debug('Waiting for page readiness (DOM + selectors)...');
    
    await page.locator(allSelectors.join(', ')).first().waitFor({
      state: 'visible',
      timeout,
    });

    if (await page.locator(contentSelectors.join(', ')).first().isVisible({ timeout: 1000 })) {
      logger.debug('Page ready: content detected');
    } else if (await page.locator(privateSelectors.join(', ')).first().isVisible({ timeout: 1000 })) {
      logger.debug('Page ready: private/suspended state detected');
    } else if (await page.locator(notFoundSelectors.join(', ')).first().isVisible({ timeout: 1000 })) {
      logger.debug('Page ready: not found state detected');
    } else {
      logger.debug('Page ready: empty state detected');
    }
  } catch (error) {
    logger.debug('Timeout waiting for page readiness selectors, proceeding anyway');
  }
}

async function checkIfPrivateOrSuspended(page: Page): Promise<boolean> {
  const privateSelectors = [
    'text=private profile',
    'text=This profile is private',
    'text=account suspended',
    'text=Account Suspended',
    '[data-test="private-profile"]',
    '[aria-label*="private"]',
  ];

  for (const selector of privateSelectors) {
    try {
      const element = await page.locator(selector).first();
      if (await element.isVisible({ timeout: 2000 })) {
        return true;
      }
    } catch (e) {
      continue;
    }
  }

  return false;
}

async function scrollToBottom(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
}

async function extractContentIds(page: Page, networkData: NetworkData): Promise<Set<string>> {
  const ids = new Set<string>();

  for (const response of networkData.apiResponses) {
    const extracted = extractIdsFromJson(response.data);
    extracted.forEach((id) => ids.add(id));
  }

  const domIds = await page.evaluate(() => {
    const foundIds = new Set<string>();
    
    document.querySelectorAll('[data-id]').forEach((el) => {
      const id = el.getAttribute('data-id');
      if (id) foundIds.add(id);
    });

    document.querySelectorAll('[data-image-id]').forEach((el) => {
      const id = el.getAttribute('data-image-id');
      if (id) foundIds.add(id);
    });

    document.querySelectorAll('a[href*="/media/"]').forEach((el) => {
      const href = el.getAttribute('href');
      if (href) {
        const match = href.match(/\/media\/([a-zA-Z0-9]+)/);
        if (match) foundIds.add(match[1]);
      }
    });

    return Array.from(foundIds);
  });

  domIds.forEach((id) => ids.add(id));

  return ids;
}

function extractIdsFromJson(data: any): Set<string> {
  const ids = new Set<string>();

  function traverse(obj: any) {
    if (!obj || typeof obj !== 'object') return;

    if (obj.id && typeof obj.id === 'string') {
      ids.add(obj.id);
    }

    if (obj._id && typeof obj._id === 'string') {
      ids.add(obj._id);
    }

    if (Array.isArray(obj)) {
      obj.forEach(traverse);
    } else {
      Object.values(obj).forEach(traverse);
    }
  }

  traverse(data);
  return ids;
}

async function extractPhotos(page: Page, networkData: NetworkData): Promise<Photo[]> {
  const photos: Photo[] = [];
  const seenIds = new Set<string>();

  for (const response of networkData.apiResponses) {
    const extracted = extractPhotosFromJson(response.data);
    extracted.forEach((photo) => {
      if (!seenIds.has(photo.id)) {
        seenIds.add(photo.id);
        photos.push(photo);
      }
    });
  }

  const domPhotos = await page.evaluate(() => {
    const photoElements = Array.from(
      document.querySelectorAll('a[href*="/media/"], img[src*="vsco"], [role="img"]')
    );

    return photoElements
      .map((el) => {
        let id = '';
        let imageUrl = '';
        let thumbnailUrl = '';
        let permalink = '';

        if (el.tagName === 'A') {
          const href = el.getAttribute('href') || '';
          const match = href.match(/\/media\/([a-zA-Z0-9]+)/);
          if (match) {
            id = match[1];
            permalink = href;
          }

          const img = el.querySelector('img');
          if (img) {
            thumbnailUrl = img.src || '';
            imageUrl = img.src || '';
          }
        } else if (el.tagName === 'IMG') {
          const img = el as HTMLImageElement;
          imageUrl = img.src || '';
          thumbnailUrl = img.src || '';
          id = imageUrl.match(/\/([a-zA-Z0-9]+)\./)?.[1] || '';
        }

        return { id, imageUrl, thumbnailUrl, permalink };
      })
      .filter((photo) => photo.id);
  });

  const logger = getLogger();
  domPhotos.forEach((photo) => {
    if (!seenIds.has(photo.id)) {
      const normalized = normalizeVscoAssetUrl(photo.imageUrl);
      if (!normalized.ok) {
        logger.debug(`Skipping photo ${photo.id}: ${normalized.reason} (input: ${normalized.input})`);
        return;
      }
      seenIds.add(photo.id);
      photos.push({
        ...photo,
        imageUrl: normalized.url,
      });
    }
  });

  return photos;
}

function extractPhotosFromJson(data: any): Photo[] {
  const photos: Photo[] = [];
  const logger = getLogger();

  function traverse(obj: any) {
    if (!obj || typeof obj !== 'object') return;

    if (obj.id && (obj.imageUrl || obj.permalink || obj.responsiveUrl)) {
      const rawImageUrl = obj.imageUrl || obj.responsiveUrl;
      const normalized = normalizeVscoAssetUrl(rawImageUrl);
      
      if (!normalized.ok) {
        logger.debug(`Skipping photo ${obj.id} from JSON: ${normalized.reason} (input: ${normalized.input})`);
        return;
      }

      photos.push({
        id: obj.id,
        permalink: obj.permalink,
        imageUrl: normalized.url,
        thumbnailUrl: obj.thumbnailUrl || obj.imageUrl,
        uploadDate: obj.uploadDate || obj.captureDate,
        caption: obj.description || obj.caption,
      });
    }

    if (Array.isArray(obj)) {
      obj.forEach(traverse);
    } else {
      Object.values(obj).forEach(traverse);
    }
  }

  traverse(data);
  return photos;
}

async function extractGalleries(page: Page): Promise<Gallery[]> {
  const rawGalleries = await page.evaluate(() => {
    const galleryElements = Array.from(
      document.querySelectorAll('a[href*="/collection/"], a[href*="/gallery/"], [data-collection-id]')
    );

    return galleryElements
      .map((el) => {
        const href = el.getAttribute('href') || '';
        const match = href.match(/\/(collection|gallery)\/([a-zA-Z0-9]+)/);
        
        if (!match) return null;

        const id = match[2];
        const name = el.textContent?.trim() || undefined;
        const img = el.querySelector('img');
        const thumbnailUrl = img?.src || undefined;

        return {
          id,
          name,
          permalink: href,
          thumbnailUrl,
        };
      })
      .filter((g) => g !== null);
  });

  return rawGalleries as Gallery[];
}

async function extractBlogPosts(page: Page): Promise<BlogPost[]> {
  const rawBlogPosts = await page.evaluate(() => {
    const blogElements = Array.from(
      document.querySelectorAll('a[href*="/journal/"], article, [data-post-id]')
    );

    return blogElements
      .map((el) => {
        const href = el.getAttribute('href') || el.querySelector('a')?.getAttribute('href') || '';
        const match = href.match(/\/journal\/([a-zA-Z0-9-]+)/);
        
        if (!match) return null;

        const id = match[1];
        const title = el.querySelector('h1, h2, h3, [role="heading"]')?.textContent?.trim() || undefined;
        const excerpt = el.querySelector('p')?.textContent?.trim() || undefined;

        return {
          id,
          title,
          permalink: href,
          excerpt,
        };
      })
      .filter((b) => b !== null);
  });

  return rawBlogPosts as BlogPost[];
}
