# open-workflows

AI-powered GitHub automation CLI for code reviews, issue labeling, and documentation sync.

Powered by [OpenCode](https://opencode.ai).

## Installation

```bash
# Use directly with npx (recommended)
npx open-workflows <command>

# Or install globally
npm install -g open-workflows
```

## Commands

### Review a PR

```bash
# In GitHub Actions (auto-detects PR)
npx open-workflows review

# Review specific PR
npx open-workflows review --pr 123 --repo owner/repo

# Review local changes
npx open-workflows review --local

# Preview without posting
npx open-workflows review --dry-run
```

### Label an Issue

```bash
# In GitHub Actions (auto-detects issue)
npx open-workflows label

# Label specific issue
npx open-workflows label --issue 456 --repo owner/repo

# Preview without applying
npx open-workflows label --dry-run
```

### Sync Documentation

```bash
# In GitHub Actions
npx open-workflows doc-sync

# For local changes
npx open-workflows doc-sync --local

# Preview without committing
npx open-workflows doc-sync --dry-run
```

### Interactive Mode

Handles `/oc` and `/opencode` slash commands from GitHub comments.

```bash
# Only works in GitHub Actions
npx open-workflows interactive
```

## GitHub Actions Usage

### PR Review

```yaml
name: PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - run: npx open-workflows review
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          MINIMAX_API_KEY: ${{ secrets.MINIMAX_API_KEY }}
```

### Issue Labeling

```yaml
name: Issue Label

on:
  issues:
    types: [opened, edited]

jobs:
  label:
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - uses: actions/checkout@v4
      - run: npx open-workflows label
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          MINIMAX_API_KEY: ${{ secrets.MINIMAX_API_KEY }}
```

### Doc Sync

```yaml
name: Doc Sync

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - run: npx open-workflows doc-sync
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          MINIMAX_API_KEY: ${{ secrets.MINIMAX_API_KEY }}
```

### Interactive (Slash Commands)

```yaml
name: OpenCode

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

jobs:
  opencode:
    if: contains(github.event.comment.body, '/oc') || contains(github.event.comment.body, '/opencode')
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v4
      - run: npx open-workflows interactive
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          MINIMAX_API_KEY: ${{ secrets.MINIMAX_API_KEY }}
```

## Options

| Option | Description |
|--------|-------------|
| `--pr <number>` | PR number to review |
| `--issue <number>` | Issue number to label |
| `--repo <owner/repo>` | Repository |
| `--model <model>` | AI model (default: `minimax/MiniMax-M2.1`) |
| `--local` | Use local git changes |
| `--dry-run` | Preview without posting/committing |
| `--verbose` | Detailed output |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes (in CI) | GitHub authentication token |
| `MINIMAX_API_KEY` | Yes | MiniMax API key for AI |

## Local Usage

The CLI works locally too! You need:

1. `gh` CLI installed and authenticated (`gh auth login`)
2. `MINIMAX_API_KEY` environment variable set

```bash
# Export your API key
export MINIMAX_API_KEY=your-key-here

# Review a PR from your terminal
npx open-workflows review --pr 123 --repo owner/repo

# Review local uncommitted changes
npx open-workflows review --local
```

## Requirements

- Node.js 18+
- GitHub CLI (`gh`) for GitHub operations
- OpenCode CLI (auto-installed if missing)

## License

MIT
