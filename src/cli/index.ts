import { Command } from 'commander';
import { join } from 'path';
import type { CliOptions, CliResult } from './types.js';

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
    .action((profileUrl: string, options: CliOptions) => {
      try {
        const { username, normalized } = parseAndValidateUrl(profileUrl);
        const backupRoot = join(options.outRoot, username);

        const result: CliResult = {
          username,
          profileUrlNormalized: normalized,
          backupRoot,
        };

        if (options.verbose) {
          console.log('Parsed CLI arguments:');
          console.log(`  Username: ${result.username}`);
          console.log(`  Profile URL: ${result.profileUrlNormalized}`);
          console.log(`  Backup root: ${result.backupRoot}`);
        } else {
          console.log(`Username: ${result.username}`);
          console.log(`Backup root: ${result.backupRoot}`);
        }

        process.exit(0);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${message}`);
        console.error(`\nUsage: vsco-backup <profileUrl> [--out-root <dir>] [--verbose]`);
        console.error(`Example: vsco-backup "https://vsco.co/foo" --out-root /tmp/vsco`);
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
