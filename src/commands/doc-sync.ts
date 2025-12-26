import { Command } from 'commander';
import { getContext, requireRepo } from '../lib/context.js';
import { getPRDetails, getLocalDiff, ensureGhCli, ensureGhAuth } from '../lib/github.js';
import { ensureOpenCode, startServer, runOpenCode, stopServer } from '../lib/opencode.js';
import { loadPrompt } from '../lib/prompts.js';
import { log, banner } from '../lib/logger.js';
import type { CommandOptions } from '../types.js';

export const docSyncCommand = new Command('doc-sync')
  .description('Sync documentation with code changes')
  .option('-p, --pr <number>', 'PR number')
  .option('-r, --repo <owner/repo>', 'Repository (owner/repo)')
  .option('-m, --model <model>', 'AI model to use', 'minimax/MiniMax-M2.1')
  .option('-l, --local', 'Sync docs for local changes')
  .option('--dry-run', 'Print suggested changes without applying')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options: CommandOptions) => {
    banner();

    try {
      const ctx = getContext(options);

      await ensureOpenCode();
      await startServer();

      let diff: string;

      if (options.local || ctx.mode === 'local') {
        log.info('Syncing docs for local changes...');
        diff = getLocalDiff();
      } else {
        ensureGhCli();
        if (ctx.mode === 'manual') ensureGhAuth();

        const repo = requireRepo(ctx, options);
        const prNumber = options.pr ? parseInt(options.pr, 10) : ctx.prNumber;

        if (!prNumber) {
          throw new Error('PR number required. Use --pr <number> or run in PR context.');
        }

        const pr = getPRDetails(repo, prNumber);
        diff = pr.diff;
      }

      if (!diff) {
        log.warn('No changes detected');
        return;
      }

      const prompt = loadPrompt('doc-sync', {}) + `

## Code Changes

\`\`\`diff
${diff}
\`\`\`
`;

      const bashPerms: Record<string, 'allow' | 'deny'> = options.dryRun
        ? { '*': 'deny' }
        : { 'git commit*': 'allow', 'git push*': 'allow', '*': 'deny' };
      const permissions = {
        bash: bashPerms,
        write: !options.dryRun,
        edit: !options.dryRun,
      };

      const result = await runOpenCode({
        model: options.model || 'minimax/MiniMax-M2.1',
        prompt,
        permissions,
        onEvent: options.verbose
          ? (event) => log.dim(JSON.stringify(event))
          : undefined,
      });

      if (options.dryRun) {
        console.log('\n--- DRY RUN OUTPUT ---\n');
        console.log(result);
      } else {
        log.success('Documentation synced!');
      }
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    } finally {
      await stopServer();
    }
  });
