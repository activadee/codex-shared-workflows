#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function globToRegex(glob) {
  let pattern = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === '*') {
      const next = glob[i + 1];
      if (next === '*') {
        pattern += '.*';
        i += 1;
      } else {
        pattern += '[^/]*';
      }
    } else if (char === '?') {
      pattern += '[^/]';
    } else {
      pattern += char.replace(/[\\^$+?.()|{}\[\]]/g, '\\$&');
    }
  }
  pattern += '$';
  return new RegExp(pattern);
}

function loadPatterns(globsFile) {
  const fallback = ['docs/**', '**/*.md', 'README*'];
  if (!globsFile) return fallback.map(globToRegex);
  const abs = path.resolve(globsFile);
  if (!fs.existsSync(abs)) return fallback.map(globToRegex);
  const patterns = fs
    .readFileSync(abs, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(globToRegex);
  return patterns.length ? patterns : fallback.map(globToRegex);
}

function listDiffFiles() {
  const diff = execSync('git diff --name-only', { encoding: 'utf8' });
  return diff.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function main() {
  const globsFile = process.argv[2];
  const patterns = loadPatterns(globsFile);
  const files = listDiffFiles();
  const nonDoc = files.filter((file) => !patterns.some((regex) => regex.test(file.replace(/^\.\//, ''))));

  if (nonDoc.length) {
    console.error('Non-doc files were modified:', nonDoc.join(', '));
    process.exit(1);
  }

  console.log(`${files.length} documentation file(s) modified.`);
}

if (require.main === module) {
  main();
}
