import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { CodexClient } from '../lib/codex';
import { loadActionContext, parseRepo, readEventPayload } from '../lib/context';
import { createIssueComment, requirePullRequestNumber, type PullRequestEventPayload } from '../lib/github';
import {
  DEFAULT_DOC_GLOBS,
  assertDocsOnlyChanged,
  classifyDiffFiles,
  collectCommitSummary,
  computeDocPatch,
  hasPendingChanges,
  parseDocPatterns,
  saveFileList,
  writeDocGlobsFile
} from '../lib/doc-sync';
import { renderTemplateFile } from '../lib/templates';
import { commitAll, ensureGitUser, getHeadSha, pushChanges } from '../lib/git';
import { logger } from '../lib/logger';

interface DocSyncOptions {
  docGlobs?: string;
  docGlob?: string[];
  docGlobsFile: string;
  promptTemplate: string;
  promptPath: string;
  reportPath: string;
  commitsPath: string;
  patchPath: string;
  filesPath: string;
  baseRef?: string;
  headRef?: string;
  headSha?: string;
  pullNumber?: number;
  codexBin?: string;
  model?: string;
  effort?: string;
  codexArgs?: string;
  safetyStrategy?: string;
  dryRun?: boolean;
  autoCommit?: boolean;
  autoPush?: boolean;
  comment?: boolean;
  eventPath?: string;
  enableNetwork?: boolean;
  enableWebSearch?: boolean;
  repo?: string;
}

const readFileOrDefault = (filePath: string, fallback: string) => {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  const contents = fs.readFileSync(filePath, 'utf8').trim();
  return contents || fallback;
};

const collectDocPatterns = (options: DocSyncOptions) => {
  if (options.docGlob?.length) {
    return parseDocPatterns(options.docGlob.join('\n'));
  }
  if (options.docGlobs) {
    return parseDocPatterns(options.docGlobs);
  }
  return [...DEFAULT_DOC_GLOBS];
};

const ensureGitIgnoreEntries = (paths: string[]) => {
  const excludePath = path.resolve('.git/info/exclude');
  fs.mkdirSync(path.dirname(excludePath), { recursive: true });
  const existing = fs.existsSync(excludePath)
    ? fs.readFileSync(excludePath, 'utf8').split(/\r?\n/).filter(Boolean)
    : [];
  const entries = new Set(existing);
  let changed = false;
  paths
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      if (!entries.has(entry)) {
        entries.add(entry);
        changed = true;
      }
    });
  if (changed) {
    fs.writeFileSync(excludePath, `${Array.from(entries).join('\n')}\n`, 'utf8');
  }
};

