# Example GitHub Actions Workflows

These are minimal examples showing how to use the `open-workflows` CLI in your repository.

## PR Review

Create `.github/workflows/pr-review.yml`:

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

## Issue Labeling

Create `.github/workflows/issue-label.yml`:

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

## Doc Sync

Create `.github/workflows/doc-sync.yml`:

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
        with:
          ref: ${{ github.head_ref }}
      - run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
      - run: npx open-workflows doc-sync
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          MINIMAX_API_KEY: ${{ secrets.MINIMAX_API_KEY }}
```

## Interactive (Slash Commands)

Create `.github/workflows/opencode.yml`:

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
