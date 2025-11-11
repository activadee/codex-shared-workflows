import { Command } from 'commander';
import path from 'node:path';
import { CodexClient } from '../lib/codex';
import { loadActionContext } from '../lib/context';
import { createOrUpdateRelease, listRecentCommits } from '../lib/github';
import { runGoTests } from '../lib/go';
import { logger } from '../lib/logger';

interface ReleaseOptions {
  tagName: string;
  releaseTitle?: string;
  target?: string;
  draft?: boolean;
  skipTests?: boolean;
  goVersion?: string;
  goVersionFile?: string;
  testFlags?: string;
  preTest?: string;
  prompt: string;
  model?: string;
  effort?: string;
  codexArgs?: string;
  codexBin?: string;
  notesExtra?: string;
  commitLimit?: number;
  dryRun?: boolean;
}

const buildNotesInput = (commits: unknown[], extra?: string) => {
  const commitLines = commits
    .map((commit: any) => `- ${commit.sha?.slice(0, 7)} ${commit.commit?.message?.split('\n')[0] ?? ''}`)
    .join('\n');

  const extraBlock = extra ? `\n\n### Extra Context\n${extra}` : '';
  return `## Commits\n${commitLines}${extraBlock}`;
};

export const registerReleaseCommand = (program: Command) => {
  program
    .command('release')
    .description('Generate release notes with Codex and publish a GitHub release')
    .requiredOption('--tag-name <tag>', 'Tag to publish (e.g. v1.2.3)')
    .option('--release-title <title>', 'Release display name (defaults to tag)')
    .option('--target <ref>', 'Target ref/commit for the release', 'main')
    .option('--draft', 'Create the release as a draft', false)
    .option('--skip-tests', 'Skip Go test execution', false)
    .option('--go-version <version>', 'Explicit Go version to install')
    .option('--go-version-file <path>', 'File with Go version (default go.mod)')
    .option('--test-flags <flags>', 'Flags forwarded to go test (default ./...)')
    .option('--pre-test <script>', 'Shell snippet executed before go test')
    .option('--prompt <path>', 'Prompt file path for release notes', '.github/prompts/codex-release-template.md')
    .option('--model <name>', 'Codex model override')
    .option('--effort <level>', 'Codex reasoning effort override')
    .option('--codex-args <args>', 'Legacy Codex CLI flags (ignored when using the SDK)')
    .option('--codex-bin <path>', 'Override Codex binary path for the SDK', 'codex')
    .option('--notes-extra <markdown>', 'Extra markdown context appended to Codex input')
    .option('--commit-limit <number>', 'Number of commits to include', (value) => Number.parseInt(value, 10), 50)
    .option('--dry-run', 'Print notes without publishing release', false)
    .action(async (opts: ReleaseOptions) => {
      const ctx = loadActionContext();

      if (!opts.skipTests) {
        await runGoTests({
          goVersion: opts.goVersion,
          goVersionFile: opts.goVersionFile,
          testFlags: opts.testFlags,
          preTest: opts.preTest
        });
      } else {
        logger.info('Skipping Go tests');
      }

      const commits = await listRecentCommits(ctx, { target: opts.target, limit: opts.commitLimit });
      const input = buildNotesInput(commits, opts.notesExtra);
      if (opts.codexArgs) {
        logger.warn('codexArgs are not supported when using the Codex SDK and will be ignored.');
      }
      const codex = new CodexClient(opts.codexBin);
      const notes = await codex.run({
        promptPath: path.resolve(opts.prompt),
        input,
        model: opts.model,
        effort: opts.effort
      });

      if (opts.dryRun) {
        logger.info('Generated release notes (dry-run):');
        logger.info(notes);
        return;
      }

      const url = await createOrUpdateRelease(ctx, {
        tag: opts.tagName,
        target: opts.target,
        releaseName: opts.releaseTitle,
        body: notes,
        draft: opts.draft
      });

      logger.info(`Release ready at ${url}`);
    });
};
