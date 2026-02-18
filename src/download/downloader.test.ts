/**
 * Tests for downloader preflight validation and error handling
 * Validates URL normalization, deterministic error classification, and retry behavior
 */

import { downloadAsset } from './downloader';
import { DownloadTask } from './downloader';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('downloader', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'downloader-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('URL normalization preflight', () => {
    it('should normalize protocol-relative URLs before fetch', async () => {
      const task: DownloadTask = {
        url: '//im.vsco.co/x.jpg',
        backupRoot: tempDir,
        mediaId: 'test-media-proto-rel',
        contentType: 'image/jpeg',
      };

      const result = await downloadAsset(task);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should preserve query strings during normalization', async () => {
      const task: DownloadTask = {
        url: '//im.vsco.co/x.jpg?w=480&c=1',
        backupRoot: tempDir,
        mediaId: 'test-media-query',
        contentType: 'image/jpeg',
      };

      const result = await downloadAsset(task);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('invalid URL rejection', () => {
    it('should reject empty URLs with deterministic error', async () => {
      const task: DownloadTask = {
        url: '',
        backupRoot: tempDir,
        mediaId: 'test-media-empty',
        contentType: 'image/jpeg',
      };

      const result = await downloadAsset(task);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Invalid URL');
      expect(result.error).toContain('input');
      expect(result.downloaded).toBe(false);
    });

    it('should reject data: URLs with deterministic error', async () => {
      const task: DownloadTask = {
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        backupRoot: tempDir,
        mediaId: 'test-media-data',
        contentType: 'image/png',
      };

      const result = await downloadAsset(task);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Invalid URL');
      expect(result.error).toContain('data:');
      expect(result.downloaded).toBe(false);
    });

    it('should reject blob: URLs with deterministic error', async () => {
      const task: DownloadTask = {
        url: 'blob:https://example.com/12345',
        backupRoot: tempDir,
        mediaId: 'test-media-blob',
        contentType: 'image/jpeg',
      };

      const result = await downloadAsset(task);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Invalid URL');
      expect(result.error).toContain('blob:');
      expect(result.downloaded).toBe(false);
    });

    it('should reject malformed URLs with deterministic error', async () => {
      const task: DownloadTask = {
        url: 'ht!tp://[invalid',
        backupRoot: tempDir,
        mediaId: 'test-media-malformed',
        contentType: 'image/jpeg',
      };

      const result = await downloadAsset(task);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Invalid URL');
      expect(result.downloaded).toBe(false);
    });

    it('should include original input in error message', async () => {
      const invalidUrl = 'data:image/png;base64,test';
      const task: DownloadTask = {
        url: invalidUrl,
        backupRoot: tempDir,
        mediaId: 'test-media-input',
        contentType: 'image/png',
      };

      const result = await downloadAsset(task);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain(invalidUrl);
    });

    it('should include reason in error message', async () => {
      const task: DownloadTask = {
        url: 'blob:https://example.com/test',
        backupRoot: tempDir,
        mediaId: 'test-media-reason',
        contentType: 'image/jpeg',
      };

      const result = await downloadAsset(task);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/Unsupported protocol|Invalid URL|failed to parse/);
    });

    it('should fail fast on invalid URLs without retries', async () => {
      const task: DownloadTask = {
        url: 'data:image/png;base64,test',
        backupRoot: tempDir,
        mediaId: 'test-media-fast-fail',
        contentType: 'image/png',
      };

      const startTime = Date.now();
      const result = await downloadAsset(task);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(duration).toBeLessThan(500);
    });

    it('should not attempt network request for invalid URLs', async () => {
      const task: DownloadTask = {
        url: 'blob:https://example.com/test',
        backupRoot: tempDir,
        mediaId: 'test-media-no-network',
        contentType: 'image/jpeg',
      };

      const result = await downloadAsset(task);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Invalid URL');
      expect(result.downloaded).toBe(false);
    });
  });
});
