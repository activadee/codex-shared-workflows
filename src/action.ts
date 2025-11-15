import * as core from '@actions/core';
import { createProgram } from './program';
import { logger } from './lib/logger';

const truthy = (value: string | undefined | null, defaultValue = false) => {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
};

const pushOption = (args: string[], flag: string, value?: string) => {
  if (value) {
    args.push(flag, value);
  }
};

const pushBooleanFlag = (args: string[], flag: string, enabled?: boolean) => {
  if (enabled) {
    args.push(flag);
  }
};

const pushSharedCodexFlags = (args: string[]) => {
  pushBooleanFlag(args, '--enable-network', truthy(core.getInput('network_access')));
  pushBooleanFlag(args, '--enable-web-search', truthy(core.getInput('web_search')));
};

const buildReviewArgs = () => {
  const args: string[] = [];
  pushOption(args, '--prompt', core.getInput('prompt_path') || 'prompts/codex-review.md');
  pushOption(args, '--prompt-extra', core.getInput('prompt_extra'));
  pushOption(args, '--model', core.getInput('model'));
  pushOption(args, '--effort', core.getInput('effort'));
  pushOption(args, '--codex-bin', core.getInput('codex_bin'));
  pushOption(args, '--event-path', core.getInput('event_path'));
  const pullNumber = core.getInput('pull_number');
  if (pullNumber) {
    args.push('--pull-number', pullNumber);
  }
  if (truthy(core.getInput('dry_run'))) {
    args.push('--dry-run');
  }
  pushSharedCodexFlags(args);
  return args;
};

const buildGoTestArgs = () => {
  const args: string[] = [];
  pushOption(args, '--go-version', core.getInput('go_version'));
  pushOption(args, '--go-version-file', core.getInput('go_version_file'));
  pushOption(args, '--working-directory', core.getInput('working_directory'));
  pushOption(args, '--test-flags', core.getInput('test_flags'));
  pushOption(args, '--pre-test', core.getInput('pre_test'));
  const envLines = core.getMultilineInput('env');
  envLines.forEach((line) => {
    if (line.trim()) {
      args.push('--env', line.trim());
    }
  });
  return args;
};

const buildReleaseArgs = () => {
  const args: string[] = [];
  pushOption(args, '--tag-name', core.getInput('tag_name', { required: true }));
  pushOption(args, '--release-title', core.getInput('release_title'));
  pushOption(args, '--target', core.getInput('target') || 'main');
  pushBooleanFlag(args, '--draft', truthy(core.getInput('draft')));
  pushBooleanFlag(args, '--skip-tests', truthy(core.getInput('skip_tests')));
  pushOption(args, '--go-version', core.getInput('go_version'));
  pushOption(args, '--go-version-file', core.getInput('go_version_file'));
  pushOption(args, '--test-flags', core.getInput('test_flags'));
  pushOption(args, '--pre-test', core.getInput('pre_test'));
  pushOption(args, '--prompt', core.getInput('prompt_path') || 'prompts/codex-release-template.md');
  pushOption(args, '--model', core.getInput('model'));
  pushOption(args, '--effort', core.getInput('effort'));
  pushOption(args, '--codex-bin', core.getInput('codex_bin'));
  pushOption(args, '--notes-extra', core.getInput('notes_extra'));
  pushOption(args, '--project-name', core.getInput('project_name'));
  pushOption(args, '--project-language', core.getInput('project_language'));
  pushOption(args, '--package-name', core.getInput('package_name'));
  pushOption(args, '--project-purpose', core.getInput('project_purpose'));
  pushOption(args, '--repository-url', core.getInput('repository_url'));
  const commitLimit = core.getInput('commit_limit');
  if (commitLimit) {
    args.push('--commit-limit', commitLimit);
  }
  if (truthy(core.getInput('dry_run'))) {
    args.push('--dry-run');
  }
  pushSharedCodexFlags(args);
  return args;
};

const buildAutoLabelArgs = () => {
  const args: string[] = [];
  pushOption(args, '--prompt', core.getInput('prompt_path') || 'prompts/codex-auto-label.md');
  const maxLabels = core.getInput('max_labels');
  if (maxLabels) {
    args.push('--max-labels', maxLabels);
  }
  pushOption(args, '--model', core.getInput('model'));
  pushOption(args, '--effort', core.getInput('effort'));
  pushOption(args, '--codex-bin', core.getInput('codex_bin'));
  pushOption(args, '--event-path', core.getInput('event_path'));
  if (truthy(core.getInput('dry_run'))) {
    args.push('--dry-run');
  }
  pushSharedCodexFlags(args);
  return args;
};

const buildDocSyncArgs = () => {
  const args: string[] = [];
  const docGlobsMultiline = core.getMultilineInput('doc_globs');
  if (docGlobsMultiline.length) {
    args.push('--doc-globs', docGlobsMultiline.join('\n'));
  }
  pushOption(args, '--doc-globs-file', core.getInput('doc_globs_file'));
  pushOption(args, '--prompt-template', core.getInput('prompt_template'));
  pushOption(args, '--prompt-path', core.getInput('prompt_path'));
  pushOption(args, '--report-path', core.getInput('report_path'));
  pushOption(args, '--commits-path', core.getInput('commits_path'));
  pushOption(args, '--patch-path', core.getInput('patch_path'));
  pushOption(args, '--files-path', core.getInput('files_path'));
  pushOption(args, '--base-ref', core.getInput('base_ref'));
  pushOption(args, '--head-ref', core.getInput('head_ref'));
  pushOption(args, '--head-sha', core.getInput('head_sha'));
  pushOption(args, '--pull-number', core.getInput('pull_number'));
  pushOption(args, '--codex-bin', core.getInput('codex_bin'));
  pushOption(args, '--model', core.getInput('model'));
  pushOption(args, '--effort', core.getInput('effort'));
  pushOption(args, '--safety-strategy', core.getInput('safety_strategy'));
  if (truthy(core.getInput('dry_run'))) {
    args.push('--dry-run');
  }
  if (!truthy(core.getInput('auto_commit'), true)) {
    args.push('--no-auto-commit');
  }
  if (!truthy(core.getInput('auto_push'), true)) {
    args.push('--no-auto-push');
  }
  if (!truthy(core.getInput('comment'), true)) {
    args.push('--no-comment');
  }
  pushSharedCodexFlags(args);
  return args;
};

const buildArgsForCommand = (command: string) => {
  switch (command) {
    case 'review':
      return buildReviewArgs();
    case 'go-tests':
      return buildGoTestArgs();
    case 'release':
      return buildReleaseArgs();
    case 'auto-label':
      return buildAutoLabelArgs();
    case 'doc-sync':
      return buildDocSyncArgs();
    default:
      throw new Error(`Unsupported command: ${command}`);
  }
};

async function run() {
  try {
    const command = core.getInput('command', { required: true }).trim();
    const args = buildArgsForCommand(command);
    const program = createProgram();
    await program.parseAsync(['node', 'action', command, ...args]);
  } catch (error) {
    logger.fatal(error);
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

void run();
