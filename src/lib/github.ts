import { execSync } from 'child_process';
import type { PRDetails, IssueDetails } from '../types.js';
import { log } from './logger.js';

export function getPRDetails(repo: string, prNumber: number): PRDetails {
  log.step(`Fetching PR #${prNumber} details...`);

  const prJson = execSync(
    `gh pr view ${prNumber} --repo ${repo} --json number,title,body,headRefOid,baseRefName,headRefName`,
    { encoding: 'utf-8' }
  );
  const pr = JSON.parse(prJson);

  const diff = execSync(
    `gh pr diff ${prNumber} --repo ${repo}`,
    { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
  );

  return {
    number: pr.number,
    title: pr.title,
    body: pr.body || '',
    headSha: pr.headRefOid,
    baseBranch: pr.baseRefName,
    headBranch: pr.headRefName,
    diff,
  };
}

export function getIssueDetails(repo: string, issueNumber: number): IssueDetails {
  log.step(`Fetching issue #${issueNumber} details...`);

  const issueJson = execSync(
    `gh issue view ${issueNumber} --repo ${repo} --json number,title,body,labels`,
    { encoding: 'utf-8' }
  );
  const issue = JSON.parse(issueJson);

  return {
    number: issue.number,
    title: issue.title,
    body: issue.body || '',
    labels: issue.labels?.map((l: { name: string }) => l.name) || [],
  };
}

export function getRepoLabels(repo: string): string[] {
  const labelsJson = execSync(
    `gh label list --repo ${repo} --json name --limit 100`,
    { encoding: 'utf-8' }
  );
  const labels = JSON.parse(labelsJson);
  return labels.map((l: { name: string }) => l.name);
}

export function getLocalDiff(): string {
  try {
    // Get staged + unstaged changes
    const staged = execSync('git diff --staged', { encoding: 'utf-8' });
    const unstaged = execSync('git diff', { encoding: 'utf-8' });
    const combined = staged + unstaged;
    
    if (combined.trim()) {
      return combined;
    }
    
    // Fall back to diff from last commit
    return execSync('git diff HEAD~1', { encoding: 'utf-8' });
  } catch {
    return '';
  }
}

export function ensureGhCli(): void {
  try {
    execSync('gh --version', { stdio: 'ignore' });
  } catch {
    throw new Error(
      'GitHub CLI (gh) is required but not found. Install it from: https://cli.github.com'
    );
  }
}

export function ensureGhAuth(): void {
  try {
    execSync('gh auth status', { stdio: 'ignore' });
  } catch {
    throw new Error(
      'GitHub CLI not authenticated. Run: gh auth login'
    );
  }
}
