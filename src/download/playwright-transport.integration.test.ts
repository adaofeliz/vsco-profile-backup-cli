import { chromium, Browser, Page } from 'playwright';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFile, mkdir, rm } from 'fs/promises';
import { randomBytes } from 'crypto';
import http from 'http';
import { downloadWithPlaywright } from './playwright-transport.js';

describe('Playwright Download Transport - Integration', () => {
  let server: http.Server;
  let serverUrl: string;
  let browser: Browser;
  let page: Page;
  let testDir: string;

  const CLOUDFLARE_BLOCK_HTML = `
    <!DOCTYPE html>
    <html>
      <head><title>Attention Required! | Cloudflare</title></head>
      <body>
        <h1>Sorry, you have been blocked</h1>
        <p>This website is using a security service to protect itself from online attacks.</p>
      </body>
    </html>
  `;

  const MOCK_IMAGE_DATA = Buffer.from('fake-jpeg-data-1234567890');

  beforeAll(async () => {
    testDir = join(tmpdir(), `playwright-transport-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    await rm(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    const context = await browser.newContext();
    page = await context.newPage();
  });

  afterEach(async () => {
    await page?.context().close();
    server?.close();
  });

  function startMockServer(handler: http.RequestListener): Promise<string> {
    return new Promise((resolve) => {
      server = http.createServer(handler);
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          resolve(`http://localhost:${addr.port}`);
        }
      });
    });
  }

  describe('Basic download scenarios', () => {
    it('should download image asset successfully', async () => {
      serverUrl = await startMockServer((req, res) => {
        if (req.url === '/asset.jpg') {
          res.writeHead(200, { 'Content-Type': 'image/jpeg' });
          res.end(MOCK_IMAGE_DATA);
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      const filepath = join(testDir, 'downloaded-asset.jpg');
      const result = await downloadWithPlaywright(
        page,
        `${serverUrl}/asset.jpg`,
        filepath
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.contentType).toContain('image/jpeg');
      expect(result.sizeBytes).toBe(MOCK_IMAGE_DATA.length);

      const fileContent = await readFile(filepath);
      expect(fileContent.toString()).toBe(MOCK_IMAGE_DATA.toString());
    });

    it('should handle 404 responses', async () => {
      serverUrl = await startMockServer((_req, res) => {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      });

      const filepath = join(testDir, 'missing-asset.jpg');
      const result = await downloadWithPlaywright(
        page,
        `${serverUrl}/missing.jpg`,
        filepath
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
    });
  });

  describe('Cookie-protected downloads', () => {
    it('should download cookie-protected asset after setting cookie', async () => {
      const COOKIE_VALUE = randomBytes(16).toString('hex');
      let receivedCookie: string | undefined;

      serverUrl = await startMockServer((req, res) => {
        const cookies = req.headers.cookie || '';

        if (req.url === '/login') {
          res.writeHead(200, {
            'Set-Cookie': `auth=${COOKIE_VALUE}; Path=/; HttpOnly`,
            'Content-Type': 'text/html',
          });
          res.end('<html><body>Logged in</body></html>');
        } else if (req.url === '/protected-asset.jpg') {
          receivedCookie = cookies;

          if (cookies.includes(`auth=${COOKIE_VALUE}`)) {
            res.writeHead(200, { 'Content-Type': 'image/jpeg' });
            res.end(MOCK_IMAGE_DATA);
          } else {
            res.writeHead(403, { 'Content-Type': 'text/html' });
            res.end(CLOUDFLARE_BLOCK_HTML);
          }
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      await page.goto(`${serverUrl}/login`);

      const filepath = join(testDir, 'protected-asset.jpg');
      const result = await downloadWithPlaywright(
        page,
        `${serverUrl}/protected-asset.jpg`,
        filepath
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.contentType).toContain('image/jpeg');
      expect(receivedCookie).toContain(`auth=${COOKIE_VALUE}`);

      const fileContent = await readFile(filepath);
      expect(fileContent.toString()).toBe(MOCK_IMAGE_DATA.toString());
    });

    it('should fail when cookie is missing', async () => {
      const REQUIRED_COOKIE = 'required-auth-token';

      serverUrl = await startMockServer((req, res) => {
        const cookies = req.headers.cookie || '';

        if (req.url === '/protected-asset.jpg') {
          if (cookies.includes(REQUIRED_COOKIE)) {
            res.writeHead(200, { 'Content-Type': 'image/jpeg' });
            res.end(MOCK_IMAGE_DATA);
          } else {
            res.writeHead(403, { 'Content-Type': 'text/html' });
            res.end(CLOUDFLARE_BLOCK_HTML);
          }
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      const filepath = join(testDir, 'blocked-asset.jpg');
      const result = await downloadWithPlaywright(
        page,
        `${serverUrl}/protected-asset.jpg`,
        filepath
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cloudflare block detected');
      expect(result.status).toBe(403);
    });
  });

  describe('Cloudflare block detection', () => {
    it('should detect 403 Cloudflare block', async () => {
      serverUrl = await startMockServer((_req, res) => {
        res.writeHead(403, { 'Content-Type': 'text/html' });
        res.end(CLOUDFLARE_BLOCK_HTML);
      });

      const filepath = join(testDir, 'blocked-403.jpg');
      const result = await downloadWithPlaywright(
        page,
        `${serverUrl}/blocked.jpg`,
        filepath
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe(403);
      expect(result.error).toContain('Cloudflare block detected');
    });

    it('should detect 200 Cloudflare challenge page', async () => {
      serverUrl = await startMockServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(CLOUDFLARE_BLOCK_HTML);
      });

      const filepath = join(testDir, 'challenge-200.jpg');
      const result = await downloadWithPlaywright(
        page,
        `${serverUrl}/challenge.jpg`,
        filepath
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe(200);
      expect(result.error).toContain('Cloudflare block detected');
    });

    it('should provide clear diagnostic message on block', async () => {
      serverUrl = await startMockServer((_req, res) => {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(CLOUDFLARE_BLOCK_HTML);
      });

      const filepath = join(testDir, 'diagnostic-block.jpg');
      const result = await downloadWithPlaywright(
        page,
        `${serverUrl}/diagnostic.jpg`,
        filepath
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Cloudflare block detected/);
      expect(result.error).toMatch(/status=403/);
      expect(result.error).toMatch(/content-type=text\/html/);
    });
  });

  describe('Atomic write behavior', () => {
    it('should write to .tmp file then rename on success', async () => {
      serverUrl = await startMockServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end(MOCK_IMAGE_DATA);
      });

      const filepath = join(testDir, 'atomic-write.jpg');
      const tmpPath = `${filepath}.tmp`;

      const result = await downloadWithPlaywright(
        page,
        `${serverUrl}/asset.jpg`,
        filepath
      );

      expect(result.success).toBe(true);

      const fileContent = await readFile(filepath);
      expect(fileContent.toString()).toBe(MOCK_IMAGE_DATA.toString());

      let tmpExists = false;
      try {
        await readFile(tmpPath);
        tmpExists = true;
      } catch {
        tmpExists = false;
      }
      expect(tmpExists).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should handle network errors gracefully', async () => {
      const filepath = join(testDir, 'network-error.jpg');
      const result = await downloadWithPlaywright(
        page,
        'http://localhost:9999/nonexistent.jpg',
        filepath
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle empty response bodies', async () => {
      serverUrl = await startMockServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end();
      });

      const filepath = join(testDir, 'empty-response.jpg');
      const result = await downloadWithPlaywright(
        page,
        `${serverUrl}/empty.jpg`,
        filepath
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No response data captured');
    });
  });
});
