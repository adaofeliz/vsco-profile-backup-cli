import { Command } from 'commander';
import { join } from 'path';
import type { CliOptions, CliResult } from './types.js';
import { orchestrateBackup } from '../core/index.js';
import { getLogger } from '../utils/logger.js';

function parseAndValidateUrl(urlString: string): { username: string; normalized: string } {
  try {
    const url = new URL(urlString);

    if (url.hostname !== 'vsco.co') {
      throw new Error(`Expected vsco.co domain, got ${url.hostname}`);
    }

    const pathname = url.pathname.replace(/^\//, '').replace(/\/$/, '');
    if (!pathname) {
      throw new Error('URL must include a username (e.g., https://vsco.co/username)');
    }

    const username = pathname.split('/')[0];
    if (!username || !/^[a-zA-Z0-9_-]+$/.test(username)) {
      throw new Error(`Invalid username format: ${username}`);
    }

    const normalized = `https://vsco.co/${username}`;
    return { username, normalized };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid VSCO profile URL: ${message}`);
  }
}

function parseAndValidateTimeout(value: string): number {
  const parsed = parseInt(value, 10);
  
  if (isNaN(parsed)) {
    throw new Error(`--timeout-ms must be a number, got: ${value}`);
  }
  
  if (!Number.isInteger(parsed)) {
    throw new Error(`--timeout-ms must be an integer, got: ${value}`);
  }
  
  const MIN_TIMEOUT = 1;
  const MAX_TIMEOUT = 300000; // 300 seconds
  
  if (parsed < MIN_TIMEOUT) {
    throw new Error(`--timeout-ms must be at least ${MIN_TIMEOUT}ms, got: ${parsed}`);
  }
  
  if (parsed > MAX_TIMEOUT) {
    console.warn(`Warning: --timeout-ms ${parsed}ms exceeds maximum of ${MAX_TIMEOUT}ms, capping to ${MAX_TIMEOUT}ms`);
    return MAX_TIMEOUT;
  }
  
  return parsed;
}

function run(): void {
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
    .option('--timeout-ms <number>', 'Navigation and selector timeout in milliseconds (default: 90000, max: 300000)', (value: string) => parseAndValidateTimeout(value))
    .option('--headful', 'Run browser in headful mode (default: headless)')
    .action(async (profileUrl: string, options: CliOptions) => {
      try {
        const { username, normalized } = parseAndValidateUrl(profileUrl);
        const backupRoot = join(options.outRoot, username);

        const result: CliResult = {
          username,
          profileUrlNormalized: normalized,
          backupRoot,
        };

        getLogger({ verbose: options.verbose });

        if (options.verbose) {
          console.log('Parsed CLI arguments:');
          console.log(`  Username: ${result.username}`);
          console.log(`  Profile URL: ${result.profileUrlNormalized}`);
          console.log(`  Backup root: ${result.backupRoot}`);
          if (options.timeoutMs) {
            console.log(`  Timeout: ${options.timeoutMs}ms`);
          }
          if (options.maxScrolls) {
            console.log(`  Max scrolls: ${options.maxScrolls}`);
          }
          if (options.maxItems) {
            console.log(`  Max items: ${options.maxItems}`);
          }
          if (options.headful) {
            console.log(`  Headful mode: enabled`);
          }
        }

        await orchestrateBackup(username, options.outRoot, {
          timeoutMs: options.timeoutMs,
          maxScrollCycles: options.maxScrolls,
          maxItems: options.maxItems,
          headless: !options.headful
        });

        process.exit(0);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${message}`);
        console.error(`\nUsage: vsco-backup <profileUrl> [--out-root <dir>] [--verbose] [--timeout-ms <number>]`);
        console.error(`Example: vsco-backup "https://vsco.co/foo" --out-root /tmp/vsco --timeout-ms 120000`);
        process.exit(1);
      }
    });

  program.parse(process.argv);

  if (!process.argv.slice(2).length) {
    program.outputHelp();
    process.exit(0);
  }
}

run();
