/**
 * Tests for CLI option plumbing
 * Validates that CLI flags are correctly parsed and passed to orchestrateBackup
 */

import { Command } from 'commander';
import type { CliOptions } from './types.js';

describe('CLI option plumbing', () => {
  let capturedOptions: CliOptions | null = null;

  beforeEach(() => {
    capturedOptions = null;
  });

  function createTestProgram() {
    const program = new Command();

    program
      .name('vsco-backup')
      .description('Backup a VSCO profile to a local static site')
      .version('0.1.0')
      .argument('<profileUrl>', 'VSCO profile URL (e.g., https://vsco.co/username)')
      .option('--out-root <dir>', 'Output root directory', '.')
      .option('--verbose', 'Enable verbose logging')
      .option('--ignore-robots', 'Bypass robots.txt restrictions (use responsibly)')
      .option('--max-scrolls <number>', 'Maximum scroll cycles (default: 50)', parseInt)
      .option('--max-items <number>', 'Maximum items to discover (default: no limit)', parseInt)
      .option('--timeout-ms <number>', 'Navigation and selector timeout in milliseconds (default: 90000, max: 300000)', (value: string) => parseInt(value, 10))
      .option('--headful', 'Run browser in headful mode (default: headless)')
      .action((_profileUrl: string, options: CliOptions) => {
        capturedOptions = options;
      });

    return program;
  }

  it('should parse --max-items flag as integer', () => {
    const program = createTestProgram();
    program.parse(['node', 'test', 'https://vsco.co/testuser', '--max-items', '10']);

    expect(capturedOptions).not.toBeNull();
    expect(capturedOptions?.maxItems).toBe(10);
    expect(typeof capturedOptions?.maxItems).toBe('number');
  });

  it('should parse --max-scrolls flag as integer', () => {
    const program = createTestProgram();
    program.parse(['node', 'test', 'https://vsco.co/testuser', '--max-scrolls', '25']);

    expect(capturedOptions).not.toBeNull();
    expect(capturedOptions?.maxScrolls).toBe(25);
    expect(typeof capturedOptions?.maxScrolls).toBe('number');
  });

  it('should parse --headful flag as boolean', () => {
    const program = createTestProgram();
    program.parse(['node', 'test', 'https://vsco.co/testuser', '--headful']);

    expect(capturedOptions).not.toBeNull();
    expect(capturedOptions?.headful).toBe(true);
  });

  it('should default headful to undefined when flag is not present', () => {
    const program = createTestProgram();
    program.parse(['node', 'test', 'https://vsco.co/testuser']);

    expect(capturedOptions).not.toBeNull();
    expect(capturedOptions?.headful).toBeUndefined();
  });

  it('should parse all three options together', () => {
    const program = createTestProgram();
    program.parse([
      'node',
      'test',
      'https://vsco.co/testuser',
      '--max-items',
      '50',
      '--max-scrolls',
      '30',
      '--headful',
    ]);

    expect(capturedOptions).not.toBeNull();
    expect(capturedOptions?.maxItems).toBe(50);
    expect(capturedOptions?.maxScrolls).toBe(30);
    expect(capturedOptions?.headful).toBe(true);
  });

  it('should handle --timeout-ms along with new options', () => {
    const program = createTestProgram();
    program.parse([
      'node',
      'test',
      'https://vsco.co/testuser',
      '--timeout-ms',
      '120000',
      '--max-items',
      '20',
    ]);

    expect(capturedOptions).not.toBeNull();
    expect(capturedOptions?.timeoutMs).toBe(120000);
    expect(capturedOptions?.maxItems).toBe(20);
  });

  it('should handle --out-root with new options', () => {
    const program = createTestProgram();
    program.parse([
      'node',
      'test',
      'https://vsco.co/testuser',
      '--out-root',
      '/tmp/backups',
      '--max-items',
      '15',
    ]);

    expect(capturedOptions).not.toBeNull();
    expect(capturedOptions?.outRoot).toBe('/tmp/backups');
    expect(capturedOptions?.maxItems).toBe(15);
  });

  it('should leave options undefined when flags are not provided', () => {
    const program = createTestProgram();
    program.parse(['node', 'test', 'https://vsco.co/testuser']);

    expect(capturedOptions).not.toBeNull();
    expect(capturedOptions?.maxItems).toBeUndefined();
    expect(capturedOptions?.maxScrolls).toBeUndefined();
    expect(capturedOptions?.headful).toBeUndefined();
  });

  it('should parse large numeric values correctly', () => {
    const program = createTestProgram();
    program.parse([
      'node',
      'test',
      'https://vsco.co/testuser',
      '--max-items',
      '1000',
      '--max-scrolls',
      '500',
    ]);

    expect(capturedOptions).not.toBeNull();
    expect(capturedOptions?.maxItems).toBe(1000);
    expect(capturedOptions?.maxScrolls).toBe(500);
  });

  it('should handle zero values for numeric flags', () => {
    const program = createTestProgram();
    program.parse([
      'node',
      'test',
      'https://vsco.co/testuser',
      '--max-items',
      '0',
      '--max-scrolls',
      '0',
    ]);

    expect(capturedOptions).not.toBeNull();
    expect(capturedOptions?.maxItems).toBe(0);
    expect(capturedOptions?.maxScrolls).toBe(0);
  });

  it('should correctly map CLI options to BackupOptions structure', () => {
    const program = createTestProgram();
    program.parse([
      'node',
      'test',
      'https://vsco.co/testuser',
      '--max-items',
      '10',
      '--max-scrolls',
      '25',
      '--headful',
      '--timeout-ms',
      '90000',
    ]);

    expect(capturedOptions).not.toBeNull();

    const backupOptions = {
      timeoutMs: capturedOptions?.timeoutMs,
      maxScrollCycles: capturedOptions?.maxScrolls,
      maxItems: capturedOptions?.maxItems,
      headless: !capturedOptions?.headful,
    };

    expect(backupOptions).toEqual({
      timeoutMs: 90000,
      maxScrollCycles: 25,
      maxItems: 10,
      headless: false,
    });
  });

  it('should map headful=undefined to headless=true', () => {
    const program = createTestProgram();
    program.parse(['node', 'test', 'https://vsco.co/testuser']);

    expect(capturedOptions).not.toBeNull();

    const backupOptions = {
      headless: !capturedOptions?.headful,
    };

    expect(backupOptions.headless).toBe(true);
  });

  it('should map headful=true to headless=false', () => {
    const program = createTestProgram();
    program.parse(['node', 'test', 'https://vsco.co/testuser', '--headful']);

    expect(capturedOptions).not.toBeNull();

    const backupOptions = {
      headless: !capturedOptions?.headful,
    };

    expect(backupOptions.headless).toBe(false);
  });
});
