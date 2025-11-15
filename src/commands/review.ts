import { Command } from 'commander';
import path from 'node:path';
import { CodexClient } from '../lib/codex';
import { loadActionContext, parseRepo, readEventPayload } from '../lib/context';
import {
  createReview,
  fetchPullRequest,
  listPullRequestFiles,
  requirePullRequestNumber,
  type PullRequestEventPayload
} from '../lib/github';
import { logger } from '../lib/logger';

const REVIEW_SCHEMA = 'prompts/codex-review-schema.json';

interface ReviewOptions {
  prompt: string;
  promptExtra?: string;
  model?: string;
  effort?: string;
  codexBin?: string;
  dryRun?: boolean;
  eventPath?: string;
  pullNumber?: number;
  enableNetwork?: boolean;
  enableWebSearch?: boolean;
  repo?: string;
}

const buildCodexInput = async (
  options: ReviewOptions,
  event: PullRequestEventPayload,
  ctx: ReturnType<typeof loadActionContext>
) => {
  const pullNumber = options.pullNumber ?? requirePullRequestNumber(event);
  const pr = await fetchPullRequest(ctx, pullNumber);
  const files = await listPullRequestFiles(ctx, pullNumber);

  const fileSummaries = files
    .map((file) => {
      const header = `### ${file.filename} (${file.status}${file.changes ? `, ±${file.changes}` : ''})`;
      const patch = file.patch ? `\n\n\`\`\`diff\n${file.patch}\n\`\`\`` : '';
      return `${header}${patch}`;
    })
    .join('\n\n');

  const metadata = [
    `Title: ${pr.title}`,
    `Author: ${pr.user?.login ?? 'unknown'}`,
    `Base: ${pr.base?.ref}`,
    `Head: ${pr.head?.label}`,
    `URL: ${pr.html_url}`,
    pr.body ? `Body:\n${pr.body}` : undefined
  ]
    .filter(Boolean)
    .join('\n\n');

  const guidance = options.promptExtra
    ? `\n\n### Additional Reviewer Guidance\n${options.promptExtra}`
    : '';

  return `${metadata}${guidance}\n\n---\n\n${fileSummaries}`;
};

const formatReviewResponse = (raw: string) => {
  try {
    const parsed = JSON.parse(raw) as {
      summary?: string;
      comments?: Array<{ path: string; line: number; body: string }>;
    };
    const summary = parsed.summary?.trim() || 'No issues detected.';
    const comments = Array.isArray(parsed.comments) ? parsed.comments : [];
    const findings = comments.length
      ? comments
        .map((comment) => `- \`${comment.path}:${comment.line}\`\n  ${comment.body}`)
        .join('\n')
      : '- ✅ No blocking findings.';

    return [`## Summary`, summary, '', '## Findings', findings].join('\n');
  } catch (error) {
    logger.warn('Failed to parse structured review output; returning raw text.', {
      message: (error as Error).message
    });
    return raw;
  }
};

export const registerReviewCommand = (program: Command) => {
  program
    .command('review')
    .description('Run the Codex PR review workflow')
    .option('--prompt <path>', 'Prompt file to use', 'prompts/codex-review.md')
    .option('--prompt-extra <markdown>', 'Additional markdown appended to the prompt')
    .option('--model <name>', 'Codex model override')
    .option('--effort <level>', 'Codex reasoning effort override')
    .option('--codex-bin <path>', 'Override Codex binary path for the SDK', 'codex')
    .option('--enable-network', 'Allow Codex outbound network access', false)
    .option('--enable-web-search', 'Allow Codex to run web searches', false)
    .option('--dry-run', 'Only print the Codex output without submitting a review', false)
    .option('--event-path <path>', 'Path to a GitHub event payload override')
    .option('--pull-number <number>', 'Explicit pull request number override', (value) =>
      Number.parseInt(value, 10)
    )
    .option('--repo <owner/repo>', 'Override repository when running locally')
    .action(async (opts: ReviewOptions) => {
      const repoOverride = opts.repo ? parseRepo(opts.repo) : undefined;
      const ctx = loadActionContext({ eventPath: opts.eventPath, repo: repoOverride });
      const event = readEventPayload<PullRequestEventPayload>(ctx.eventPath) ?? {};
      const input = await buildCodexInput(opts, event, ctx);

      const codex = new CodexClient(opts.codexBin);
      const output = await codex.run({
        promptPath: path.resolve(opts.prompt),
        input,
        model: opts.model,
        effort: opts.effort,
        outputSchemaPath: path.resolve(REVIEW_SCHEMA),
        networkAccessEnabled: Boolean(opts.enableNetwork),
        webSearchEnabled: Boolean(opts.enableWebSearch)
      });
      const body = formatReviewResponse(output);

      if (opts.dryRun) {
        logger.info('Codex output (dry-run):');
        logger.info(output);
        return;
      }

      const pullNumber = opts.pullNumber ?? requirePullRequestNumber(event);
      await createReview(ctx, pullNumber, body);
      logger.info(`Submitted review for PR #${pullNumber}`);
    });
};
