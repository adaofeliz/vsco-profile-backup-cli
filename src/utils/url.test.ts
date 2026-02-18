/**
 * Tests for URL normalization and validation
 * Covers protocol-relative URLs, scheme upgrades, query preservation, and rejection of unsupported schemes
 */

import { normalizeRemoteUrl } from './url';

describe('normalizeRemoteUrl', () => {
  describe('protocol-relative URLs', () => {
    it('should convert //host/path to https://host/path', () => {
      const result = normalizeRemoteUrl('//im.vsco.co/x.jpg');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toBe('https://im.vsco.co/x.jpg');
      }
    });

    it('should preserve query strings in protocol-relative URLs', () => {
      const result = normalizeRemoteUrl('//im.vsco.co/x.jpg?w=480&c=1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toBe('https://im.vsco.co/x.jpg?w=480&c=1');
      }
    });

    it('should handle protocol-relative URLs with fragments', () => {
      const result = normalizeRemoteUrl('//im.vsco.co/x.jpg?w=480#section');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain('https://im.vsco.co/x.jpg?w=480');
      }
    });

    it('should handle protocol-relative URLs with complex paths', () => {
      const result = normalizeRemoteUrl('//i.vsco.co/media/v2/abc123/def456.jpg');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toBe('https://i.vsco.co/media/v2/abc123/def456.jpg');
      }
    });
  });

  describe('http to https upgrade', () => {
    it('should upgrade http:// to https://', () => {
      const result = normalizeRemoteUrl('http://im.vsco.co/x.jpg');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toBe('https://im.vsco.co/x.jpg');
      }
    });

    it('should preserve query strings when upgrading http to https', () => {
      const result = normalizeRemoteUrl('http://im.vsco.co/x.jpg?w=480');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toBe('https://im.vsco.co/x.jpg?w=480');
      }
    });

    it('should handle http URLs with complex paths', () => {
      const result = normalizeRemoteUrl('http://i.vsco.co/media/v2/abc123/def456.jpg');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toBe('https://i.vsco.co/media/v2/abc123/def456.jpg');
      }
    });
  });

  describe('https URLs (unchanged)', () => {
    it('should leave https:// URLs unchanged', () => {
      const result = normalizeRemoteUrl('https://i.vsco.co/x.jpg');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toBe('https://i.vsco.co/x.jpg');
      }
    });

    it('should preserve query strings in https URLs', () => {
      const result = normalizeRemoteUrl('https://i.vsco.co/x.jpg?w=480&c=1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toBe('https://i.vsco.co/x.jpg?w=480&c=1');
      }
    });

    it('should handle https URLs with complex paths', () => {
      const result = normalizeRemoteUrl('https://i.vsco.co/media/v2/abc123/def456.jpg');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toBe('https://i.vsco.co/media/v2/abc123/def456.jpg');
      }
    });

    it('should handle https URLs with port numbers', () => {
      const result = normalizeRemoteUrl('https://i.vsco.co:443/x.jpg');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain('https://i.vsco.co');
      }
    });
  });

  describe('unsupported schemes rejection', () => {
    it('should reject data: URLs', () => {
      const result = normalizeRemoteUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('data:');
        expect(result.input).toContain('data:');
      }
    });

    it('should reject blob: URLs', () => {
      const result = normalizeRemoteUrl('blob:https://example.com/12345678-1234-1234-1234-123456789012');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('blob:');
        expect(result.input).toContain('blob:');
      }
    });

    it('should reject file: URLs', () => {
      const result = normalizeRemoteUrl('file:///path/to/file.jpg');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Unsupported protocol');
        expect(result.input).toBe('file:///path/to/file.jpg');
      }
    });

    it('should reject ftp: URLs', () => {
      const result = normalizeRemoteUrl('ftp://example.com/file.jpg');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Unsupported protocol');
        expect(result.input).toBe('ftp://example.com/file.jpg');
      }
    });

    it('should reject javascript: URLs', () => {
      const result = normalizeRemoteUrl('javascript:alert("xss")');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Unsupported protocol');
      }
    });
  });

  describe('empty and invalid input', () => {
    it('should reject empty string', () => {
      const result = normalizeRemoteUrl('');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('empty');
        expect(result.input).toBe('');
      }
    });

    it('should reject whitespace-only string', () => {
      const result = normalizeRemoteUrl('   ');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('empty');
      }
    });

    it('should reject null-like values (non-string)', () => {
      const result = normalizeRemoteUrl(null as any);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('empty');
      }
    });

    it('should reject malformed URLs', () => {
      const result = normalizeRemoteUrl('ht!tp://[invalid');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBeDefined();
        expect(result.input).toBe('ht!tp://[invalid');
      }
    });

    it('should reject malformed protocol-relative URLs', () => {
      const result = normalizeRemoteUrl('//[invalid host]/path');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBeDefined();
      }
    });
  });

  describe('edge cases', () => {
    it('should handle URLs with authentication (user:pass)', () => {
      const result = normalizeRemoteUrl('http://user:pass@im.vsco.co/x.jpg');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain('https://');
        expect(result.url).toContain('im.vsco.co');
      }
    });

    it('should handle URLs with multiple query parameters', () => {
      const result = normalizeRemoteUrl('//im.vsco.co/x.jpg?w=480&h=640&c=1&q=80');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain('w=480');
        expect(result.url).toContain('h=640');
        expect(result.url).toContain('c=1');
        expect(result.url).toContain('q=80');
      }
    });

    it('should handle URLs with encoded characters in query string', () => {
      const result = normalizeRemoteUrl('//im.vsco.co/x.jpg?sig=abc%2Bdef%3D');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain('sig=');
      }
    });

    it('should handle URLs with trailing slashes', () => {
      const result = normalizeRemoteUrl('//im.vsco.co/x.jpg/');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain('https://im.vsco.co/x.jpg/');
      }
    });

    it('should handle URLs with subdomain chains', () => {
      const result = normalizeRemoteUrl('//cdn.images.vsco.co/media/x.jpg');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toBe('https://cdn.images.vsco.co/media/x.jpg');
      }
    });

    it('should handle URLs with numeric ports', () => {
      const result = normalizeRemoteUrl('http://im.vsco.co:8080/x.jpg');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain('https://');
      }
    });

    it('should trim whitespace from input', () => {
      const result = normalizeRemoteUrl('  https://im.vsco.co/x.jpg  ');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toBe('https://im.vsco.co/x.jpg');
      }
    });
  });

  describe('result object structure', () => {
    it('should return { ok: true, url } on success', () => {
      const result = normalizeRemoteUrl('https://im.vsco.co/x.jpg');
      expect(result).toHaveProperty('ok');
      expect(result).toHaveProperty('url');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.url).toBe('string');
      }
    });

    it('should return { ok: false, reason, input } on failure', () => {
      const result = normalizeRemoteUrl('data:image/png;base64,abc');
      expect(result).toHaveProperty('ok');
      expect(result).toHaveProperty('reason');
      expect(result).toHaveProperty('input');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(typeof result.reason).toBe('string');
        expect(typeof result.input).toBe('string');
      }
    });

    it('should not have url property on failure', () => {
      const result = normalizeRemoteUrl('');
      expect(result.ok).toBe(false);
      expect('url' in result).toBe(false);
    });

    it('should not have reason/input properties on success', () => {
      const result = normalizeRemoteUrl('https://im.vsco.co/x.jpg');
      expect(result.ok).toBe(true);
      expect('reason' in result).toBe(false);
      expect('input' in result).toBe(false);
    });
  });
});
