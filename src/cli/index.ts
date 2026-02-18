import { Command } from 'commander';

const program = new Command();

program
  .name('vsco-backup')
  .description('CLI tool to backup VSCO profiles')
  .version('0.1.0');

program
  .command('backup <username>')
  .description('Backup a VSCO profile')
  .option('-o, --output <path>', 'Output directory for backup', './backups')
  .action((username: string, options: { output: string }) => {
    console.log(`Backing up VSCO profile: ${username}`);
    console.log(`Output directory: ${options.output}`);
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
