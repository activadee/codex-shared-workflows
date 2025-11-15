#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/program.ts
var import_commander = require("commander");

// src/commands/auto-label.ts
var import_node_path4 = __toESM(require("path"));

// src/lib/codex.ts
var import_node_fs2 = __toESM(require("fs"));
var import_node_os = __toESM(require("os"));
var import_node_path2 = __toESM(require("path"));

// src/lib/files.ts
var import_node_fs = __toESM(require("fs"));
var import_node_path = __toESM(require("path"));
var readPromptFile = (relativePath) => {
  const absPath = import_node_path.default.resolve(relativePath);
  if (!import_node_fs.default.existsSync(absPath)) {
    throw new Error(`Prompt file not found: ${absPath}`);
  }
  return import_node_fs.default.readFileSync(absPath, "utf8");
};

// src/lib/logger.ts
var core = __toESM(require("@actions/core"));
var inActions = process.env.GITHUB_ACTIONS === "true";
var serialize = (value) => {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
};
var logToConsole = (level, message, details) => {
  const suffix = serialize(details);
  const body = suffix ? `${message} ${suffix}` : message;
  if (inActions) {
    switch (level) {
      case "debug":
        core.debug(body);
        return;
      case "info":
        core.info(body);
        return;
      case "warn":
        core.warning(body);
        return;
      case "error":
        core.error(body);
        return;
    }
  }
  const target = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  target(`[${level.toUpperCase()}] ${body}`);
};
var logger = {
  debug: (message, details) => logToConsole("debug", message, details),
  info: (message, details) => logToConsole("info", message, details),
  warn: (message, details) => logToConsole("warn", message, details),
  error: (message, details) => logToConsole("error", message, details),
  fatal: (error2) => {
    if (error2 instanceof Error) {
      logToConsole("error", error2.message, { stack: error2.stack });
    } else {
      logToConsole("error", "Unknown fatal error", { error: error2 });
    }
  }
};

// src/lib/codex.ts
var AUTH_DIR = import_node_path2.default.join(import_node_os.default.homedir(), ".codex");
var AUTH_PATH = import_node_path2.default.join(AUTH_DIR, "auth.json");
var decodeCodexAuth = () => {
  if (process.env.CODEX_AUTH_JSON) {
    return process.env.CODEX_AUTH_JSON;
  }
  const encoded = process.env.CODEX_AUTH_JSON_B64;
  if (!encoded) {
    return void 0;
  }
  return Buffer.from(encoded, "base64").toString("utf8");
};
var ensureAuthDirectory = () => {
  if (!import_node_fs2.default.existsSync(AUTH_DIR)) {
    import_node_fs2.default.mkdirSync(AUTH_DIR, { recursive: true });
  }
};
var ensureAuthFile = () => {
  const decoded = decodeCodexAuth();
  ensureAuthDirectory();
  if (decoded) {
    const normalized = decoded.trim();
    const current = import_node_fs2.default.existsSync(AUTH_PATH) ? import_node_fs2.default.readFileSync(AUTH_PATH, "utf8") : void 0;
    if (current !== normalized) {
      import_node_fs2.default.writeFileSync(AUTH_PATH, normalized, "utf8");
    }
    return AUTH_PATH;
  }
  if (!import_node_fs2.default.existsSync(AUTH_PATH)) {
    throw new Error(
      "Missing Codex credentials. Provide CODEX_AUTH_JSON / CODEX_AUTH_JSON_B64 or pre-provision ~/.codex/auth.json."
    );
  }
  return AUTH_PATH;
};
var composePrompt = (promptPath, input) => {
  const prompt = readPromptFile(promptPath);
  if (!input) {
    return prompt;
  }
  return `${prompt}

---

${input}`;
};
var loadSchema = (schemaPath) => {
  if (!schemaPath) {
    return void 0;
  }
  const resolved = import_node_path2.default.resolve(schemaPath);
  if (!import_node_fs2.default.existsSync(resolved)) {
    throw new Error(`Codex output schema not found at ${resolved}`);
  }
  try {
    return JSON.parse(import_node_fs2.default.readFileSync(resolved, "utf8"));
  } catch (error2) {
    throw new Error(`Failed to parse Codex schema at ${resolved}: ${error2.message}`);
  }
};
var normalizeEffort = (value) => {
  if (!value) {
    return void 0;
  }
  const normalized = value.trim().toLowerCase();
  const allowed = ["minimal", "low", "medium", "high"];
  if (allowed.includes(normalized)) {
    return normalized;
  }
  logger.warn(`Unsupported Codex effort value "${value}". Falling back to default.`);
  return void 0;
};
var loadCodexModule = async () => import("@openai/codex-sdk");
var CodexClient = class {
  codexInstance;
  codexBinary;
  constructor(codexBinary) {
    this.codexBinary = codexBinary;
  }
  async getCodex() {
    ensureAuthFile();
    if (!this.codexInstance) {
      const { Codex } = await loadCodexModule();
      const options = this.codexBinary && this.codexBinary !== "codex" ? { codexPathOverride: this.codexBinary } : void 0;
      this.codexInstance = new Codex(options);
    }
    return this.codexInstance;
  }
  async run(options) {
    const payload = composePrompt(import_node_path2.default.resolve(options.promptPath), options.input);
    const outputSchema = loadSchema(options.outputSchemaPath);
    return this.withEnv(options.extraEnv, async () => {
      const codex = await this.getCodex();
      const thread = codex.startThread({
        model: options.model,
        modelReasoningEffort: normalizeEffort(options.effort),
        sandboxMode: options.sandboxMode,
        workingDirectory: options.workingDirectory,
        skipGitRepoCheck: options.skipGitRepoCheck,
        networkAccessEnabled: options.networkAccessEnabled ?? false,
        webSearchEnabled: options.webSearchEnabled ?? false
      });
      const streamed = await thread.runStreamed(payload, { outputSchema });
      const result = await collectStreamedTurn(streamed.events);
      return result.trim();
    });
  }
  async withEnv(extraEnv, fn) {
    if (!extraEnv || Object.keys(extraEnv).length === 0) {
      return fn();
    }
    const previous = /* @__PURE__ */ new Map();
    Object.entries(extraEnv).forEach(([key, value]) => {
      previous.set(key, process.env[key]);
      process.env[key] = value;
    });
    try {
      return await fn();
    } finally {
      previous.forEach((value, key) => {
        if (value === void 0) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      });
    }
  }
};
var collectStreamedTurn = async (events) => {
  const items = [];
  let finalResponse = "";
  let turnFailure = null;
  for await (const event of events) {
    logEvent(event);
    if (event.type === "item.started" || event.type === "item.updated") {
      continue;
    }
    if (event.type === "item.completed") {
      items.push(event.item);
      if (event.item.type === "agent_message") {
        finalResponse = event.item.text;
      }
    } else if (event.type === "turn.failed") {
      turnFailure = event.error;
      break;
    }
  }
  if (turnFailure) {
    throw new Error(turnFailure.message);
  }
  if (!finalResponse) {
    const summaryItem = items.find((item) => item.type === "agent_message");
    if (summaryItem) {
      finalResponse = summaryItem.text ?? "";
    }
  }
  return finalResponse;
};
var logEvent = (event) => {
  if (event.type === "item.completed") {
    const message = formatItemMessage(event.item);
    if (message) {
      writeStdout(message);
      return;
    }
  }
  if (event.type === "turn.failed") {
    logger.error(`Codex turn failed: ${event.error.message}`);
  }
};
var formatItemMessage = (item) => {
  switch (item.type) {
    case "agent_message":
      return item.text?.trim();
    case "reasoning":
      return item.text?.trim();
    case "command_execution":
      if (item.command) {
        const output = item.aggregated_output?.trim();
        return output ? `$ ${item.command}
${output}` : `$ ${item.command}`;
      }
      return void 0;
    case "error":
      return `Error: ${item.message}`;
    default:
      return void 0;
  }
};
var writeStdout = (message) => {
  if (!message) {
    return;
  }
  const formatted = message.endsWith("\n") ? message : `${message}
`;
  process.stdout.write(formatted);
};

