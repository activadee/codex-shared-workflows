#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_PATTERNS = ['docs/**', '**/*.md', 'README*'];

function parseInput(raw) {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function main() {
  const env = process.env;
  const targetPath = path.resolve(env.DOC_GLOBS_PATH || 'doc-globs.txt');
  const lines = parseInput(env.DOC_GLOBS);
  const patterns = lines.length ? lines : DEFAULT_PATTERNS;

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, patterns.join('\n'), 'utf8');

  console.log('Documentation scope:');
  patterns.forEach((pattern) => {
    console.log(` - ${pattern}`);
  });
}

if (require.main === module) {
  main();
}
