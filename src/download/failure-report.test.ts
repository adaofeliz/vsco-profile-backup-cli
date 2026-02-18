/**
 * Tests for failure report writer
 * Verifies JSON report creation, structure, and manual recovery guidance
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdir, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  writeFailureReport,
  generateManualRecovery,
  FailureEntry,
  FailureSummary,
} from './failure-report.js';

describe('failure-report', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `vsco-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('writeFailureReport', () => {
    it('should create logs directory if it does not exist', async () => {
      const summary: FailureSummary = {
        discovered: 5,
        attempted: 5,
        skippedValid: 0,
        succeeded: 4,
        failed: 1,
        failRate: 0.2,
        failThreshold: 0.5,
        verdict: 'PASS',
      };

      await writeFailureReport(testDir, 'run-123', summary, []);

      const logsDir = join(testDir, '.vsco-backup', 'logs');
      const reportPath = join(logsDir, 'download-failures-run-123.json');

      const content = await readFile(reportPath, 'utf-8');
      expect(content).toBeDefined();
    });

    it('should write report to correct path with runId', async () => {
      const summary: FailureSummary = {
        discovered: 10,
        attempted: 10,
        skippedValid: 0,
        succeeded: 9,
        failed: 1,
        failRate: 0.1,
        failThreshold: 0.5,
        verdict: 'PASS',
      };

      const runId = 'test-run-abc123';
      await writeFailureReport(testDir, runId, summary, []);

      const reportPath = join(
        testDir,
        '.vsco-backup',
        'logs',
        `download-failures-${runId}.json`
      );

      const content = await readFile(reportPath, 'utf-8');
      const report = JSON.parse(content);

      expect(report.runId).toBe(runId);
    });

    it('should include runId and timestamp in report', async () => {
      const summary: FailureSummary = {
        discovered: 5,
        attempted: 5,
        skippedValid: 0,
        succeeded: 5,
        failed: 0,
        failRate: 0,
        failThreshold: 0.5,
        verdict: 'PASS',
      };

      const runId = 'run-xyz';
      const beforeTime = new Date();
      await writeFailureReport(testDir, runId, summary, []);
      const afterTime = new Date();

      const reportPath = join(
        testDir,
        '.vsco-backup',
        'logs',
        `download-failures-${runId}.json`
      );
      const content = await readFile(reportPath, 'utf-8');
      const report = JSON.parse(content);

      expect(report.runId).toBe(runId);
      expect(report.timestamp).toBeDefined();

      const reportTime = new Date(report.timestamp);
      expect(reportTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(reportTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should include summary with all required fields', async () => {
      const summary: FailureSummary = {
        discovered: 20,
        attempted: 18,
        skippedValid: 2,
        succeeded: 15,
        failed: 3,
        failRate: 0.15,
        failThreshold: 0.5,
        verdict: 'PASS',
      };

      await writeFailureReport(testDir, 'run-1', summary, []);

      const reportPath = join(
        testDir,
        '.vsco-backup',
        'logs',
        'download-failures-run-1.json'
      );
      const content = await readFile(reportPath, 'utf-8');
      const report = JSON.parse(content);

      expect(report.summary).toEqual(summary);
      expect(report.summary.discovered).toBe(20);
      expect(report.summary.attempted).toBe(18);
      expect(report.summary.skippedValid).toBe(2);
      expect(report.summary.succeeded).toBe(15);
      expect(report.summary.failed).toBe(3);
      expect(report.summary.failRate).toBe(0.15);
      expect(report.summary.failThreshold).toBe(0.5);
      expect(report.summary.verdict).toBe('PASS');
    });

    it('should include failure entries with all required fields', async () => {
      const summary: FailureSummary = {
        discovered: 2,
        attempted: 2,
        skippedValid: 0,
        succeeded: 1,
        failed: 1,
        failRate: 0.5,
        failThreshold: 0.5,
        verdict: 'FAIL',
      };

      const failures: FailureEntry[] = [
        {
          mediaId: 'media-001',
          originalUrl: 'https://im.vsco.co/image.jpg',
          normalizedUrl: 'https://im.vsco.co/image.jpg',
          nodeAttempt: {
            status: 403,
            contentType: 'text/html',
            snippetMarker: 'Cloudflare',
          },
          playwrightAttempt: {
            status: 403,
            contentType: 'text/html',
            snippetMarker: 'Cloudflare',
          },
          errorMessage: 'Blocked by Cloudflare after fallback',
          timestamp: new Date().toISOString(),
          manualRecovery: [
            'Open URL in browser: https://im.vsco.co/image.jpg',
            'Open profile in browser → DevTools Network → filter by mediaId: media-001',
          ],
        },
      ];

      await writeFailureReport(testDir, 'run-2', summary, failures);

      const reportPath = join(
        testDir,
        '.vsco-backup',
        'logs',
        'download-failures-run-2.json'
      );
      const content = await readFile(reportPath, 'utf-8');
      const report = JSON.parse(content);

      expect(report.failures).toHaveLength(1);
      const failure = report.failures[0];

      expect(failure.mediaId).toBe('media-001');
      expect(failure.originalUrl).toBe('https://im.vsco.co/image.jpg');
      expect(failure.normalizedUrl).toBe('https://im.vsco.co/image.jpg');
      expect(failure.nodeAttempt.status).toBe(403);
      expect(failure.nodeAttempt.contentType).toBe('text/html');
      expect(failure.nodeAttempt.snippetMarker).toBe('Cloudflare');
      expect(failure.playwrightAttempt.status).toBe(403);
      expect(failure.playwrightAttempt.contentType).toBe('text/html');
      expect(failure.playwrightAttempt.snippetMarker).toBe('Cloudflare');
      expect(failure.errorMessage).toBe('Blocked by Cloudflare after fallback');
      expect(failure.timestamp).toBeDefined();
      expect(failure.manualRecovery).toHaveLength(2);
    });

    it('should write valid JSON that can be parsed', async () => {
      const summary: FailureSummary = {
        discovered: 3,
        attempted: 3,
        skippedValid: 0,
        succeeded: 2,
        failed: 1,
        failRate: 0.333,
        failThreshold: 0.5,
        verdict: 'PASS',
      };

      const failures: FailureEntry[] = [
        {
          mediaId: 'test-media',
          originalUrl: 'https://example.com/image.jpg',
          normalizedUrl: 'https://example.com/image.jpg',
          nodeAttempt: { status: 500 },
          playwrightAttempt: { status: 500 },
          errorMessage: 'Server error',
          timestamp: new Date().toISOString(),
          manualRecovery: ['Try again later'],
        },
      ];

      await writeFailureReport(testDir, 'run-3', summary, failures);

      const reportPath = join(
        testDir,
        '.vsco-backup',
        'logs',
        'download-failures-run-3.json'
      );
      const content = await readFile(reportPath, 'utf-8');

      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should write pretty-printed JSON with indentation', async () => {
      const summary: FailureSummary = {
        discovered: 1,
        attempted: 1,
        skippedValid: 0,
        succeeded: 1,
        failed: 0,
        failRate: 0,
        failThreshold: 0.5,
        verdict: 'PASS',
      };

      await writeFailureReport(testDir, 'run-4', summary, []);

      const reportPath = join(
        testDir,
        '.vsco-backup',
        'logs',
        'download-failures-run-4.json'
      );
      const content = await readFile(reportPath, 'utf-8');

      expect(content).toContain('\n');
      expect(content).toContain('  ');
    });

    it('should handle multiple failure entries', async () => {
      const summary: FailureSummary = {
        discovered: 5,
        attempted: 5,
        skippedValid: 0,
        succeeded: 2,
        failed: 3,
        failRate: 0.6,
        failThreshold: 0.5,
        verdict: 'FAIL',
      };

      const failures: FailureEntry[] = [
        {
          mediaId: 'media-1',
          originalUrl: 'https://im.vsco.co/1.jpg',
          normalizedUrl: 'https://im.vsco.co/1.jpg',
          nodeAttempt: { status: 403 },
          playwrightAttempt: { status: 403 },
          errorMessage: 'Blocked',
          timestamp: new Date().toISOString(),
          manualRecovery: ['Open in browser'],
        },
        {
          mediaId: 'media-2',
          originalUrl: 'https://im.vsco.co/2.jpg',
          normalizedUrl: 'https://im.vsco.co/2.jpg',
          nodeAttempt: { status: 500 },
          playwrightAttempt: { status: 500 },
          errorMessage: 'Server error',
          timestamp: new Date().toISOString(),
          manualRecovery: ['Retry later'],
        },
        {
          mediaId: 'media-3',
          originalUrl: 'https://im.vsco.co/3.jpg',
          normalizedUrl: 'https://im.vsco.co/3.jpg',
          nodeAttempt: { status: 404 },
          playwrightAttempt: { status: 404 },
          errorMessage: 'Not found',
          timestamp: new Date().toISOString(),
          manualRecovery: ['Check URL'],
        },
      ];

      await writeFailureReport(testDir, 'run-5', summary, failures);

      const reportPath = join(
        testDir,
        '.vsco-backup',
        'logs',
        'download-failures-run-5.json'
      );
      const content = await readFile(reportPath, 'utf-8');
      const report = JSON.parse(content);

      expect(report.failures).toHaveLength(3);
      expect(report.failures[0].mediaId).toBe('media-1');
      expect(report.failures[1].mediaId).toBe('media-2');
      expect(report.failures[2].mediaId).toBe('media-3');
    });

    it('should handle empty failures array', async () => {
      const summary: FailureSummary = {
        discovered: 10,
        attempted: 10,
        skippedValid: 0,
        succeeded: 10,
        failed: 0,
        failRate: 0,
        failThreshold: 0.5,
        verdict: 'PASS',
      };

      await writeFailureReport(testDir, 'run-6', summary, []);

      const reportPath = join(
        testDir,
        '.vsco-backup',
        'logs',
        'download-failures-run-6.json'
      );
      const content = await readFile(reportPath, 'utf-8');
      const report = JSON.parse(content);

      expect(report.failures).toEqual([]);
    });

    it('should not throw on write error', async () => {
      const summary: FailureSummary = {
        discovered: 1,
        attempted: 1,
        skippedValid: 0,
        succeeded: 1,
        failed: 0,
        failRate: 0,
        failThreshold: 0.5,
        verdict: 'PASS',
      };

      const invalidDir = '/invalid/path/that/does/not/exist';

      await expect(
        writeFailureReport(invalidDir, 'run-7', summary, [])
      ).resolves.not.toThrow();
    });
  });

  describe('generateManualRecovery', () => {
    it('should generate recovery guidance with original URL', () => {
      const failure: FailureEntry = {
        mediaId: 'media-001',
        originalUrl: 'https://im.vsco.co/image.jpg',
        normalizedUrl: 'https://im.vsco.co/image.jpg',
        nodeAttempt: { status: 403 },
        playwrightAttempt: { status: 403 },
        errorMessage: 'Blocked',
        timestamp: new Date().toISOString(),
        manualRecovery: [],
      };

      const guidance = generateManualRecovery(failure);

      expect(guidance).toHaveLength(2);
      expect(guidance[0]).toContain('Open URL in browser');
      expect(guidance[0]).toContain('https://im.vsco.co/image.jpg');
    });

    it('should generate recovery guidance with mediaId filter', () => {
      const failure: FailureEntry = {
        mediaId: 'test-media-123',
        originalUrl: 'https://example.com/image.jpg',
        normalizedUrl: 'https://example.com/image.jpg',
        nodeAttempt: { status: 403 },
        playwrightAttempt: { status: 403 },
        errorMessage: 'Blocked',
        timestamp: new Date().toISOString(),
        manualRecovery: [],
      };

      const guidance = generateManualRecovery(failure);

      expect(guidance).toHaveLength(2);
      expect(guidance[1]).toContain('DevTools Network');
      expect(guidance[1]).toContain('test-media-123');
    });

    it('should return array with two guidance items', () => {
      const failure: FailureEntry = {
        mediaId: 'media-xyz',
        originalUrl: 'https://im.vsco.co/xyz.jpg',
        normalizedUrl: 'https://im.vsco.co/xyz.jpg',
        nodeAttempt: { status: 403 },
        playwrightAttempt: { status: 403 },
        errorMessage: 'Blocked',
        timestamp: new Date().toISOString(),
        manualRecovery: [],
      };

      const guidance = generateManualRecovery(failure);

      expect(Array.isArray(guidance)).toBe(true);
      expect(guidance.length).toBe(2);
    });

    it('should include actionable recovery steps', () => {
      const failure: FailureEntry = {
        mediaId: 'media-abc',
        originalUrl: 'https://im.vsco.co/abc.jpg',
        normalizedUrl: 'https://im.vsco.co/abc.jpg',
        nodeAttempt: { status: 403 },
        playwrightAttempt: { status: 403 },
        errorMessage: 'Blocked',
        timestamp: new Date().toISOString(),
        manualRecovery: [],
      };

      const guidance = generateManualRecovery(failure);

      expect(guidance[0]).toMatch(/Open URL in browser/);
      expect(guidance[1]).toMatch(/DevTools Network/);
    });
  });
});
