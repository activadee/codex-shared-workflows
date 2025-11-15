#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const OUTPUT_PATH = process.env.CODEX_DOC_SYNC_OUTPUT_PATH || 'codex-output.json';
const ALLOWLIST_PATH = process.env.CODEX_DOC_SYNC_ALLOWLIST_PATH || 'doc-allowlist.json';
const SUMMARY_PATH = process.env.CODEX_DOC_SYNC_SUMMARY_PATH || 'doc-sync-summary.json';
const PATCH_DIR = process.env.CODEX_DOC_SYNC_PATCH_DIR || 'doc-sync-patches';

const readJson = (file) => {
  if (!fs.existsSync(file)) {
    throw new Error(`Expected JSON file at ${file}`);
  }
  const raw = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse JSON from ${file}: ${error.message}`);
  }
};

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const allowlist = new Set(readJson(ALLOWLIST_PATH));
const output = readJson(OUTPUT_PATH);
const edits = Array.isArray(output.edits) ? output.edits : [];
const followUps = Array.isArray(output.follow_ups) ? output.follow_ups : [];
const summary = typeof output.summary === 'string' ? output.summary.trim() : '';

ensureDir(PATCH_DIR);

const applied = [];

const normalizePatch = (patch, filePath) => {
  if (typeof patch !== 'string' || patch.trim().length === 0) {
    return null;
  }
  const normalized = patch.replace(/\r\n/g, '\n').trim();
  if (!normalized.length) {
    return null;
  }
  const headerPattern = new RegExp(`^---\\s+(?:a/)?${escapeRegExp(filePath)}$`, 'm');
  if (headerPattern.test(normalized)) {
    return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
  }
  const withHeaders = `--- a/${filePath}\n+++ b/${filePath}\n${normalized}\n`;
  return withHeaders;
};

for (let index = 0; index < edits.length; index += 1) {
  const edit = edits[index];
  if (!edit || typeof edit !== 'object') {
    continue;
  }
  const targetPath = typeof edit.path === 'string' ? edit.path.trim() : '';
  if (!targetPath) {
    throw new Error(`Edit #${index + 1} is missing a path.`);
  }
  if (!allowlist.has(targetPath)) {
    throw new Error(`Edit #${index + 1} targets ${targetPath}, which is not an allowed documentation file.`);
  }
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Edit #${index + 1} references ${targetPath}, but the file does not exist in the workspace.`);
  }
  const patch = normalizePatch(edit.patch, targetPath);
  if (!patch) {
    throw new Error(`Edit #${index + 1} for ${targetPath} did not supply a valid patch.`);
  }
  const patchFile = path.join(PATCH_DIR, `${index + 1}-${path.basename(targetPath)}.patch`);
  fs.writeFileSync(patchFile, patch, 'utf8');

  const applyResult = spawnSync('git', ['apply', '--allow-empty', '--whitespace=fix', patchFile], {
    stdio: 'pipe',
  });
  if (applyResult.status !== 0) {
    const stderr = applyResult.stderr ? applyResult.stderr.toString() : '';
    throw new Error(`git apply failed for ${targetPath}: ${stderr}`);
  }

  applied.push({
    path: targetPath,
    justification:
      typeof edit.justification === 'string' && edit.justification.trim().length > 0
        ? edit.justification.trim()
        : null,
  });
}

const resultPayload = {
  summary: summary || (applied.length ? `Updated ${applied.length} documentation file${applied.length === 1 ? '' : 's'}.` : 'No documentation changes were applied.'),
  applied,
  follow_ups: followUps,
};

fs.writeFileSync(SUMMARY_PATH, JSON.stringify(resultPayload, null, 2));

console.log(`Codex doc sync applied ${applied.length} edit(s). Summary written to ${SUMMARY_PATH}.`);
