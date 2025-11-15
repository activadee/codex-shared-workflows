import { Command } from 'commander';
import path from 'node:path';
import { CodexClient } from '../lib/codex';
import { loadActionContext, parseRepo, readEventPayload } from '../lib/context';
import {
  addLabelsToIssue,
  ensureLabelsExist,
  requireIssueNumber,
  type IssueEventPayload
} from '../lib/github';
import { logger } from '../lib/logger';

interface AutoLabelOptions {
  prompt: string;
  maxLabels: number;
  model?: string;
  effort?: string;
  codexBin?: string;
  dryRun?: boolean;
  eventPath?: string;
  enableNetwork?: boolean;
  enableWebSearch?: boolean;
  repo?: string;
}

const AUTO_LABEL_SCHEMA = 'prompts/codex-auto-label-schema.json';

const buildInput = (payload: IssueEventPayload) => {
  const title = payload.issue?.title ?? 'Untitled';
  const body = payload.issue?.body ?? 'No description provided';
  const type = payload.issue?.pull_request ? 'pull request' : 'issue';
  return `Title: ${title}\nType: ${type}\n---\n${body}`;
};

const parseLabels = (raw: string, limit: number) => {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((label) => String(label).trim())
        .filter(Boolean)
        .slice(0, limit);
    }
  } catch (error) {
    logger.warn('Failed to parse Codex JSON output, falling back to line parsing', {
      message: (error as Error).message
    });
  }

  return raw
    .split(/[,\n]/)
    .map((label) => label.trim())
    .filter(Boolean)
    .slice(0, limit);
};

export const registerAutoLabelCommand = (program: Command) => {
  program
    .command('auto-label')
    .description('Suggest and apply labels using Codex output')
    .option('--prompt <path>', 'Prompt file path', 'prompts/codex-auto-label.md')
    .option('--max-labels <number>', 'Maximum labels to apply', (value) => Number.parseInt(value, 10), 3)
    .option('--model <name>', 'Codex model override')
    .option('--effort <level>', 'Codex effort override')
    .option('--codex-bin <path>', 'Override Codex binary path for the SDK', 'codex')
    .option('--enable-network', 'Allow Codex outbound network access', false)
    .option('--enable-web-search', 'Allow Codex to run web searches', false)
    .option('--dry-run', 'Print suggested labels without applying', false)
    .option('--event-path <path>', 'Event payload override')
    .option('--repo <owner/repo>', 'Override repository when running locally')
    .action(async (opts: AutoLabelOptions) => {
      const repoOverride = opts.repo ? parseRepo(opts.repo) : undefined;
      const ctx = loadActionContext({ eventPath: opts.eventPath, repo: repoOverride });
      const payload = readEventPayload<IssueEventPayload>(ctx.eventPath) ?? {};
      const input = buildInput(payload);
      const codex = new CodexClient(opts.codexBin);
      const raw = await codex.run({
        promptPath: path.resolve(opts.prompt),
        input,
        model: opts.model,
        effort: opts.effort,
        outputSchemaPath: path.resolve(AUTO_LABEL_SCHEMA),
        networkAccessEnabled: Boolean(opts.enableNetwork),
        webSearchEnabled: Boolean(opts.enableWebSearch)
      });
      const labels = parseLabels(raw, opts.maxLabels);

      if (!labels.length) {
        logger.info('Codex did not return any labels. Nothing to do.');
        return;
      }

      if (opts.dryRun) {
        logger.info(`Suggested labels: ${labels.join(', ')}`);
        return;
      }

      const issueNumber = requireIssueNumber(payload);
      await ensureLabelsExist(ctx, labels);
      await addLabelsToIssue(ctx, issueNumber, labels);
      logger.info(`Applied labels to #${issueNumber}: ${labels.join(', ')}`);
    });
};
