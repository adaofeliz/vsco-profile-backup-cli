/**
 * Tests for Cloudflare block detection
 * Validates detection of blocked/challenge HTML responses
 */

import { isCloudflareBlocked, ResponseLike } from './cloudflare-block';

describe('cloudflare-block', () => {
  describe('isCloudflareBlocked', () => {
    // Helper to create mock response objects
    const createMockResponse = (
      status: number,
      contentType: string = 'text/html',
      body: string = ''
    ): ResponseLike => ({
      status,
      statusText: status === 200 ? 'OK' : 'Forbidden',
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === 'content-type') {
            return contentType;
          }
          return null;
        },
      },
      text: async () => body,
      arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    });

    describe('403 status code', () => {
      it('should classify 403 as blocked (fast path)', async () => {
        const response = createMockResponse(403, 'text/html', '');
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(true);
      });

      it('should classify 403 as blocked regardless of content-type', async () => {
        const response = createMockResponse(403, 'image/jpeg', '');
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(true);
      });

      it('should classify 403 as blocked regardless of body content', async () => {
        const response = createMockResponse(403, 'text/html', 'normal content');
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(true);
      });
    });

    describe('200 status with HTML + Cloudflare markers', () => {
      it('should detect "Attention Required! | Cloudflare" marker', async () => {
        const html = `
          <html>
            <head><title>Attention Required! | Cloudflare</title></head>
            <body>Please wait...</body>
          </html>
        `;
        const response = createMockResponse(200, 'text/html', html);
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(true);
      });

      it('should detect "Sorry, you have been blocked" marker', async () => {
        const html = `
          <html>
            <body>
              <h1>Sorry, you have been blocked</h1>
              <p>Your IP has been blocked by Cloudflare</p>
            </body>
          </html>
        `;
        const response = createMockResponse(200, 'text/html', html);
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(true);
      });

      it('should detect "__cf_bm=" cookie marker', async () => {
        const html = `
          <html>
            <head>
              <script>
                document.cookie = "__cf_bm=abc123def456";
              </script>
            </head>
          </html>
        `;
        const response = createMockResponse(200, 'text/html', html);
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(true);
      });

      it('should detect "cf-ray" header marker in HTML', async () => {
        const html = `
          <html>
            <body>
              <div>cf-ray: 12345abcde</div>
            </body>
          </html>
        `;
        const response = createMockResponse(200, 'text/html', html);
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(true);
      });

      it('should be case-insensitive for markers', async () => {
        const html = `
          <html>
            <body>ATTENTION REQUIRED! | CLOUDFLARE</body>
          </html>
        `;
        const response = createMockResponse(200, 'text/html', html);
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(true);
      });

      it('should detect marker in large HTML response (respects 8KB cap)', async () => {
        const largeHtml = 'cf-ray: 12345' + 'x'.repeat(10000) + 'y'.repeat(10000);
        const response = createMockResponse(200, 'text/html', largeHtml);
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(true);
      });
    });

    describe('200 status with HTML but no markers', () => {
      it('should not classify normal HTML as blocked', async () => {
        const html = `
          <html>
            <head><title>Normal Page</title></head>
            <body>
              <h1>Welcome</h1>
              <p>This is a normal page</p>
            </body>
          </html>
        `;
        const response = createMockResponse(200, 'text/html', html);
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(false);
      });

      it('should not classify HTML with "blocked" word (but no marker) as blocked', async () => {
        const html = `
          <html>
            <body>
              <p>This content is blocked by your firewall</p>
            </body>
          </html>
        `;
        const response = createMockResponse(200, 'text/html', html);
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(false);
      });

      it('should not classify empty HTML as blocked', async () => {
        const response = createMockResponse(200, 'text/html', '');
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(false);
      });
    });

    describe('non-HTML content types', () => {
      it('should not classify image/jpeg as blocked', async () => {
        const response = createMockResponse(200, 'image/jpeg', '');
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(false);
      });

      it('should not classify image/png as blocked', async () => {
        const response = createMockResponse(200, 'image/png', '');
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(false);
      });

      it('should not classify application/json as blocked', async () => {
        const response = createMockResponse(200, 'application/json', '{"data": "value"}');
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(false);
      });

      it('should not classify video/mp4 as blocked', async () => {
        const response = createMockResponse(200, 'video/mp4', '');
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(false);
      });

      it('should handle missing content-type header', async () => {
        const response: ResponseLike = {
          status: 200,
          headers: {
            get: () => null,
          },
          text: async () => 'some content',
        };
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle response without text() method', async () => {
        const response: ResponseLike = {
          status: 200,
          headers: {
            get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/html' : null),
          },
        };
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(false);
      });

      it('should handle response with arrayBuffer() but no text()', async () => {
        const html = 'cf-ray: 12345';
        const response: ResponseLike = {
          status: 200,
          headers: {
            get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/html' : null),
          },
          arrayBuffer: async () => new TextEncoder().encode(html).buffer,
        };
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(true);
      });

      it('should handle text() throwing an error', async () => {
        const response: ResponseLike = {
          status: 200,
          headers: {
            get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/html' : null),
          },
          text: async () => {
            throw new Error('Body already read');
          },
        };
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(false);
      });

      it('should handle 200 status with charset in content-type', async () => {
        const html = 'cf-ray: 12345';
        const response: ResponseLike = {
          status: 200,
          headers: {
            get: (name: string) =>
              name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null,
          },
          text: async () => html,
        };
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(true);
      });

      it('should handle 200 status with uppercase content-type', async () => {
        const html = 'cf-ray: 12345';
        const response: ResponseLike = {
          status: 200,
          headers: {
            get: (name: string) => (name.toLowerCase() === 'content-type' ? 'TEXT/HTML' : null),
          },
          text: async () => html,
        };
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(true);
      });

      it('should respect 8KB body read limit', async () => {
        const markerAtStart = 'cf-ray: 12345' + 'x'.repeat(10000);
        const response = createMockResponse(200, 'text/html', markerAtStart);
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(true);
      });

      it('should not detect marker beyond 8KB limit', async () => {
        const markerBeyondLimit = 'x'.repeat(10000) + 'cf-ray: 12345';
        const response = createMockResponse(200, 'text/html', markerBeyondLimit);
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(false);
      });
    });

    describe('real-world Cloudflare block page fixture', () => {
      it('should detect real Cloudflare block HTML', async () => {
        const cloudflareBlockHtml = `
          <!DOCTYPE html>
          <html lang="en-US">
          <head>
            <title>Attention Required! | Cloudflare</title>
            <meta charset="UTF-8" />
            <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
            <meta http-equiv="X-UA-Compatible" content="IE=edge" />
            <meta name="robots" content="noindex, nofollow" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <link rel="stylesheet" id="cf_styles-css" href="/cdn-cgi/styles/cf.errors.css" type="text/css" media="screen,projection" />
            <style type="text/css">
              body { margin: 0; padding: 0; }
            </style>
          </head>
          <body>
            <div id="cf-wrapper">
              <div class="cf-alert cf-alert-error cf-cookie-error" id="cookie-alert" data-translate="enable_cookies">
                <p data-translate="enable_cookies_message">Please enable Cookies and reload the page.</p>
              </div>
              <div id="cf-error-details" class="cf-error-details-wrapper">
                <div class="cf-wrapper cf-header cf-error-header cf-error-response-wrapper">
                  <h1 data-translate="error_code_title" data-code="1020">
                    <span class="cf-code">Error code 1020</span>
                  </h1>
                  <h2 data-translate="error_desc_1020" class="cf-subheader">You are being rate limited</h2>
                  <p data-translate="error_code_1020_desc_bottom">
                    Ray ID: <code>12345abcde67890</code> •
                    <span id="cf-footer-item-performance">Performance &amp; security by</span>
                    <a id="brand_link" href="https://www.cloudflare.com/5xx-error-landing/" data-translate="brand_name">Cloudflare</a>
                  </p>
                </div>
              </div>
            </div>
            <script type="text/javascript">
              window._cf_translation = {};
            </script>
          </body>
          </html>
        `;
        const response = createMockResponse(200, 'text/html; charset=UTF-8', cloudflareBlockHtml);
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(true);
      });
    });

    describe('other HTTP status codes', () => {
      it('should not classify 200 OK without markers as blocked', async () => {
        const response = createMockResponse(200, 'text/html', '<html><body>OK</body></html>');
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(false);
      });

      it('should not classify 301 redirect as blocked', async () => {
        const response: ResponseLike = {
          status: 301,
          headers: {
            get: () => null,
          },
        };
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(false);
      });

      it('should not classify 404 as blocked', async () => {
        const response: ResponseLike = {
          status: 404,
          headers: {
            get: () => null,
          },
        };
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(false);
      });

      it('should not classify 500 as blocked', async () => {
        const response: ResponseLike = {
          status: 500,
          headers: {
            get: () => null,
          },
        };
        const result = await isCloudflareBlocked(response);
        expect(result).toBe(false);
      });
    });
  });
});