export const registerDocSyncCommand = (program: Command) => {
  program
    .command('doc-sync')
    .description('Run the documentation sync workflow end-to-end.')
    .option('--doc-globs <multiline>', 'Newline-separated glob list defining documentation scope')
    .option('--doc-glob <pattern>', 'Additional doc glob (can be repeated)', (value, prev: string[] = []) => {
      prev.push(value);
      return prev;
    })
    .option('--doc-globs-file <path>', 'Path where doc globs manifest will be written', 'doc-globs.txt')
    .option('--prompt-template <path>', 'Codex prompt template', 'prompts/codex-doc-sync.md')
    .option('--prompt-path <path>', 'Rendered prompt destination', 'codex_prompt.md')
    .option('--report-path <path>', 'Doc summary markdown path', 'doc-sync-report.md')
    .option('--commits-path <path>', 'Commit summary path', 'doc-commits.md')
    .option('--patch-path <path>', 'Diff patch output', 'doc-changes.patch')
    .option('--files-path <path>', 'Touched file list output', 'doc-changes.txt')
    .option('--base-ref <ref>', 'Base branch ref (default: PR base or main)')
    .option('--head-ref <ref>', 'Head branch ref (default: PR head)')
    .option('--head-sha <sha>', 'Head commit SHA override')
    .option('--pull-number <number>', 'Pull request number', (value) => Number.parseInt(value, 10))
    .option('--codex-bin <path>', 'Override Codex binary path for the SDK', 'codex')
    .option('--model <name>', 'Codex model override')
    .option('--effort <level>', 'Codex effort override')
    .option('--safety-strategy <mode>', 'Legacy safety strategy flag (ignored when using the SDK)')
    .option('--dry-run', 'Skip committing/pushing, only show summary', false)
    .option('--no-auto-commit', 'Do not create a git commit')
    .option('--no-auto-push', 'Do not push changes upstream')
    .option('--no-comment', 'Skip PR comment')
    .option('--event-path <path>', 'Event payload override path')
    .option('--repo <owner/repo>', 'Override repository when running locally')
    .option('--enable-network', 'Allow Codex outbound network access', false)
    .option('--enable-web-search', 'Allow Codex to run web searches', false)
    .action(async (opts: DocSyncOptions) => {
      const repoOverride = opts.repo ? parseRepo(opts.repo) : undefined;
      const ctx = loadActionContext({ eventPath: opts.eventPath, repo: repoOverride });
      const payload = readEventPayload<PullRequestEventPayload>(ctx.eventPath) ?? {};
      const repoFull = `${ctx.repo.owner}/${ctx.repo.repo}`;
      const pullNumber =
        opts.pullNumber ??
        (payload.pull_request ? requirePullRequestNumber(payload) : undefined);
      if (!pullNumber) {
        throw new Error('doc-sync requires a pull request context or --pull-number');
      }

      const headRepoFull = payload.pull_request?.head?.repo?.full_name;
      if (headRepoFull && headRepoFull !== repoFull) {
        throw new Error(
          `Head repo ${headRepoFull} differs from workflow repo ${repoFull}; doc-sync cannot push.`
        );
      }

      const baseRef =
        opts.baseRef ?? payload.pull_request?.base?.ref ?? process.env.GITHUB_BASE_REF ?? 'main';
      const headRef =
        opts.headRef ?? payload.pull_request?.head?.ref ?? process.env.GITHUB_HEAD_REF ?? 'HEAD';
      const headSha = opts.headSha ?? payload.pull_request?.head?.sha ?? process.env.GITHUB_SHA;

      const docPatterns = collectDocPatterns(opts);
      ensureGitIgnoreEntries([
        opts.reportPath,
        opts.commitsPath,
        opts.docGlobsFile,
        opts.promptPath,
        opts.patchPath,
        opts.filesPath
      ]);
      const docGlobsPath = writeDocGlobsFile(docPatterns, opts.docGlobsFile);
      await collectCommitSummary({ baseRef, headRef, headSha, outputPath: opts.commitsPath });

      const docScope = docPatterns.map((pattern) => `- ${pattern}`).join('\n');
      const commitSummary = readFileOrDefault(opts.commitsPath, '- No commits provided.');
      renderTemplateFile({
        templatePath: opts.promptTemplate,
        outputPath: opts.promptPath,
        variables: {
          '{{BASE_REF}}': baseRef,
          '{{HEAD_REF}}': headRef,
          '{{PR_NUMBER}}': String(pullNumber),
          '{{REPOSITORY}}': repoFull,
          '{{DOC_SCOPE}}': docScope,
          '{{COMMIT_SUMMARY}}': commitSummary,
          '{{REPORT_PATH}}': opts.reportPath
        }
      });

      if (opts.codexArgs) {
        logger.warn('codexArgs are not supported when using the Codex SDK and will be ignored.');
      }
      if (opts.safetyStrategy) {
        logger.warn('safetyStrategy is not configurable via the Codex SDK and will be ignored.');
      }
      const codex = new CodexClient(opts.codexBin);
      const extraEnv = {
        DOC_REPORT_PATH: path.resolve(opts.reportPath),
        DOC_BASE_REF: baseRef,
        DOC_HEAD_REF: headRef,
        DOC_HEAD_SHA: headSha ?? '',
        DOC_PR_NUMBER: String(pullNumber),
        DOC_REPOSITORY: repoFull,
        DOC_GLOBS_FILE: docGlobsPath,
        GH_TOKEN: process.env.GITHUB_TOKEN ?? '',
        GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? ''
      };

      await codex.run({
        promptPath: path.resolve(opts.promptPath),
        model: opts.model,
        effort: opts.effort,
        extraEnv,
        networkAccessEnabled: Boolean(opts.enableNetwork),
        webSearchEnabled: Boolean(opts.enableWebSearch)
      });

      await assertDocsOnlyChanged(docPatterns);
      const { docFiles } = await classifyDiffFiles(docPatterns);
      if (!docFiles.length) {
        logger.info('Codex did not modify documentation files.');
        return;
      }

      await saveFileList(docFiles, opts.filesPath);
      await computeDocPatch(opts.patchPath);

      if (opts.dryRun) {
        logger.info('Doc-sync dry run complete. Files touched:');
        docFiles.forEach((file) => logger.info(` - ${file}`));
        return;
      }

      const pendingChanges = await hasPendingChanges();
      if (pendingChanges && opts.autoCommit === false) {
        logger.warn('auto-commit disabled; documentation edits remain uncommitted.');
      }

      if (pendingChanges && opts.autoCommit !== false) {
        await ensureGitUser();
        await commitAll(`[skip ci][doc-sync] Auto-update docs for PR #${pullNumber}`);
      }

      const commitSha = await getHeadSha();

      if (opts.autoPush !== false) {
        if (opts.autoCommit === false && pendingChanges) {
          throw new Error('Cannot push documentation updates when auto-commit is disabled.');
        }
        await pushChanges({ ref: `HEAD:${headRef}` });
        logger.info(`Pushed documentation updates to ${headRef}`);
      } else {
        logger.info('autoPush disabled; skipping git push.');
      }

      if (opts.comment !== false) {
        const report = readFileOrDefault(opts.reportPath, 'Doc sync completed.');
        const filesList = docFiles.map((file) => `- ${file}`).join('\n') || '- (none)';
        const body = [
          '🤖 Documentation synchronized automatically.',
          '',
          report,
          '',
          'Updated files:',
          filesList,
          '',
          `Commit: ${commitSha}`
        ].join('\n');
        await createIssueComment(ctx, pullNumber, body);
        logger.info('Posted documentation summary comment.');
      }
    });
};
