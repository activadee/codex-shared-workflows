import { spawn, execSync, type ChildProcess } from 'child_process';
import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk';
import type { OpenCodeOptions } from '../types.js';
import { log } from './logger.js';

let serverProcess: ChildProcess | null = null;
const OPENCODE_PORT = 54321;
const OPENCODE_URL = `http://127.0.0.1:${OPENCODE_PORT}`;

export async function ensureOpenCode(): Promise<void> {
  // Check if opencode CLI is installed
  try {
    execSync('opencode --version', { stdio: 'ignore' });
    log.success('OpenCode CLI found');
  } catch {
    log.step('Installing OpenCode CLI...');
    execSync('curl -fsSL https://opencode.ai/install | bash', {
      stdio: 'inherit',
      shell: '/bin/bash',
    });
    log.success('OpenCode CLI installed');
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function startServer(): Promise<void> {
  // Check if server is already running
  try {
    const response = await fetch(`${OPENCODE_URL}/health`);
    if (response.ok) {
      log.dim('OpenCode server already running');
      return;
    }
  } catch {
    // Server not running, start it
  }

  log.step('Starting OpenCode server...');

  serverProcess = spawn('opencode', ['serve', `--port=${OPENCODE_PORT}`], {
    stdio: 'pipe',
    detached: false,
  });

  serverProcess.on('error', (err) => {
    log.error(`Server error: ${err.message}`);
  });

  // Wait for server to be ready
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${OPENCODE_URL}/health`);
      if (response.ok) {
        log.success('OpenCode server started');
        return;
      }
    } catch {
      await sleep(500);
    }
  }

  throw new Error('Failed to start OpenCode server');
}

export async function stopServer(): Promise<void> {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

export async function runOpenCode(options: OpenCodeOptions): Promise<string> {
  const client: OpencodeClient = createOpencodeClient({ baseUrl: OPENCODE_URL });

  // Create session
  const createResult = await client.session.create();
  if (createResult.error || !createResult.data) {
    throw new Error('Failed to create session');
  }
  const sessionId = createResult.data.id;
  log.dim(`Session created: ${sessionId}`);

  try {
    // Parse model string (provider/model)
    const [providerID, ...modelParts] = options.model.split('/');
    const modelID = modelParts.join('/');

    // Send message
    log.step('Running AI analysis...');
    
    await client.session.prompt({
      path: { id: sessionId },
      body: {
        model: { providerID, modelID },
        parts: [{ type: 'text', text: options.prompt }],
      },
    });

    // Collect output from events
    let output = '';
    const eventResult = await client.global.event();
    const eventStream = eventResult.stream;

    for await (const event of eventStream) {
      if (options.onEvent) {
        options.onEvent(event);
      }

      // Collect text output
      const eventObj = event as Record<string, unknown>;
      if (eventObj.type === 'message.part.text') {
        output += eventObj.content as string;
      }

      // Handle completion
      if (eventObj.type === 'session.complete' || eventObj.type === 'session.error') {
        break;
      }
    }

    return output;
  } finally {
    // Clean up session
    await client.session.delete({ path: { id: sessionId } }).catch(() => {});
  }
}

// Cleanup on process exit
process.on('exit', () => stopServer());
process.on('SIGINT', () => {
  stopServer();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopServer();
  process.exit(0);
});
