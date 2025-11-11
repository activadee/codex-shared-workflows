import { Codex, type ModelReasoningEffort, type SandboxMode } from '@openai/codex-sdk';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readPromptFile } from './files';
import { logger } from './logger';

const AUTH_DIR = path.join(os.homedir(), '.codex');
const AUTH_PATH = path.join(AUTH_DIR, 'auth.json');

export interface CodexRunOptions {
  promptPath: string;
  input?: string;
  model?: string;
  effort?: string;
  sandboxMode?: SandboxMode;
  workingDirectory?: string;
  skipGitRepoCheck?: boolean;
  extraEnv?: Record<string, string>;
}

const decodeCodexAuth = (): string | undefined => {
  if (process.env.CODEX_AUTH_JSON) {
    return process.env.CODEX_AUTH_JSON;
  }

  const encoded = process.env.CODEX_AUTH_JSON_B64;
  if (!encoded) {
    return undefined;
  }

  return Buffer.from(encoded, 'base64').toString('utf8');
};

const ensureAuthDirectory = () => {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }
};

export const ensureAuthFile = () => {
  const decoded = decodeCodexAuth();
  ensureAuthDirectory();

  if (decoded) {
    const normalized = decoded.trim();
    const current = fs.existsSync(AUTH_PATH) ? fs.readFileSync(AUTH_PATH, 'utf8') : undefined;
    if (current !== normalized) {
      fs.writeFileSync(AUTH_PATH, normalized, 'utf8');
    }
    return AUTH_PATH;
  }

  if (!fs.existsSync(AUTH_PATH)) {
    throw new Error(
      'Missing Codex credentials. Provide CODEX_AUTH_JSON / CODEX_AUTH_JSON_B64 or pre-provision ~/.codex/auth.json.'
    );
  }

  return AUTH_PATH;
};

const composePrompt = (promptPath: string, input?: string) => {
  const prompt = readPromptFile(promptPath);
  if (!input) {
    return prompt;
  }

  return `${prompt}\n\n---\n\n${input}`;
};

const normalizeEffort = (value?: string): ModelReasoningEffort | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  const allowed: ModelReasoningEffort[] = ['minimal', 'low', 'medium', 'high'];
  if (allowed.includes(normalized as ModelReasoningEffort)) {
    return normalized as ModelReasoningEffort;
  }

  logger.warn(`Unsupported Codex effort value "${value}". Falling back to default.`);
  return undefined;
};

export class CodexClient {
  private readonly codex: Codex;

  constructor(codexBinary?: string) {
    ensureAuthFile();
    const options = codexBinary && codexBinary !== 'codex' ? { codexPathOverride: codexBinary } : undefined;
    this.codex = new Codex(options);
  }

  async run(options: CodexRunOptions) {
    const payload = composePrompt(path.resolve(options.promptPath), options.input);

    return this.withEnv(options.extraEnv, async () => {
      const thread = this.codex.startThread({
        model: options.model,
        modelReasoningEffort: normalizeEffort(options.effort),
        sandboxMode: options.sandboxMode,
        workingDirectory: options.workingDirectory,
        skipGitRepoCheck: options.skipGitRepoCheck
      });

      const turn = await thread.run(payload);
      return turn.finalResponse.trim();
    });
  }

  private async withEnv<T>(extraEnv: Record<string, string> | undefined, fn: () => Promise<T>) {
    if (!extraEnv || Object.keys(extraEnv).length === 0) {
      return fn();
    }

    const previous = new Map<string, string | undefined>();
    Object.entries(extraEnv).forEach(([key, value]) => {
      previous.set(key, process.env[key]);
      process.env[key] = value;
    });

    try {
      return await fn();
    } finally {
      previous.forEach((value, key) => {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      });
    }
  }
}
