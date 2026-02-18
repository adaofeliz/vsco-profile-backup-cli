import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { DEFAULT_USER_AGENT } from '../vsco/discovery.js';

export interface VscoSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

export interface VscoSessionOptions {
  headless?: boolean;
  userAgent?: string;
}

export async function createVscoSession(
  options: VscoSessionOptions = {}
): Promise<VscoSession> {
  const headless = options.headless ?? true;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let closed = false;

  const close = async () => {
    if (closed) return;
    closed = true;

    if (page) {
      try {
        await page.close();
      } catch {
      }
    }

    if (context) {
      try {
        await context.close();
      } catch {
      }
    }

    if (browser) {
      try {
        await browser.close();
      } catch {
      }
    }
  };

  try {
    browser = await chromium.launch({ headless });
    context = await browser.newContext({ userAgent });
    page = await context.newPage();

    return {
      browser,
      context,
      page,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
