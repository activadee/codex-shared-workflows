#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_SCOPE = ['docs/**', '**/*.md', 'README*'];

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

function main() {
  const env = process.env;
  const templatePath = env.TEMPLATE_PATH;
  const promptPath = path.resolve(env.PROMPT_PATH || 'codex_prompt.md');
  const docScopePath = env.DOC_GLOBS_PATH || 'doc-globs.txt';
  const baseRef = env.BASE_REF || 'unknown-base';
  const prNumber = env.PR_NUMBER || 'unknown-pr';
  const reportPath = env.REPORT_PATH || 'doc-sync-report.md';

  if (!templatePath) {
    throw new Error('TEMPLATE_PATH env var is required');
  }

  const template = fs.readFileSync(path.resolve(templatePath), 'utf8');
  const scopeLines = readLines(docScopePath);
  const scopeSection = scopeLines.map((line) => `- ${line}`).join('\n');

  const replacements = new Map([
    ['{{BASE_REF}}', baseRef],
    ['{{PR_NUMBER}}', String(prNumber)],
    ['{{REPORT_PATH}}', reportPath],
    ['{{DOC_SCOPE}}', scopeSection],
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
