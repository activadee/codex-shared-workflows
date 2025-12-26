import { Command } from 'commander';
import { getContext, requireRepo } from '../lib/context.js';
import { getPRDetails, getLocalDiff, ensureGhCli, ensureGhAuth } from '../lib/github.js';
import { ensureOpenCode, startServer, runOpenCode, stopServer } from '../lib/opencode.js';
import { loadPrompt } from '../lib/prompts.js';
import { log, banner } from '../lib/logger.js';
import type { CommandOptions } from '../types.js';

export const reviewCommand = new Command('review')
  .description('Review a pull request or local changes')
  .option('-p, --pr <number>', 'PR number to review')
  .option('-r, --repo <owner/repo>', 'Repository (owner/repo)')
  .option('-m, --model <model>', 'AI model to use', 'minimax/MiniMax-M2.1')
  .option('-l, --local', 'Review local git changes instead of a PR')
  .option('--dry-run', 'Print analysis without posting to GitHub')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options: CommandOptions) => {
    banner();

    try {
      const ctx = getContext(options);

      await ensureOpenCode();
      await startServer();

      let prompt: string;
      let commitSha: string | undefined;

      if (options.local || ctx.mode === 'local') {
        // Local mode: review git diff
        log.info('Reviewing local changes...');
        const diff = getLocalDiff();

        if (!diff) {
          log.warn('No changes detected');
          return;
        }

        prompt = loadPrompt('review', {}) + `\n\n## Changes to Review\n\n\`\`\`diff\n${diff}\n\`\`\``;
      } else {
        // PR mode: fetch from GitHub
        ensureGhCli();
        if (ctx.mode === 'manual') ensureGhAuth();

        const repo = requireRepo(ctx, options);
        const prNumber = options.pr ? parseInt(options.pr, 10) : ctx.prNumber;

        if (!prNumber) {
          throw new Error('PR number required. Use --pr <number> or run in PR context.');
        }

        const pr = getPRDetails(repo, prNumber);
        commitSha = pr.headSha;

        prompt = loadPrompt('review', {
          PR_NUMBER: prNumber,
          PR_TITLE: pr.title,
          PR_DESCRIPTION: pr.body,
          COMMIT_SHA: commitSha,
          REPO: repo,
        }) + `\n\n## PR Diff\n\n\`\`\`diff\n${pr.diff}\n\`\`\``;
      }

      // Set up permissions
      const bashPerms: Record<string, 'allow' | 'deny'> = options.dryRun
        ? { '*': 'deny' }
        : { 'gh*': 'allow', '*': 'deny' };
      const permissions = { bash: bashPerms };

      // Run analysis
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
        log.success('Review complete!');
      }
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    } finally {
      await stopServer();
    }
  });
