#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_SCOPE = ['docs/**', '**/*.md', 'README*'];
const DEFAULT_COMMITS = '- No commits provided.';

function readLines(filePath) {
  if (!filePath) return DEFAULT_SCOPE;
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) return DEFAULT_SCOPE;
  const lines = fs
    .readFileSync(abs, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? lines : DEFAULT_SCOPE;
}

function readCommitSummary(filePath) {
  if (!filePath) return DEFAULT_COMMITS;
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) return DEFAULT_COMMITS;
  const content = fs.readFileSync(abs, 'utf8').trim();
  return content.length ? content : DEFAULT_COMMITS;
}

function main() {
  const env = process.env;
  const templatePath = env.TEMPLATE_PATH;
  const promptPath = path.resolve(env.PROMPT_PATH || 'codex_prompt.md');
  const docScopePath = env.DOC_GLOBS_PATH || 'doc-globs.txt';
  const baseRef = env.BASE_REF || 'unknown-base';
  const headRef = env.HEAD_REF || 'unknown-head';
  const repository = env.REPOSITORY || 'unknown/repo';
  const prNumber = env.PR_NUMBER || 'unknown-pr';
  const reportPath = env.REPORT_PATH || 'doc-sync-report.md';
  const commitsPath = env.COMMITS_PATH || '';

  if (!templatePath) {
    throw new Error('TEMPLATE_PATH env var is required');
  }

  const template = fs.readFileSync(path.resolve(templatePath), 'utf8');
  const scopeLines = readLines(docScopePath);
  const scopeSection = scopeLines.map((line) => `- ${line}`).join('\n');
  const commitSummary = readCommitSummary(commitsPath);

  const replacements = new Map([
    ['{{BASE_REF}}', baseRef],
    ['{{PR_NUMBER}}', String(prNumber)],
    ['{{REPORT_PATH}}', reportPath],
    ['{{DOC_SCOPE}}', scopeSection],
    ['{{COMMIT_SUMMARY}}', commitSummary],
    ['{{HEAD_REF}}', headRef],
    ['{{REPOSITORY}}', repository],
  ]);

  let content = template;
  for (const [needle, value] of replacements) {
    content = content.replace(new RegExp(escapeRegex(needle), 'g'), value);
  }

  fs.writeFileSync(promptPath, content, 'utf8');
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (require.main === module) {
  main();
}
