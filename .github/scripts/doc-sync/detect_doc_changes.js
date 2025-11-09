#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const opts = { globsFile: null, output: null };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--globs-file') {
      opts.globsFile = argv[++i];
    } else if (arg === '--output') {
      opts.output = argv[++i];
    } else if (arg === undefined) {
      break;
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  if (!opts.output) {
    console.error('--output is required');
    process.exit(1);
  }
  return opts;
}

function loadGlobs(globsFile) {
  let raw = '';
  if (globsFile) {
    const abs = path.resolve(globsFile);
    if (fs.existsSync(abs)) {
      raw = fs.readFileSync(abs, 'utf8');
    }
  } else if (process.env.DOC_GLOBS) {
    raw = process.env.DOC_GLOBS;
  }

  const patterns = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return patterns.length ? patterns : ['docs/**', '**/*.md', 'README*'];
}

function globToRegex(glob) {
  let pattern = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === '*') {
      let starCount = 1;
      while (glob[i + starCount] === '*') {
        starCount += 1;
      }
      if (starCount > 1) {
        pattern += '.*';
        i += starCount - 1;
      } else {
        pattern += '[^/]*';
      }
    } else if (char === '?') {
      pattern += '[^/]';
    } else {
      pattern += escapeRegex(char);
    }
  }
  pattern += '$';
  return new RegExp(pattern);
}

function escapeRegex(char) {
  return /[\\.^$+()|{}\[\]]/.test(char) ? `\\${char}` : char;
}

function toPosix(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

function listChangedFiles() {
  const result = spawnSync('git', ['status', '--porcelain', '-z', '--untracked-files=all'], {
    encoding: 'buffer',
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr?.toString('utf8') || '');
    process.exit(result.status || 1);
  }
  const entries = result.stdout.toString('utf8').split('\0');
  const files = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!entry) {
      continue;
    }
    const status = entry.slice(0, 2);
    let filePath = entry.slice(3);
    if ((status[0] === 'R' || status[0] === 'C') && i + 1 < entries.length) {
      filePath = entries[++i];
    }
    files.push(filePath);
  }
  return files;
}

function classify(files, patterns) {
  const regexes = patterns.map(globToRegex);
  const docFiles = [];
  const otherFiles = [];

  files.forEach((rawPath) => {
    const normalized = toPosix(rawPath);
    const matched = regexes.some((regex) => regex.test(normalized));
    if (matched) {
      docFiles.push(rawPath);
    } else {
      otherFiles.push(rawPath);
    }
  });
  return { docFiles, otherFiles };
}

function main() {
  const args = parseArgs(process.argv);
  const patterns = loadGlobs(args.globsFile);
  const changedFiles = listChangedFiles();

  const { docFiles, otherFiles } = classify(changedFiles, patterns);

  const outputPath = path.resolve(args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, docFiles.join('\n'), 'utf8');

  if (otherFiles.length) {
    console.error('Non-doc files were modified:\n- ' + otherFiles.sort().join('\n- '));
    process.exit(1);
  }

  if (docFiles.length) {
    console.log(`Detected ${docFiles.length} documentation file(s).`);
  } else {
    console.log('No documentation changes detected.');
  }
}

if (require.main === module) {
  main();
}
