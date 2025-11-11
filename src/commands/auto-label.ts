import { Command } from 'commander';
import path from 'node:path';
import { CodexClient } from '../lib/codex';
import { loadActionContext, readEventPayload } from '../lib/context';
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
  codexArgs?: string;
  codexBin?: string;
  dryRun?: boolean;
  eventPath?: string;
}

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
    .option('--prompt <path>', 'Prompt file path', '.github/prompts/codex-auto-label.md')
    .option('--max-labels <number>', 'Maximum labels to apply', (value) => Number.parseInt(value, 10), 3)
    .option('--model <name>', 'Codex model override')
    .option('--effort <level>', 'Codex effort override')
    .option('--codex-args <args>', 'Legacy Codex CLI flags (ignored when using the SDK)')
    .option('--codex-bin <path>', 'Override Codex binary path for the SDK', 'codex')
    .option('--dry-run', 'Print suggested labels without applying', false)
    .option('--event-path <path>', 'Event payload override')
    .action(async (opts: AutoLabelOptions) => {
      const ctx = loadActionContext({ eventPath: opts.eventPath });
      const payload = readEventPayload<IssueEventPayload>(ctx.eventPath) ?? {};
      const input = buildInput(payload);
      if (opts.codexArgs) {
        logger.warn('codexArgs are not supported when using the Codex SDK and will be ignored.');
      }
      const codex = new CodexClient(opts.codexBin);
      const raw = await codex.run({
        promptPath: path.resolve(opts.prompt),
        input,
        model: opts.model,
        effort: opts.effort
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
