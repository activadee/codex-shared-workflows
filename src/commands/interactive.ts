import { Command } from 'commander';
import { getContext } from '../lib/context.js';
import { ensureOpenCode, startServer, runOpenCode, stopServer } from '../lib/opencode.js';
import { log, banner } from '../lib/logger.js';

interface InteractiveOptions {
  model?: string;
  verbose?: boolean;
}

export const interactiveCommand = new Command('interactive')
  .description('Handle slash commands from GitHub comments (/oc, /opencode)')
  .option('-m, --model <model>', 'AI model to use', 'minimax/MiniMax-M2.1')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options: InteractiveOptions) => {
    banner();

    try {
      const ctx = getContext({});

      if (ctx.mode !== 'ci') {
        throw new Error('Interactive mode only works in GitHub Actions');
      }

      const eventPayload = ctx.eventPayload as Record<string, unknown> | undefined;
      const comment = eventPayload?.comment as Record<string, unknown> | undefined;
      const commentBody = comment?.body as string | undefined;

      if (!commentBody) {
        throw new Error('No comment found in event payload');
      }

      // Extract command after /oc or /opencode
      const match = commentBody.match(/\/(?:oc|opencode)\s*(.*)/i);
      if (!match) {
        log.warn('No /oc or /opencode command found in comment');
        return;
      }

      const userPrompt = match[1].trim() || 'Help with this issue/PR';

      await ensureOpenCode();
      await startServer();

      const contextInfo = ctx.prNumber
        ? `This is PR #${ctx.prNumber} in ${ctx.repository}`
        : ctx.issueNumber
        ? `This is Issue #${ctx.issueNumber} in ${ctx.repository}`
        : `Repository: ${ctx.repository}`;

      const prompt = `
You are OpenCode, an AI assistant responding to a GitHub comment.

${contextInfo}

User request: ${userPrompt}

Respond helpfully and take any requested actions using the gh CLI.
`;

      await runOpenCode({
        model: options.model || 'minimax/MiniMax-M2.1',
        prompt,
        permissions: {
          bash: { 'gh*': 'allow', '*': 'deny' },
          write: true,
          edit: true,
        },
        onEvent: options.verbose
          ? (event) => log.dim(JSON.stringify(event))
          : undefined,
      });

      log.success('Interactive command handled!');
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    } finally {
      await stopServer();
    }
  });
