import { Command } from 'commander';
import { reviewCommand } from '../src/commands/review.js';
import { labelCommand } from '../src/commands/label.js';
import { docSyncCommand } from '../src/commands/doc-sync.js';
import { interactiveCommand } from '../src/commands/interactive.js';

const program = new Command();

program
  .name('open-workflows')
  .description('AI-powered GitHub automation - reviews, labeling, and doc sync')
  .version('1.0.0')
  .option('-v, --verbose', 'Show detailed output')
  .option('--dry-run', 'Print output without posting to GitHub');

program.addCommand(reviewCommand);
program.addCommand(labelCommand);
program.addCommand(docSyncCommand);
program.addCommand(interactiveCommand);

// Default action: show help
program.action(() => {
  program.help();
});

program.parse();
