import { normalizeVscoAssetUrl } from './url';

describe('normalizeVscoAssetUrl', () => {
  describe('protocol-relative URLs', () => {
    it('should convert protocol-relative URL to https', () => {
      const result = normalizeVscoAssetUrl('//im.vsco.co/aws-us-west-2/xyz.jpg?w=480');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toBe('https://im.vsco.co/aws-us-west-2/xyz.jpg?w=480');
      }
    });

    it('should preserve query strings on protocol-relative URLs', () => {
      const result = normalizeVscoAssetUrl('//im.vsco.co/photo.jpg?w=480&c=1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain('?w=480&c=1');
      }
    });

    it('should handle protocol-relative URL without query string', () => {
      const result = normalizeVscoAssetUrl('//i.vsco.co/path/image.jpg');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toBe('https://i.vsco.co/path/image.jpg');
      }
    });
  });

  describe('http to https upgrade', () => {
    it('should upgrade http to https', () => {
      const result = normalizeVscoAssetUrl('http://im.vsco.co/photo.jpg');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toBe('https://im.vsco.co/photo.jpg');
      }
    });

    it('should preserve query strings when upgrading to https', () => {
      const result = normalizeVscoAssetUrl('http://im.vsco.co/photo.jpg?w=480');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toBe('https://im.vsco.co/photo.jpg?w=480');
      }
    });
  });

  describe('https URLs', () => {
    it('should leave https URLs unchanged', () => {
      const result = normalizeVscoAssetUrl('https://i.vsco.co/photo.jpg?w=480&c=1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toBe('https://i.vsco.co/photo.jpg?w=480&c=1');
      }
    });

    it('should preserve complex query strings on https URLs', () => {
      const input = 'https://im.vsco.co/aws-us-west-2/photo-id/image.jpg?w=1536&dpr=2&c=1';
      const result = normalizeVscoAssetUrl(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toBe(input);
      }
    });
  });

  describe('query string preservation', () => {
    it('should preserve single query parameter', () => {
      const result = normalizeVscoAssetUrl('https://im.vsco.co/photo.jpg?w=480');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain('?w=480');
      }
    });

    it('should preserve multiple query parameters', () => {
      const result = normalizeVscoAssetUrl('https://im.vsco.co/photo.jpg?w=480&h=640&c=1&dpr=2');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain('?w=480&h=640&c=1&dpr=2');
      }
    });

    it('should preserve empty query parameter values', () => {
      const result = normalizeVscoAssetUrl('https://im.vsco.co/photo.jpg?w=&c=1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain('?w=&c=1');
      }
    });

    it('should preserve URL fragments with query strings', () => {
      const result = normalizeVscoAssetUrl('https://im.vsco.co/photo.jpg?w=480#anchor');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain('?w=480');
        expect(result.url).toContain('#anchor');
      }
    });
  });

  describe('invalid URL rejection', () => {
    it('should reject empty string', () => {
      const result = normalizeVscoAssetUrl('');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('empty');
      }
    });

    it('should reject data: URLs', () => {
      const result = normalizeVscoAssetUrl('data:image/png;base64,iVBORw0KGgo=');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('data:');
      }
    });

    it('should reject blob: URLs', () => {
      const result = normalizeVscoAssetUrl('blob:https://vsco.co/123-456-789');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('blob:');
      }
    });

    it('should reject unsupported protocols', () => {
      const result = normalizeVscoAssetUrl('ftp://example.com/file.jpg');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('ftp:');
      }
    });

    it('should reject malformed URLs', () => {
      const result = normalizeVscoAssetUrl('not a valid url');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Invalid');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle whitespace-only input', () => {
      const result = normalizeVscoAssetUrl('   ');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('empty');
      }
    });

    it('should trim whitespace before normalization', () => {
      const result = normalizeVscoAssetUrl('  https://im.vsco.co/photo.jpg  ');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toBe('https://im.vsco.co/photo.jpg');
      }
    });

    it('should handle URLs with encoded characters', () => {
      const result = normalizeVscoAssetUrl('https://im.vsco.co/photo%20image.jpg?name=test%20value');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain('photo%20image.jpg');
        expect(result.url).toContain('name=test%20value');
      }
    });

    it('should handle URLs with international characters', () => {
      const result = normalizeVscoAssetUrl('https://im.vsco.co/путь/фото.jpg');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain('https://im.vsco.co/');
      }
    });
  });

  describe('VSCO-specific patterns', () => {
    it('should handle typical VSCO image URL from DOM', () => {
      const result = normalizeVscoAssetUrl('https://image-aws-us-west-2.vsco.co/123abc/456def/photo-id/responsive.jpg?w=1536&dpr=2&c=1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain('?w=1536&dpr=2&c=1');
      }
    });

    it('should handle typical VSCO image URL from API JSON', () => {
      const result = normalizeVscoAssetUrl('//im.vsco.co/aws-us-west-2/123abc/456def/photo-id.jpg?h=640&w=480');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toBe('https://im.vsco.co/aws-us-west-2/123abc/456def/photo-id.jpg?h=640&w=480');
      }
    });

    it('should handle VSCO thumbnail URLs', () => {
      const result = normalizeVscoAssetUrl('https://im.vsco.co/aws-us-west-2/thumb.jpg?w=240');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain('?w=240');
      }
    });
  });

  describe('error result structure', () => {
    it('should return reason and input on failure', () => {
      const input = 'data:invalid';
      const result = normalizeVscoAssetUrl(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBeTruthy();
        expect(result.input).toBe(input);
      }
    });

    it('should provide actionable error messages', () => {
      const result = normalizeVscoAssetUrl('');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason.length).toBeGreaterThan(0);
        expect(result.reason).toMatch(/invalid|empty|failed/i);
      }
    });
  });
});
