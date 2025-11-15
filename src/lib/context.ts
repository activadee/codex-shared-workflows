import { getOctokit } from '@actions/github';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { optionalEnv } from './env';

export type RepoRef = {
  owner: string;
  repo: string;
};

export interface ActionContext {
  token: string;
  repo: RepoRef;
  workspace: string;
  eventPath?: string;
  octokit: ReturnType<typeof getOctokit>;
}

export const parseRepo = (value?: string): RepoRef => {
  if (!value) {
    throw new Error('Unable to determine repository (missing GITHUB_REPOSITORY).');
  }
  const [owner, repo] = value.split('/', 2);
  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY value: ${value}`);
  }

  return { owner, repo };
};

const detectRepoFromGit = (): RepoRef | undefined => {
  try {
    const remote = execSync('git config --get remote.origin.url', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .trim()
      .replace(/\.git$/i, '');

    if (!remote) {
      return undefined;
    }

    if (remote.startsWith('git@')) {
      const match = remote.match(/^git@[^:]+:(.+?)\/(.+)$/);
      if (match) {
        return { owner: match[1], repo: match[2] };
      }
    } else if (remote.startsWith('http://') || remote.startsWith('https://')) {
      const url = new URL(remote);
      const parts = url.pathname.replace(/^\//, '').split('/', 2);
      if (parts.length === 2) {
        return { owner: parts[0], repo: parts[1] };
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
};

export const loadActionContext = (overrides?: Partial<{ token: string; repo: RepoRef; workspace: string; eventPath: string }>): ActionContext => {
  const token = overrides?.token ?? optionalEnv('GITHUB_TOKEN');
  if (!token) {
    throw new Error('GITHUB_TOKEN is required to call GitHub APIs.');
  }

  const repo =
    overrides?.repo ??
    ((): RepoRef => {
      const fromEnv = optionalEnv('GITHUB_REPOSITORY');
      if (fromEnv) {
        return parseRepo(fromEnv);
      }
      const fromGit = detectRepoFromGit();
      if (fromGit) {
        return fromGit;
      }
      throw new Error('Unable to determine repository (missing GITHUB_REPOSITORY and git remote).');
    })();
  const workspace = overrides?.workspace ?? optionalEnv('GITHUB_WORKSPACE') ?? process.cwd();
  const eventPath = overrides?.eventPath ?? optionalEnv('GITHUB_EVENT_PATH');

  return {
    token,
    repo,
    workspace,
    eventPath,
    octokit: getOctokit(token)
  };
};

export const readEventPayload = <T>(eventPath?: string): T | undefined => {
  const resolvedPath = eventPath ?? optionalEnv('GITHUB_EVENT_PATH');
  if (!resolvedPath) {
    return undefined;
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`GITHUB_EVENT_PATH points to a missing file: ${resolvedPath}`);
  }

  const raw = fs.readFileSync(resolvedPath, 'utf8');
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`Unable to parse event payload at ${path.resolve(resolvedPath)}: ${(error as Error).message}`);
  }
};
