import { Command } from 'commander';
import { getContext, requireRepo, requireIssue } from '../lib/context.js';
import { getIssueDetails, getRepoLabels, ensureGhCli, ensureGhAuth } from '../lib/github.js';
import { ensureOpenCode, startServer, runOpenCode, stopServer } from '../lib/opencode.js';
import { loadPrompt } from '../lib/prompts.js';
import { log, banner } from '../lib/logger.js';
import type { CommandOptions } from '../types.js';

export const labelCommand = new Command('label')
  .description('Automatically label a GitHub issue')
  .option('-i, --issue <number>', 'Issue number to label')
  .option('-r, --repo <owner/repo>', 'Repository (owner/repo)')
  .option('-m, --model <model>', 'AI model to use', 'minimax/MiniMax-M2.1')
  .option('--dry-run', 'Print suggested labels without applying')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options: CommandOptions) => {
    banner();

    try {
      const ctx = getContext(options);

      ensureGhCli();
      if (ctx.mode === 'manual') ensureGhAuth();

      const repo = requireRepo(ctx, options);
      const issueNumber = requireIssue(ctx, options);

      await ensureOpenCode();
      await startServer();

      // Get issue and labels
      const issue = getIssueDetails(repo, issueNumber);
      const availableLabels = getRepoLabels(repo);

      const prompt = loadPrompt('label', {
        ISSUE_NUMBER: issueNumber,
        REPO: repo,
      }) + `

## Issue Details

**Title:** ${issue.title}

**Body:**
${issue.body}

**Current Labels:** ${issue.labels.join(', ') || 'None'}

## Available Repository Labels

${availableLabels.join(', ')}
`;

      const bashPerms: Record<string, 'allow' | 'deny'> = options.dryRun
        ? { '*': 'deny' }
        : { 'gh issue*': 'allow', 'gh label*': 'allow', '*': 'deny' };
      const permissions = { bash: bashPerms };

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
        log.success(`Issue #${issueNumber} labeled!`);
      }
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    } finally {
      await stopServer();
    }
  });
