export interface Context {
  mode: 'ci' | 'local' | 'manual';
  repository?: string;
  prNumber?: number;
  issueNumber?: number;
  commitSha?: string;
  branch?: string;
  token?: string;
  eventName?: string;
  eventPayload?: Record<string, unknown>;
}

export interface CommandOptions {
  pr?: string;
  issue?: string;
  repo?: string;
  model?: string;
  local?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}

export interface OpenCodeOptions {
  model: string;
  prompt: string;
  permissions?: {
    bash?: Record<string, 'allow' | 'deny'>;
    write?: boolean;
    edit?: boolean;
  };
  onEvent?: (event: unknown) => void;
}

export interface PRDetails {
  number: number;
  title: string;
  body: string;
  headSha: string;
  baseBranch: string;
  headBranch: string;
  diff: string;
}

export interface IssueDetails {
  number: number;
  title: string;
  body: string;
  labels: string[];
}
