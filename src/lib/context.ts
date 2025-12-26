import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import type { Context, CommandOptions } from '../types.js';
import { log } from './logger.js';

export function getContext(options: CommandOptions): Context {
  // 1. GitHub Actions environment
  if (process.env.GITHUB_ACTIONS === 'true') {
    return getGitHubActionsContext();
  }

  // 2. Local mode (--local flag)
  if (options.local) {
    return getLocalGitContext();
  }

  // 3. Manual mode (--pr, --issue, --repo flags)
  if (options.pr || options.issue) {
    return getManualContext(options);
  }

  // 4. Default to local
  log.info('No context detected, using local git context');
  return getLocalGitContext();
}

function getGitHubActionsContext(): Context {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  let eventPayload: Record<string, unknown> = {};

  if (eventPath && existsSync(eventPath)) {
    eventPayload = JSON.parse(readFileSync(eventPath, 'utf-8'));
  }

  const pr = eventPayload.pull_request as Record<string, unknown> | undefined;
  const issue = eventPayload.issue as Record<string, unknown> | undefined;
  const head = pr?.head as Record<string, unknown> | undefined;

  return {
    mode: 'ci',
    repository: process.env.GITHUB_REPOSITORY,
    prNumber: pr?.number as number | undefined,
    issueNumber: issue?.number as number | undefined,
    commitSha: (head?.sha as string) || process.env.GITHUB_SHA,
    branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME,
    token: process.env.GITHUB_TOKEN,
    eventName: process.env.GITHUB_EVENT_NAME,
    eventPayload,
  };
}

function getLocalGitContext(): Context {
  try {
    const branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
    const remote = getRemoteRepo();

    return {
      mode: 'local',
      repository: remote,
      branch,
      commitSha: execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim(),
    };
  } catch {
    return {
      mode: 'local',
    };
  }
}

function getManualContext(options: CommandOptions): Context {
  const repo = options.repo || getRemoteRepo();

  return {
    mode: 'manual',
    repository: repo,
    prNumber: options.pr ? parseInt(options.pr, 10) : undefined,
    issueNumber: options.issue ? parseInt(options.issue, 10) : undefined,
    token: process.env.GITHUB_TOKEN,
  };
}

function getRemoteRepo(): string | undefined {
  try {
    const remote = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
    // Parse: git@github.com:owner/repo.git or https://github.com/owner/repo.git
    const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

export function requirePR(ctx: Context, options: CommandOptions): number {
  const pr = options.pr ? parseInt(options.pr, 10) : ctx.prNumber;
  if (!pr) {
    throw new Error(
      'PR number required. Use --pr <number> or run in a pull_request event.'
    );
  }
  return pr;
}

export function requireIssue(ctx: Context, options: CommandOptions): number {
  const issue = options.issue ? parseInt(options.issue, 10) : ctx.issueNumber;
  if (!issue) {
    throw new Error(
      'Issue number required. Use --issue <number> or run in an issues event.'
    );
  }
  return issue;
}

export function requireRepo(ctx: Context, options: CommandOptions): string {
  const repo = options.repo || ctx.repository;
  if (!repo) {
    throw new Error(
      'Repository required. Use --repo owner/repo or run in a git repository.'
    );
  }
  return repo;
}