// src/lib/context.ts
var import_github = require("@actions/github");
var import_node_child_process = require("child_process");
var import_node_fs3 = __toESM(require("fs"));
var import_node_path3 = __toESM(require("path"));

// src/lib/env.ts
var optionalEnv = (name, fallback) => {
  const value = process.env[name];
  return value ?? fallback;
};

// src/lib/context.ts
var parseRepo = (value) => {
  if (!value) {
    throw new Error("Unable to determine repository (missing GITHUB_REPOSITORY).");
  }
  const [owner, repo] = value.split("/", 2);
  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY value: ${value}`);
  }
  return { owner, repo };
};
var detectRepoFromGit = () => {
  try {
    const remote = (0, import_node_child_process.execSync)("git config --get remote.origin.url", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim().replace(/\.git$/i, "");
    if (!remote) {
      return void 0;
    }
    if (remote.startsWith("git@")) {
      const match = remote.match(/^git@[^:]+:(.+?)\/(.+)$/);
      if (match) {
        return { owner: match[1], repo: match[2] };
      }
    } else if (remote.startsWith("http://") || remote.startsWith("https://")) {
      const url = new URL(remote);
      const parts = url.pathname.replace(/^\//, "").split("/", 2);
      if (parts.length === 2) {
        return { owner: parts[0], repo: parts[1] };
      }
    }
  } catch {
    return void 0;
  }
  return void 0;
};
var loadActionContext = (overrides) => {
  const token = overrides?.token ?? optionalEnv("GITHUB_TOKEN");
  if (!token) {
    throw new Error("GITHUB_TOKEN is required to call GitHub APIs.");
  }
  const repo = overrides?.repo ?? (() => {
    const fromEnv = optionalEnv("GITHUB_REPOSITORY");
    if (fromEnv) {
      return parseRepo(fromEnv);
    }
    const fromGit = detectRepoFromGit();
    if (fromGit) {
      return fromGit;
    }
    throw new Error("Unable to determine repository (missing GITHUB_REPOSITORY and git remote).");
  })();
  const workspace = overrides?.workspace ?? optionalEnv("GITHUB_WORKSPACE") ?? process.cwd();
  const eventPath = overrides?.eventPath ?? optionalEnv("GITHUB_EVENT_PATH");
  return {
    token,
    repo,
    workspace,
    eventPath,
    octokit: (0, import_github.getOctokit)(token)
  };
};
var readEventPayload = (eventPath) => {
  const resolvedPath = eventPath ?? optionalEnv("GITHUB_EVENT_PATH");
  if (!resolvedPath) {
    return void 0;
  }
  if (!import_node_fs3.default.existsSync(resolvedPath)) {
    throw new Error(`GITHUB_EVENT_PATH points to a missing file: ${resolvedPath}`);
  }
  const raw = import_node_fs3.default.readFileSync(resolvedPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error2) {
    throw new Error(`Unable to parse event payload at ${import_node_path3.default.resolve(resolvedPath)}: ${error2.message}`);
  }
};

// src/lib/github.ts
var requirePullRequestNumber = (payload) => {
  const prNumber = payload?.pull_request?.number;
  if (!prNumber) {
    throw new Error("This command must be triggered from a pull_request event.");
  }
  return prNumber;
};
var requireIssueNumber = (payload) => {
  const issueNumber = payload?.issue?.number;
  if (!issueNumber) {
    throw new Error("This command must be triggered from an issue or pull_request event.");
  }
  return issueNumber;
};
var fetchPullRequest = async (ctx, pullNumber) => {
  const response = await ctx.octokit.rest.pulls.get({
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    pull_number: pullNumber
  });
  return response.data;
};
var listPullRequestFiles = async (ctx, pullNumber) => {
  const files = await ctx.octokit.paginate(ctx.octokit.rest.pulls.listFiles, {
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    pull_number: pullNumber,
    per_page: 100
  });
  return files;
};
var createReview = async (ctx, pullNumber, body, event = "COMMENT") => {
  await ctx.octokit.rest.pulls.createReview({
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    pull_number: pullNumber,
    body,
    event
  });
};
var createIssueComment = async (ctx, issueNumber, body) => {
  await ctx.octokit.rest.issues.createComment({
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    issue_number: issueNumber,
    body
  });
};
var ensureLabelsExist = async (ctx, labels) => {
  if (!labels.length) {
    return;
  }
  const existing = await ctx.octokit.paginate(ctx.octokit.rest.issues.listLabelsForRepo, {
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    per_page: 100
  });
  const existingNames = new Set(existing.map((label) => label.name));
  for (const label of labels) {
    if (existingNames.has(label)) {
      continue;
    }
    logger.info(`Creating label ${label}`);
    await ctx.octokit.rest.issues.createLabel({
      owner: ctx.repo.owner,
      repo: ctx.repo.repo,
      name: label
    });
  }
};
var addLabelsToIssue = async (ctx, issueNumber, labels) => {
  if (!labels.length) {
    return;
  }
  await ctx.octokit.rest.issues.addLabels({
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    issue_number: issueNumber,
    labels
  });
};
var createOrUpdateRelease = async (ctx, params) => {
  const existing = await ctx.octokit.rest.repos.getReleaseByTag({
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    tag: params.tag
  }).catch((error2) => {
    if (error2.status === 404) {
      return void 0;
    }
    throw error2;
  });
  if (existing) {
    logger.info(`Updating existing release ${params.tag}`);
    await ctx.octokit.rest.repos.updateRelease({
      owner: ctx.repo.owner,
      repo: ctx.repo.repo,
      release_id: existing.data.id,
      tag_name: params.tag,
      target_commitish: params.target ?? "main",
      body: params.body,
      draft: params.draft,
      name: params.releaseName ?? params.tag
    });
    return existing.data.html_url;
  }
  logger.info(`Creating release ${params.tag}`);
  const created = await ctx.octokit.rest.repos.createRelease({
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    tag_name: params.tag,
    target_commitish: params.target ?? "main",
    name: params.releaseName ?? params.tag,
    body: params.body,
    draft: params.draft ?? false
  });
  return created.data.html_url;
};
var listRecentCommits = async (ctx, params) => {
  const commits = await ctx.octokit.paginate(ctx.octokit.rest.repos.listCommits, {
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    sha: params.target,
    per_page: Math.min(params.limit ?? 50, 100)
  });
  return commits.slice(0, params.limit ?? 50);
};

// src/commands/auto-label.ts
var AUTO_LABEL_SCHEMA = "prompts/codex-auto-label-schema.json";
var buildInput = (payload) => {
  const title = payload.issue?.title ?? "Untitled";
  const body = payload.issue?.body ?? "No description provided";
  const type = payload.issue?.pull_request ? "pull request" : "issue";
  return `Title: ${title}
Type: ${type}
---
${body}`;
};
var parseLabels = (raw, limit) => {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((label) => String(label).trim()).filter(Boolean).slice(0, limit);
    }
  } catch (error2) {
    logger.warn("Failed to parse Codex JSON output, falling back to line parsing", {
      message: error2.message
    });
  }
  return raw.split(/[,\n]/).map((label) => label.trim()).filter(Boolean).slice(0, limit);
};
var registerAutoLabelCommand = (program2) => {
  program2.command("auto-label").description("Suggest and apply labels using Codex output").option("--prompt <path>", "Prompt file path", "prompts/codex-auto-label.md").option("--max-labels <number>", "Maximum labels to apply", (value) => Number.parseInt(value, 10), 3).option("--model <name>", "Codex model override").option("--effort <level>", "Codex effort override").option("--codex-bin <path>", "Override Codex binary path for the SDK", "codex").option("--enable-network", "Allow Codex outbound network access", false).option("--enable-web-search", "Allow Codex to run web searches", false).option("--dry-run", "Print suggested labels without applying", false).option("--event-path <path>", "Event payload override").option("--repo <owner/repo>", "Override repository when running locally").action(async (opts) => {
    const repoOverride = opts.repo ? parseRepo(opts.repo) : void 0;
    const ctx = loadActionContext({ eventPath: opts.eventPath, repo: repoOverride });
    const payload = readEventPayload(ctx.eventPath) ?? {};
    const input = buildInput(payload);
    const codex = new CodexClient(opts.codexBin);
    const raw = await codex.run({
      promptPath: import_node_path4.default.resolve(opts.prompt),
      input,
      model: opts.model,
      effort: opts.effort,
      outputSchemaPath: import_node_path4.default.resolve(AUTO_LABEL_SCHEMA),
      networkAccessEnabled: Boolean(opts.enableNetwork),
      webSearchEnabled: Boolean(opts.enableWebSearch)
    });
    const labels = parseLabels(raw, opts.maxLabels);
    if (!labels.length) {
      logger.info("Codex did not return any labels. Nothing to do.");
      return;
    }
    if (opts.dryRun) {
      logger.info(`Suggested labels: ${labels.join(", ")}`);
      return;
    }
    const issueNumber = requireIssueNumber(payload);
    await ensureLabelsExist(ctx, labels);
    await addLabelsToIssue(ctx, issueNumber, labels);
    logger.info(`Applied labels to #${issueNumber}: ${labels.join(", ")}`);
  });
};

