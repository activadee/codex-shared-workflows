import { Command } from 'commander';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CodexClient } from '../lib/codex';
import { loadActionContext, parseRepo } from '../lib/context';
import { createOrUpdateRelease, listRecentCommits } from '../lib/github';
import { runGoTests } from '../lib/go';
import { logger } from '../lib/logger';
import { renderTemplateFile } from '../lib/templates';

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
  enableNetwork?: boolean;
  enableWebSearch?: boolean;
  projectName?: string;
  projectLanguage?: string;
  packageName?: string;
  projectPurpose?: string;
  repositoryUrl?: string;
  repo?: string;
}

const RELEASE_SCHEMA = 'prompts/codex-release-schema.json';

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
    .option('--prompt <path>', 'Prompt file path for release notes', 'prompts/codex-release-template.md')
    .option('--model <name>', 'Codex model override')
    .option('--effort <level>', 'Codex reasoning effort override')
    .option('--codex-bin <path>', 'Override Codex binary path for the SDK', 'codex')
    .option('--enable-network', 'Allow Codex outbound network access', false)
    .option('--enable-web-search', 'Allow Codex to run web searches', false)
    .option('--notes-extra <markdown>', 'Extra markdown context appended to Codex input')
    .option('--project-name <text>', 'Project name referenced in the prompt', 'Codex Go SDK')
    .option('--project-language <text>', 'Primary language referenced in the prompt', 'Go')
    .option('--package-name <text>', 'Package/module identifier referenced in the prompt', 'github.com/activadee/godex')
    .option('--project-purpose <text>', 'One-line description of the project purpose', 'Provides a wrapper around the Codex CLI.')
    .option('--repository-url <text>', 'Repository URL or identifier referenced in the prompt', 'https://github.com/activadee/godex')
    .option('--commit-limit <number>', 'Number of commits to include', (value) => Number.parseInt(value, 10), 50)
    .option('--dry-run', 'Print notes without publishing release', false)
    .option('--repo <owner/repo>', 'Override repository when running locally')
    .action(async (opts: ReleaseOptions) => {
      const repoOverride = opts.repo ? parseRepo(opts.repo) : undefined;
      const ctx = loadActionContext({ repo: repoOverride });

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
      const templatePath = path.resolve(opts.prompt);
      const { promptPath, cleanup } = renderReleasePrompt(templatePath, buildReleasePromptVariables(opts));
      let notes: string;
      try {
        notes = await codex.run({
          promptPath,
          input,
          model: opts.model,
          effort: opts.effort,
          outputSchemaPath: path.resolve(RELEASE_SCHEMA),
          networkAccessEnabled: Boolean(opts.enableNetwork),
          webSearchEnabled: Boolean(opts.enableWebSearch)
        });
      } finally {
        cleanup();
      }
      const releaseBody = formatReleaseBody(notes);

      if (opts.dryRun) {
        logger.info('Generated release notes (dry-run):');
        logger.info(releaseBody);
        return;
      }

      const url = await createOrUpdateRelease(ctx, {
        tag: opts.tagName,
        target: opts.target,
        releaseName: opts.releaseTitle,
        body: releaseBody,
        draft: opts.draft
      });

      logger.info(`Release ready at ${url}`);
    });
};

const formatReleaseBody = (raw: string) => {
  try {
    const parsed = JSON.parse(raw) as { overview?: string; highlights?: string[] };
    const overview = parsed.overview?.trim() ?? 'No overview provided.';
    const highlights = Array.isArray(parsed.highlights) && parsed.highlights.length
      ? parsed.highlights.map((item) => `- ${item}`).join('\n')
      : '- Update details unavailable.';

    return [`${overview}`, '', '## Highlights', highlights].join('\n');
  } catch (error) {
    logger.warn('Failed to parse structured release notes; using raw output.', {
      message: (error as Error).message
    });
    return raw;
  }
};

const buildReleasePromptVariables = (opts: ReleaseOptions): Record<string, string> => ({
  '{{PROJECT_NAME}}': opts.projectName ?? 'Codex Go SDK',
  '{{PROJECT_LANGUAGE}}': opts.projectLanguage ?? 'Go',
  '{{PACKAGE_NAME}}': opts.packageName ?? 'github.com/activadee/godex',
  '{{PROJECT_PURPOSE}}': opts.projectPurpose ?? 'Provides a wrapper around the Codex CLI.',
  '{{REPOSITORY_URL}}': opts.repositoryUrl ?? 'https://github.com/activadee/godex'
});

const renderReleasePrompt = (templatePath: string, variables: Record<string, string>) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-release-'));
  const promptPath = path.join(tempDir, 'prompt.md');
  renderTemplateFile({ templatePath, outputPath: promptPath, variables });
  const cleanup = () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  };
  return { promptPath, cleanup };
};
