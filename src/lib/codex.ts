import type {
  ApprovalMode,
  ModelReasoningEffort,
  SandboxMode,
  ThreadEvent,
  ThreadItem
} from '@openai/codex-sdk';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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
  outputSchemaPath?: string;
  networkAccessEnabled?: boolean;
  webSearchEnabled?: boolean;
  approvalPolicy?: ApprovalMode;
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

const loadSchema = (schemaPath?: string): unknown => {
  if (!schemaPath) {
    return undefined;
  }
  const resolved = path.resolve(schemaPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Codex output schema not found at ${resolved}`);
  }

  try {
    return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to parse Codex schema at ${resolved}: ${(error as Error).message}`);
  }
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

type CodexModule = typeof import('@openai/codex-sdk');
type CodexInstance = InstanceType<CodexModule['Codex']>;

const loadCodexModule = async (): Promise<CodexModule> => {
  try {
    return await import('@openai/codex-sdk');
  } catch (error) {
    const fallbackPath = path.resolve(__dirname, 'vendor/codex-sdk/dist/index.js');
    if (fs.existsSync(fallbackPath)) {
      return import(pathToFileURL(fallbackPath).href) as Promise<CodexModule>;
    }
    throw error;
  }
};

export class CodexClient {
  private codexInstance?: CodexInstance;
  private readonly codexBinary?: string;

  constructor(codexBinary?: string) {
    this.codexBinary = codexBinary;
  }

  private async getCodex() {
    ensureAuthFile();
    if (!this.codexInstance) {
      const { Codex } = await loadCodexModule();
      const options =
        this.codexBinary && this.codexBinary !== 'codex'
          ? { codexPathOverride: this.codexBinary }
          : undefined;
      this.codexInstance = new Codex(options);
    }
    return this.codexInstance;
  }

  async run(options: CodexRunOptions) {
    const payload = composePrompt(path.resolve(options.promptPath), options.input);
    const outputSchema = loadSchema(options.outputSchemaPath);

    return this.withEnv(options.extraEnv, async () => {
      const codex = await this.getCodex();
      const thread = codex.startThread({
        model: options.model,
        modelReasoningEffort: normalizeEffort(options.effort),
        sandboxMode: options.sandboxMode ?? 'workspace-write',
        workingDirectory: options.workingDirectory,
        skipGitRepoCheck: options.skipGitRepoCheck,
        networkAccessEnabled: options.networkAccessEnabled ?? false,
        webSearchEnabled: options.webSearchEnabled ?? false,
        approvalPolicy: options.approvalPolicy ?? 'untrusted'
      });

      const streamed = await thread.runStreamed(payload, { outputSchema });
      const result = await collectStreamedTurn(streamed.events);
      return result.trim();
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

const collectStreamedTurn = async (events: AsyncGenerator<ThreadEvent>) => {
  const items: any[] = [];
  let finalResponse = '';
  let turnFailure: { message: string } | null = null;

  for await (const event of events) {
    logEvent(event);
    if (event.type === 'item.started' || event.type === 'item.updated') {
      continue;
    }
    if (event.type === 'item.completed') {
      items.push(event.item);
      if (event.item.type === 'agent_message') {
        finalResponse = event.item.text;
      }
    } else if (event.type === 'turn.failed') {
      turnFailure = event.error;
      break;
    }
  }

  if (turnFailure) {
    throw new Error(turnFailure.message);
  }

  if (!finalResponse) {
    const summaryItem = items.find((item) => item.type === 'agent_message');
    if (summaryItem) {
      finalResponse = summaryItem.text ?? '';
    }
  }
  return finalResponse;
};

const logEvent = (event: ThreadEvent) => {
  if (event.type === 'item.completed') {
    const message = formatItemMessage(event.item);
    if (message) {
      writeStdout(message);
      return;
    }
  }

  if (event.type === 'turn.failed') {
    logger.error(`Codex turn failed: ${event.error.message}`);
  }
};

const formatItemMessage = (item: ThreadItem) => {
  switch (item.type) {
    case 'agent_message':
      return item.text?.trim();
    case 'reasoning':
      return item.text?.trim();
    case 'command_execution':
      if (item.command) {
        const output = item.aggregated_output?.trim();
        return output
          ? `$ ${item.command}\n${output}`
          : `$ ${item.command}`;
      }
      return undefined;
    case 'error':
      return `Error: ${item.message}`;
    default:
      return undefined;
  }
};

const writeStdout = (message: string) => {
  if (!message) {
    return;
  }
  const formatted = message.endsWith('\n') ? message : `${message}\n`;
  process.stdout.write(formatted);
};