// src/commands/doc-sync.ts
var import_node_fs6 = __toESM(require("fs"));
var import_node_path7 = __toESM(require("path"));

// src/lib/doc-sync.ts
var import_node_fs4 = __toESM(require("fs"));
var import_node_path5 = __toESM(require("path"));

// src/lib/exec.ts
var import_execa = require("execa");
var normalizeOutput = (value) => {
  if (value === void 0) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.join("\n");
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf8");
  }
  return String(value);
};
var runCommand = async ({ command, args = [], silent, ...options }) => {
  logger.debug("exec", { command, args });
  const subprocess = (0, import_execa.execa)(command, args, {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "inherit",
    encoding: "utf8",
    ...options
  });
  if (!silent) {
    subprocess.stdout?.pipe(process.stdout);
    subprocess.stderr?.pipe(process.stderr);
  }
  const result = await subprocess;
  return {
    ...result,
    stdout: normalizeOutput(result.stdout),
    stderr: normalizeOutput(result.stderr)
  };
};

// src/lib/doc-sync.ts
var DEFAULT_DOC_GLOBS = ["docs/**", "**/*.md", "README*"];
var parseDocPatterns = (input) => {
  if (!input) {
    return [...DEFAULT_DOC_GLOBS];
  }
  if (Array.isArray(input)) {
    const patterns = input.map((value) => value.trim()).filter(Boolean);
    return patterns.length ? patterns : [...DEFAULT_DOC_GLOBS];
  }
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length ? lines : [...DEFAULT_DOC_GLOBS];
};
var writeDocGlobsFile = (patterns, destination) => {
  const abs = import_node_path5.default.resolve(destination);
  import_node_fs4.default.mkdirSync(import_node_path5.default.dirname(abs), { recursive: true });
  import_node_fs4.default.writeFileSync(abs, `${patterns.join("\n")}
`, "utf8");
  return abs;
};
var collectCommitSummary = async (options) => {
  const { baseRef, headRef, headSha, outputPath } = options;
  const abs = import_node_path5.default.resolve(outputPath);
  const range = headRef ? [`origin/${baseRef}..${headRef}`] : [`origin/${baseRef}..HEAD`];
  try {
    await runCommand({ command: "git", args: ["fetch", "--no-tags", "origin", baseRef] });
  } catch (error2) {
    logger.warn("Failed to fetch base ref; continuing with local data", { baseRef, error: error2 });
  }
  try {
    const { stdout } = await runCommand({
      command: "git",
      args: ["log", "--no-merges", "--pretty=format:- %s (%h)", ...range],
      silent: true
    });
    const content = stdout.trim();
    if (content) {
      import_node_fs4.default.writeFileSync(abs, `${content}
`, "utf8");
    } else {
      import_node_fs4.default.writeFileSync(
        abs,
        `- No commits detected between origin/${baseRef} and ${headSha ?? headRef ?? "HEAD"}.
`,
        "utf8"
      );
    }
  } catch (error2) {
    logger.warn("Unable to collect commit summary; writing fallback message", { error: error2 });
    import_node_fs4.default.writeFileSync(
      abs,
      `- Unable to compute commits for base ${baseRef} (${error2.message}).
`,
      "utf8"
    );
  }
};
var escapeRegex = (segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var globToRegex = (glob) => {
  let pattern = "^";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === "*") {
      const next = glob[i + 1];
      if (next === "*") {
        pattern += ".*";
        i += 1;
      } else {
        pattern += "[^/]*";
      }
    } else if (char === "?") {
      pattern += "[^/]";
    } else {
      pattern += escapeRegex(char);
    }
  }
  pattern += "$";
  return new RegExp(pattern);
};
var normalisePath = (filePath) => filePath.replace(/\\/g, "/").replace(/^\.\//, "");
var classifyDiffFiles = async (patterns) => {
  const regexes = patterns.map(globToRegex);
  const { stdout } = await runCommand({ command: "git", args: ["diff", "--name-only"], silent: true });
  const files = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const docFiles = [];
  const otherFiles = [];
  files.forEach((file) => {
    const normalized = normalisePath(file);
    if (regexes.some((regex) => regex.test(normalized))) {
      docFiles.push(file);
    } else {
      otherFiles.push(file);
    }
  });
  return { docFiles, otherFiles };
};
var assertDocsOnlyChanged = async (patterns) => {
  const { otherFiles } = await classifyDiffFiles(patterns);
  if (otherFiles.length) {
    throw new Error(`Non-documentation files were modified: ${otherFiles.join(", ")}`);
  }
};
var saveFileList = (files, outputPath) => {
  const abs = import_node_path5.default.resolve(outputPath);
  import_node_fs4.default.mkdirSync(import_node_path5.default.dirname(abs), { recursive: true });
  import_node_fs4.default.writeFileSync(abs, `${files.join("\n")}
`, "utf8");
};
var computeDocPatch = async (outputPath) => {
  const { stdout } = await runCommand({ command: "git", args: ["diff", "--binary"], silent: true });
  import_node_fs4.default.writeFileSync(import_node_path5.default.resolve(outputPath), stdout, "utf8");
};
var hasPendingChanges = async () => {
  const { stdout } = await runCommand({
    command: "git",
    args: ["status", "--porcelain"],
    silent: true
  });
  return Boolean(stdout.trim());
};

// src/lib/templates.ts
var import_node_fs5 = __toESM(require("fs"));
var import_node_path6 = __toESM(require("path"));
var escapeRegex2 = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var renderTemplateFile = ({ templatePath, outputPath, variables }) => {
  const template = import_node_fs5.default.readFileSync(import_node_path6.default.resolve(templatePath), "utf8");
  let rendered = template;
  for (const [needle, replacement] of Object.entries(variables)) {
    const regex = new RegExp(escapeRegex2(needle), "g");
    rendered = rendered.replace(regex, replacement);
  }
  import_node_fs5.default.mkdirSync(import_node_path6.default.dirname(outputPath), { recursive: true });
  import_node_fs5.default.writeFileSync(import_node_path6.default.resolve(outputPath), rendered, "utf8");
};

// src/lib/git.ts
var commitAll = async (message, cwd) => {
  await runCommand({ command: "git", args: ["add", "--all"], cwd });
  await runCommand({ command: "git", args: ["commit", "-m", message], cwd });
};
var pushChanges = async (options) => {
  const remote = options.remote ?? "origin";
  const ref = options.ref ?? "HEAD";
  const args = ["push"];
  if (options.forceWithLease) {
    args.push("--force-with-lease");
  }
  args.push(remote, ref);
  await runCommand({ command: "git", args, cwd: options.cwd });
};
var ensureGitUser = async (options) => {
  const name = options?.name ?? "github-actions[bot]";
  const email = options?.email ?? "github-actions[bot]@users.noreply.github.com";
  await runCommand({ command: "git", args: ["config", "user.name", name], cwd: options?.cwd });
  await runCommand({ command: "git", args: ["config", "user.email", email], cwd: options?.cwd });
};
var getHeadSha = async (cwd) => {
  const { stdout } = await runCommand({ command: "git", args: ["rev-parse", "HEAD"], cwd, silent: true });
  return stdout.trim();
};

// src/commands/doc-sync.ts
var readFileOrDefault = (filePath, fallback) => {
  if (!import_node_fs6.default.existsSync(filePath)) {
    return fallback;
  }
  const contents = import_node_fs6.default.readFileSync(filePath, "utf8").trim();
  return contents || fallback;
};
var collectDocPatterns = (options) => {
  if (options.docGlob?.length) {
    return parseDocPatterns(options.docGlob.join("\n"));
  }
  if (options.docGlobs) {
    return parseDocPatterns(options.docGlobs);
  }
  return [...DEFAULT_DOC_GLOBS];
};
var ensureGitIgnoreEntries = (paths) => {
  const excludePath = import_node_path7.default.resolve(".git/info/exclude");
  import_node_fs6.default.mkdirSync(import_node_path7.default.dirname(excludePath), { recursive: true });
  const existing = import_node_fs6.default.existsSync(excludePath) ? import_node_fs6.default.readFileSync(excludePath, "utf8").split(/\r?\n/).filter(Boolean) : [];
  const entries = new Set(existing);
  let changed = false;
  paths.map((entry) => entry.trim()).filter(Boolean).forEach((entry) => {
    if (!entries.has(entry)) {
      entries.add(entry);
      changed = true;
    }
  });
  if (changed) {
    import_node_fs6.default.writeFileSync(excludePath, `${Array.from(entries).join("\n")}
`, "utf8");
  }
};
var registerDocSyncCommand = (program2) => {
  program2.command("doc-sync").description("Run the documentation sync workflow end-to-end.").option("--doc-globs <multiline>", "Newline-separated glob list defining documentation scope").option("--doc-glob <pattern>", "Additional doc glob (can be repeated)", (value, prev = []) => {
    prev.push(value);
    return prev;
  }).option("--doc-globs-file <path>", "Path where doc globs manifest will be written", "doc-globs.txt").option("--prompt-template <path>", "Codex prompt template", "prompts/codex-doc-sync.md").option("--prompt-path <path>", "Rendered prompt destination", "codex_prompt.md").option("--report-path <path>", "Doc summary markdown path", "doc-sync-report.md").option("--commits-path <path>", "Commit summary path", "doc-commits.md").option("--patch-path <path>", "Diff patch output", "doc-changes.patch").option("--files-path <path>", "Touched file list output", "doc-changes.txt").option("--base-ref <ref>", "Base branch ref (default: PR base or main)").option("--head-ref <ref>", "Head branch ref (default: PR head)").option("--head-sha <sha>", "Head commit SHA override").option("--pull-number <number>", "Pull request number", (value) => Number.parseInt(value, 10)).option("--codex-bin <path>", "Override Codex binary path for the SDK", "codex").option("--model <name>", "Codex model override").option("--effort <level>", "Codex effort override").option("--safety-strategy <mode>", "Legacy safety strategy flag (ignored when using the SDK)").option("--dry-run", "Skip committing/pushing, only show summary", false).option("--no-auto-commit", "Do not create a git commit").option("--no-auto-push", "Do not push changes upstream").option("--no-comment", "Skip PR comment").option("--event-path <path>", "Event payload override path").option("--repo <owner/repo>", "Override repository when running locally").option("--enable-network", "Allow Codex outbound network access", false).option("--enable-web-search", "Allow Codex to run web searches", false).action(async (opts) => {
    const repoOverride = opts.repo ? parseRepo(opts.repo) : void 0;
    const ctx = loadActionContext({ eventPath: opts.eventPath, repo: repoOverride });
    const payload = readEventPayload(ctx.eventPath) ?? {};
    const repoFull = `${ctx.repo.owner}/${ctx.repo.repo}`;
    const pullNumber = opts.pullNumber ?? (payload.pull_request ? requirePullRequestNumber(payload) : void 0);
    if (!pullNumber) {
      throw new Error("doc-sync requires a pull request context or --pull-number");
    }
    const headRepoFull = payload.pull_request?.head?.repo?.full_name;
    if (headRepoFull && headRepoFull !== repoFull) {
      throw new Error(
        `Head repo ${headRepoFull} differs from workflow repo ${repoFull}; doc-sync cannot push.`
      );
    }
    const baseRef = opts.baseRef ?? payload.pull_request?.base?.ref ?? process.env.GITHUB_BASE_REF ?? "main";
    const headRef = opts.headRef ?? payload.pull_request?.head?.ref ?? process.env.GITHUB_HEAD_REF ?? "HEAD";
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
    const docScope = docPatterns.map((pattern) => `- ${pattern}`).join("\n");
    const commitSummary = readFileOrDefault(opts.commitsPath, "- No commits provided.");
    renderTemplateFile({
      templatePath: opts.promptTemplate,
      outputPath: opts.promptPath,
      variables: {
        "{{BASE_REF}}": baseRef,
        "{{HEAD_REF}}": headRef,
        "{{PR_NUMBER}}": String(pullNumber),
        "{{REPOSITORY}}": repoFull,
        "{{DOC_SCOPE}}": docScope,
        "{{COMMIT_SUMMARY}}": commitSummary,
        "{{REPORT_PATH}}": opts.reportPath
      }
    });
    if (opts.codexArgs) {
      logger.warn("codexArgs are not supported when using the Codex SDK and will be ignored.");
    }
    if (opts.safetyStrategy) {
      logger.warn("safetyStrategy is not configurable via the Codex SDK and will be ignored.");
    }
    const codex = new CodexClient(opts.codexBin);
    const extraEnv = {
      DOC_REPORT_PATH: import_node_path7.default.resolve(opts.reportPath),
      DOC_BASE_REF: baseRef,
      DOC_HEAD_REF: headRef,
      DOC_HEAD_SHA: headSha ?? "",
      DOC_PR_NUMBER: String(pullNumber),
      DOC_REPOSITORY: repoFull,
      DOC_GLOBS_FILE: docGlobsPath,
      GH_TOKEN: process.env.GITHUB_TOKEN ?? "",
      GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? ""
    };
    await codex.run({
      promptPath: import_node_path7.default.resolve(opts.promptPath),
      model: opts.model,
      effort: opts.effort,
      extraEnv,
      networkAccessEnabled: Boolean(opts.enableNetwork),
      webSearchEnabled: Boolean(opts.enableWebSearch)
    });
    await assertDocsOnlyChanged(docPatterns);
    const { docFiles } = await classifyDiffFiles(docPatterns);
    if (!docFiles.length) {
      logger.info("Codex did not modify documentation files.");
      return;
    }
    await saveFileList(docFiles, opts.filesPath);
    await computeDocPatch(opts.patchPath);
    if (opts.dryRun) {
      logger.info("Doc-sync dry run complete. Files touched:");
      docFiles.forEach((file) => logger.info(` - ${file}`));
      return;
    }
    const pendingChanges = await hasPendingChanges();
    if (pendingChanges && opts.autoCommit === false) {
      logger.warn("auto-commit disabled; documentation edits remain uncommitted.");
    }
    if (pendingChanges && opts.autoCommit !== false) {
      await ensureGitUser();
      await commitAll(`[skip ci][doc-sync] Auto-update docs for PR #${pullNumber}`);
    }
    const commitSha = await getHeadSha();
    if (opts.autoPush !== false) {
      if (opts.autoCommit === false && pendingChanges) {
        throw new Error("Cannot push documentation updates when auto-commit is disabled.");
      }
      await pushChanges({ ref: `HEAD:${headRef}` });
      logger.info(`Pushed documentation updates to ${headRef}`);
    } else {
      logger.info("autoPush disabled; skipping git push.");
    }
    if (opts.comment !== false) {
      const report = readFileOrDefault(opts.reportPath, "Doc sync completed.");
      const filesList = docFiles.map((file) => `- ${file}`).join("\n") || "- (none)";
      const body = [
        "\u{1F916} Documentation synchronized automatically.",
        "",
        report,
        "",
        "Updated files:",
        filesList,
        "",
        `Commit: ${commitSha}`
      ].join("\n");
      await createIssueComment(ctx, pullNumber, body);
      logger.info("Posted documentation summary comment.");
    }
  });
};

// src/lib/go.ts
var core2 = __toESM(require("@actions/core"));
var tc = __toESM(require("@actions/tool-cache"));
var import_node_fs7 = __toESM(require("fs"));
var import_node_path8 = __toESM(require("path"));
var import_semver = __toESM(require("semver"));
var import_string_argv = __toESM(require("string-argv"));
var PLATFORM_MAP = {
  linux: "linux",
  darwin: "darwin",
  win32: "windows",
  aix: "linux",
  freebsd: "linux",
  openbsd: "linux",
  sunos: "linux",
  android: "linux",
  haiku: "linux",
  cygwin: "windows"
};
var ARCH_MAP = {
  x64: "amd64",
  arm64: "arm64",
  arm: "armv6l",
  ia32: "386",
  ppc64: "ppc64le",
  s390x: "s390x",
  loong64: "loong64",
  mips: "mips",
  mipsel: "mipsle",
  riscv64: "riscv64"
};
var normaliseVersion = (value) => {
  const cleaned = value.replace(/^go/i, "");
  const coerced = import_semver.default.coerce(cleaned);
  return coerced?.version ?? cleaned;
};
var detectPlatform = () => PLATFORM_MAP[process.platform] ?? "linux";
var detectArch = () => ARCH_MAP[process.arch] ?? "amd64";
var installGo = async (version) => {
  const normalized = normaliseVersion(version);
  if (!normalized) {
    throw new Error(`Unable to parse Go version: ${version}`);
  }
  const cached = tc.find("go", normalized);
  if (cached) {
    const bin = import_node_path8.default.join(cached, "bin");
    core2.addPath(bin);
    return bin;
  }
  const platform = detectPlatform();
  const arch = detectArch();
  const ext = platform === "windows" ? "zip" : "tar.gz";
  const filename = `go${normalized}.${platform}-${arch}.${ext}`;
  const url = `https://go.dev/dl/${filename}`;
  logger.info(`Downloading Go ${normalized} from ${url}`);
  const downloadPath = await tc.downloadTool(url);
  const extracted = ext === "zip" ? await tc.extractZip(downloadPath) : await tc.extractTar(downloadPath);
  const cachePath = await tc.cacheDir(import_node_path8.default.join(extracted, "go"), "go", normalized);
  const binPath = import_node_path8.default.join(cachePath, "bin");
  core2.addPath(binPath);
  return binPath;
};
var readVersionFromFile = (filePath) => {
  if (!import_node_fs7.default.existsSync(filePath)) {
    return void 0;
  }
  const raw = import_node_fs7.default.readFileSync(filePath, "utf8");
  const match = raw.match(/^go\s+(\d+\.\d+(?:\.\d+)?)$/m);
  return match?.[1];
};
var runGoTests = async (options) => {
  const workingDirectory = options.workingDirectory ?? process.cwd();
  let resolvedVersion = options.goVersion;
  if (!resolvedVersion && options.goVersionFile) {
    resolvedVersion = readVersionFromFile(import_node_path8.default.resolve(options.goVersionFile));
  }
  if (resolvedVersion) {
    await installGo(resolvedVersion);
  }
  if (options.preTest) {
    await runCommand({
      command: "bash",
      args: ["-lc", options.preTest],
      cwd: workingDirectory
    });
  }
  const flags = options.testFlags ? (0, import_string_argv.default)(options.testFlags) : ["./..."];
  await runCommand({
    command: "go",
    args: ["test", ...flags],
    cwd: workingDirectory,
    env: { ...process.env, ...options.env }
  });
};

// src/commands/go-tests.ts
var collectKeyValuePairs = (value, accumulator = {}) => {
  const [key, ...rest] = value.split("=");
  if (!key) {
    throw new Error(`Invalid env pair: ${value}`);
  }
  return { ...accumulator, [key]: rest.join("=") };
};
var registerGoTestsCommand = (program2) => {
  program2.command("go-tests").description("Execute Go tests with optional on-the-fly Go installation.").option("--go-version <version>", "Explicit Go version to install (e.g. 1.22.5)").option("--go-version-file <path>", "File that declares a Go version (defaults to go.mod)").option("--working-directory <path>", "Working directory for go test", ".").option("--test-flags <flags>", "Flags forwarded to go test (default: ./...)").option("--pre-test <script>", "Shell snippet executed before go test").option("--env <key=value>", "Environment variable forwarded to go test", collectKeyValuePairs, {}).action(async (opts) => {
    await runGoTests({
      goVersion: opts.goVersion,
      goVersionFile: opts.goVersionFile,
      workingDirectory: opts.workingDirectory,
      testFlags: opts.testFlags,
      preTest: opts.preTest,
      env: opts.env
    });
    logger.info("Go tests completed");
  });
};

// src/commands/release.ts
var import_node_fs8 = __toESM(require("fs"));
var import_node_os2 = __toESM(require("os"));
var import_node_path9 = __toESM(require("path"));
var RELEASE_SCHEMA = "prompts/codex-release-schema.json";
var buildNotesInput = (commits, extra) => {
  const commitLines = commits.map((commit) => `- ${commit.sha?.slice(0, 7)} ${commit.commit?.message?.split("\n")[0] ?? ""}`).join("\n");
  const extraBlock = extra ? `

### Extra Context
${extra}` : "";
  return `## Commits
${commitLines}${extraBlock}`;
};
var registerReleaseCommand = (program2) => {
  program2.command("release").description("Generate release notes with Codex and publish a GitHub release").requiredOption("--tag-name <tag>", "Tag to publish (e.g. v1.2.3)").option("--release-title <title>", "Release display name (defaults to tag)").option("--target <ref>", "Target ref/commit for the release", "main").option("--draft", "Create the release as a draft", false).option("--skip-tests", "Skip Go test execution", false).option("--go-version <version>", "Explicit Go version to install").option("--go-version-file <path>", "File with Go version (default go.mod)").option("--test-flags <flags>", "Flags forwarded to go test (default ./...)").option("--pre-test <script>", "Shell snippet executed before go test").option("--prompt <path>", "Prompt file path for release notes", "prompts/codex-release-template.md").option("--model <name>", "Codex model override").option("--effort <level>", "Codex reasoning effort override").option("--codex-bin <path>", "Override Codex binary path for the SDK", "codex").option("--enable-network", "Allow Codex outbound network access", false).option("--enable-web-search", "Allow Codex to run web searches", false).option("--notes-extra <markdown>", "Extra markdown context appended to Codex input").option("--project-name <text>", "Project name referenced in the prompt", "Codex Go SDK").option("--project-language <text>", "Primary language referenced in the prompt", "Go").option("--package-name <text>", "Package/module identifier referenced in the prompt", "github.com/activadee/godex").option("--project-purpose <text>", "One-line description of the project purpose", "Provides a wrapper around the Codex CLI.").option("--repository-url <text>", "Repository URL or identifier referenced in the prompt", "https://github.com/activadee/godex").option("--commit-limit <number>", "Number of commits to include", (value) => Number.parseInt(value, 10), 50).option("--dry-run", "Print notes without publishing release", false).option("--repo <owner/repo>", "Override repository when running locally").action(async (opts) => {
    const repoOverride = opts.repo ? parseRepo(opts.repo) : void 0;
    const ctx = loadActionContext({ repo: repoOverride });
    if (!opts.skipTests) {
      await runGoTests({
        goVersion: opts.goVersion,
        goVersionFile: opts.goVersionFile,
        testFlags: opts.testFlags,
        preTest: opts.preTest
      });
    } else {
      logger.info("Skipping Go tests");
    }
    const commits = await listRecentCommits(ctx, { target: opts.target, limit: opts.commitLimit });
    const input = buildNotesInput(commits, opts.notesExtra);
    if (opts.codexArgs) {
      logger.warn("codexArgs are not supported when using the Codex SDK and will be ignored.");
    }
    const codex = new CodexClient(opts.codexBin);
    const templatePath = import_node_path9.default.resolve(opts.prompt);
    const { promptPath, cleanup } = renderReleasePrompt(templatePath, buildReleasePromptVariables(opts));
    let notes;
    try {
      notes = await codex.run({
        promptPath,
        input,
        model: opts.model,
        effort: opts.effort,
        outputSchemaPath: import_node_path9.default.resolve(RELEASE_SCHEMA),
        networkAccessEnabled: Boolean(opts.enableNetwork),
        webSearchEnabled: Boolean(opts.enableWebSearch)
      });
    } finally {
      cleanup();
    }
    const releaseBody = formatReleaseBody(notes);
    if (opts.dryRun) {
      logger.info("Generated release notes (dry-run):");
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
var formatReleaseBody = (raw) => {
  try {
    const parsed = JSON.parse(raw);
    const overview = parsed.overview?.trim() ?? "No overview provided.";
    const highlights = Array.isArray(parsed.highlights) && parsed.highlights.length ? parsed.highlights.map((item) => `- ${item}`).join("\n") : "- Update details unavailable.";
    return [`${overview}`, "", "## Highlights", highlights].join("\n");
  } catch (error2) {
    logger.warn("Failed to parse structured release notes; using raw output.", {
      message: error2.message
    });
    return raw;
  }
};
var buildReleasePromptVariables = (opts) => ({
  "{{PROJECT_NAME}}": opts.projectName ?? "Codex Go SDK",
  "{{PROJECT_LANGUAGE}}": opts.projectLanguage ?? "Go",
  "{{PACKAGE_NAME}}": opts.packageName ?? "github.com/activadee/godex",
  "{{PROJECT_PURPOSE}}": opts.projectPurpose ?? "Provides a wrapper around the Codex CLI.",
  "{{REPOSITORY_URL}}": opts.repositoryUrl ?? "https://github.com/activadee/godex"
});
var renderReleasePrompt = (templatePath, variables) => {
  const tempDir = import_node_fs8.default.mkdtempSync(import_node_path9.default.join(import_node_os2.default.tmpdir(), "codex-release-"));
  const promptPath = import_node_path9.default.join(tempDir, "prompt.md");
  renderTemplateFile({ templatePath, outputPath: promptPath, variables });
  const cleanup = () => {
    try {
      import_node_fs8.default.rmSync(tempDir, { recursive: true, force: true });
    } catch {
    }
  };
  return { promptPath, cleanup };
};

// src/commands/review.ts
var import_node_path10 = __toESM(require("path"));
var REVIEW_SCHEMA = "prompts/codex-review-schema.json";
var buildCodexInput = async (options, event, ctx) => {
  const pullNumber = options.pullNumber ?? requirePullRequestNumber(event);
  const pr = await fetchPullRequest(ctx, pullNumber);
  const files = await listPullRequestFiles(ctx, pullNumber);
  const fileSummaries = files.map((file) => {
    const header = `### ${file.filename} (${file.status}${file.changes ? `, \xB1${file.changes}` : ""})`;
    const patch = file.patch ? `

\`\`\`diff
${file.patch}
\`\`\`` : "";
    return `${header}${patch}`;
  }).join("\n\n");
  const metadata = [
    `Title: ${pr.title}`,
    `Author: ${pr.user?.login ?? "unknown"}`,
    `Base: ${pr.base?.ref}`,
    `Head: ${pr.head?.label}`,
    `URL: ${pr.html_url}`,
    pr.body ? `Body:
${pr.body}` : void 0
  ].filter(Boolean).join("\n\n");
  const guidance = options.promptExtra ? `

### Additional Reviewer Guidance
${options.promptExtra}` : "";
  return `${metadata}${guidance}

---

${fileSummaries}`;
};
var formatReviewResponse = (raw) => {
  try {
    const parsed = JSON.parse(raw);
    const summary = parsed.summary?.trim() || "No issues detected.";
    const comments = Array.isArray(parsed.comments) ? parsed.comments : [];
    const findings = comments.length ? comments.map((comment) => `- \`${comment.path}:${comment.line}\`
  ${comment.body}`).join("\n") : "- \u2705 No blocking findings.";
    return [`## Summary`, summary, "", "## Findings", findings].join("\n");
  } catch (error2) {
    logger.warn("Failed to parse structured review output; returning raw text.", {
      message: error2.message
    });
    return raw;
  }
};
var registerReviewCommand = (program2) => {
  program2.command("review").description("Run the Codex PR review workflow").option("--prompt <path>", "Prompt file to use", "prompts/codex-review.md").option("--prompt-extra <markdown>", "Additional markdown appended to the prompt").option("--model <name>", "Codex model override").option("--effort <level>", "Codex reasoning effort override").option("--codex-bin <path>", "Override Codex binary path for the SDK", "codex").option("--enable-network", "Allow Codex outbound network access", false).option("--enable-web-search", "Allow Codex to run web searches", false).option("--dry-run", "Only print the Codex output without submitting a review", false).option("--event-path <path>", "Path to a GitHub event payload override").option(
    "--pull-number <number>",
    "Explicit pull request number override",
    (value) => Number.parseInt(value, 10)
  ).option("--repo <owner/repo>", "Override repository when running locally").action(async (opts) => {
    const repoOverride = opts.repo ? parseRepo(opts.repo) : void 0;
    const ctx = loadActionContext({ eventPath: opts.eventPath, repo: repoOverride });
    const event = readEventPayload(ctx.eventPath) ?? {};
    const input = await buildCodexInput(opts, event, ctx);
    const codex = new CodexClient(opts.codexBin);
    const output = await codex.run({
      promptPath: import_node_path10.default.resolve(opts.prompt),
      input,
      model: opts.model,
      effort: opts.effort,
      outputSchemaPath: import_node_path10.default.resolve(REVIEW_SCHEMA),
      networkAccessEnabled: Boolean(opts.enableNetwork),
      webSearchEnabled: Boolean(opts.enableWebSearch)
    });
    const body = formatReviewResponse(output);
    if (opts.dryRun) {
      logger.info("Codex output (dry-run):");
      logger.info(output);
      return;
    }
    const pullNumber = opts.pullNumber ?? requirePullRequestNumber(event);
    await createReview(ctx, pullNumber, body);
    logger.info(`Submitted review for PR #${pullNumber}`);
  });
};

// src/program.ts
var createProgram = () => {
  const program2 = new import_commander.Command();
  program2.name("codex-workflows").description("Unified Codex workflow CLI for GitHub Actions and local use.").version(process.env.npm_package_version ?? "0.0.0");
  registerReviewCommand(program2);
  registerGoTestsCommand(program2);
  registerReleaseCommand(program2);
  registerAutoLabelCommand(program2);
  registerDocSyncCommand(program2);
  return program2;
};

// src/cli.ts
var program = createProgram();
program.parseAsync(process.argv).catch((error2) => {
  logger.fatal(error2);
  process.exit(1);
});
//# sourceMappingURL=index.cjs.map