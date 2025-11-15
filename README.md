# Codex Unified Workflows

This repository now ships a single TypeScript-powered CLI plus a matching GitHub Action that replaces the legacy reusable workflows (`codex-review.yml`, `go-tests.yml`, `release.yml`, `auto-label.yml`, and `codex-doc-sync.yml`). Each workflow is implemented as a dedicated CLI command, and the Action exposes them via a single `command` input so downstream repositories only have to pin one artifact.

## Requirements

- **Node.js 20+** (the GitHub Action runs on the Node 20 runtime, and the CLI enforces `engines.node >= 20`).
- **Codex credentials**: the bundled `@openai/codex-sdk` expects `~/.codex/auth.json`. The CLI/action will mirror `CODEX_AUTH_JSON` or `CODEX_AUTH_JSON_B64` into that path automatically; otherwise provision the file yourself before running commands.
- **`GITHUB_TOKEN`/`GH_TOKEN`** with repo + PR scope for operations that interact with GitHub APIs (reviews, releases, doc-sync comments/pushes).

## GitHub Action Usage

```yaml
name: codex-review

on:
  pull_request:
    types: [opened, reopened, synchronize, ready_for_review]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - name: Codex review
        uses: activadee/codex-shared-workflows@v2
        with:
          command: review
          prompt_extra: |
            Prioritize security regressions and visible UX issues.
        env:
          CODEX_AUTH_JSON_B64: ${{ secrets.CODEX_AUTH_JSON_B64 }}
```

Multiple workflows can be triggered from the same action by adjusting `command`:

```yaml
  triage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: activadee/codex-shared-workflows@v2
        with:
          command: auto-label
          max_labels: 3
        env:
          CODEX_AUTH_JSON_B64: ${{ secrets.CODEX_AUTH_JSON_B64 }}

  docs:
    needs: review
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Sync documentation
        uses: activadee/codex-shared-workflows@v2
        with:
          command: doc-sync
          doc_globs: |
            docs/**
            **/*.md
            README*
        env:
          CODEX_AUTH_JSON_B64: ${{ secrets.CODEX_AUTH_JSON_B64 }}
```

Available `with:` inputs mirror the CLI flags (see Command Reference). Every command accepts `model`, `effort`, `codex_bin`, `dry_run`, `prompt_path`, plus the booleans `network_access`/`web_search` (both default to `false`).

## CLI Usage

Install via npm (local or CI) and call any workflow directly:

```bash
npx codex-workflows review --prompt-extra "Focus on API contracts" --dry-run
npx codex-workflows go-tests --go-version 1.22.5 --test-flags "./... -race"
npx codex-workflows release --tag-name v1.3.0 --notes-extra "Highlights customer fixes"
npx codex-workflows auto-label --max-labels 2
npx codex-workflows doc-sync --doc-globs "docs/**\n**/*.md" --no-auto-push --dry-run
```

## Examples

Detailed examples for each command live under `docs/examples`:

- `docs/examples/review.md` – PR review (Action + CLI)
- `docs/examples/go-tests.md` – Go test runner
- `docs/examples/release.md` – Release note generation & publishing
- `docs/examples/auto-label.md` – Issue/PR labeling
- `docs/examples/doc-sync.md` – Documentation sync workflow

CLI execution shares the same environment conventions as the Action: export `CODEX_AUTH_JSON_B64`, `GITHUB_TOKEN`, and (optionally) `GH_TOKEN` before running commands. Outside GitHub Actions, provide repository context by either setting `GITHUB_REPOSITORY=owner/repo` or passing `--repo owner/repo` to commands that hit the GitHub API (review, release, auto-label, doc-sync).

## Command Reference

| Command | Purpose | Key Flags |
| --- | --- | --- |
| `review` | Generates a Codex PR review and submits it via `pulls.createReview`. | `--prompt`, `--prompt-extra`, `--model`, `--effort`, `--codex-args`, `--pull-number`, `--dry-run` |
| `go-tests` | Installs (if requested) and runs `go test`. | `--go-version`, `--go-version-file`, `--working-directory`, `--test-flags`, `--pre-test`, `--env KEY=VALUE` |
| `release` | Optionally runs Go tests, asks Codex for release notes, and creates/updates a GitHub release. | `--tag-name` (required), `--release-title`, `--target`, `--skip-tests`, `--notes-extra`, `--project-name`, `--project-language`, `--package-name`, `--project-purpose`, `--repository-url`, `--commit-limit`, Codex flags |
| `auto-label` | Calls Codex to propose labels for an issue/PR and applies them. | `--prompt`, `--max-labels`, `--dry-run` |
| `doc-sync` | Replaces the multi-job doc-sync workflow: prepares prompts, invokes Codex edits, verifies doc-only changes, commits, pushes, and comments. | `--doc-globs`, `--prompt-template`, `--safety-strategy`, `--no-auto-commit`, `--no-auto-push`, `--no-comment`, Codex flags |

### `review`

- Reads PR context from `GITHUB_EVENT_PATH` or `--pull-number`.
- Builds diff context (`listFiles`) and streams it into `codex exec` using `prompts/codex-review.md` by default.
- Posts Codex output as a standard PR review comment; `--dry-run` prints to stdout.

### `go-tests`

- Optionally installs Go via `@actions/tool-cache` (respecting `--go-version` or `--go-version-file`).
- Runs `pre-test` shell snippets before executing `go test` with parsed flags.
- Accepts additional env vars through repeated `--env KEY=VALUE` options or multiline `env` action input.

### `release`

- Reuses `go-tests` plumbing (unless `--skip-tests`).
- Fetches recent commits (`commit_limit`, default 50) and feeds the summary plus `notes_extra` into `prompts/codex-release-template.md`.
- Customize the release context without editing the prompt by supplying `--project-name`, `--project-language`, `--package-name`, `--project-purpose`, or `--repository-url` (these values populate the template placeholders before Codex runs).
- Calls GitHub Releases API to create/update the tag and logs the release URL (also printed in action logs).

### `auto-label`

- Uses `prompts/codex-auto-label.md` to instruct Codex to return a JSON array of labels.
- Ensures labels exist (creates when missing) and applies them via `issues.addLabels` unless `--dry-run` is set.

### `doc-sync`

- Collapses the previous `prepare_inputs`, `edit_docs`, and `push_docs` jobs into one command.
- Writes doc scope manifests + commit summaries, renders `prompts/codex-doc-sync.md`, and exports the same env vars (`DOC_REPORT_PATH`, etc.) used by the original workflow to keep prompts intact.
- After Codex runs, verifies that only documentation globs changed, saves the file list + patch, optionally commits (`[skip ci][doc-sync] Auto-update docs for PR #N`), pushes to the head branch, and comments with the generated report.
- `--doc-globs` accepts newline-separated patterns; use `--no-auto-commit`/`--no-auto-push` if you want to inspect results manually.

## Migration Guide

| Legacy reusable workflow | New action invocation |
| --- | --- |
| `.github/workflows/codex-review.yml` | `uses: activadee/codex-shared-workflows@v2` + `with: command: review` |
| `.github/workflows/go-tests.yml` | `uses: activadee/codex-shared-workflows@v2` + `with: command: go-tests` |
| `.github/workflows/release.yml` | `with: command: release` (same inputs as before). |
| `.github/workflows/auto-label.yml` | `with: command: auto-label` |
| `.github/workflows/codex-doc-sync.yml` | `with: command: doc-sync` |

Steps:

1. Remove `uses: activadee/codex-shared-workflows/.github/workflows/...` references.
2. Replace them with a single job that runs this action and passes `command` + the same inputs as before.
3. Ensure secrets (`CODEX_AUTH_JSON_B64`, `GITHUB_TOKEN`) remain available; doc-sync requires `contents` **and** `pull-requests` permissions so it can push commits and comment.
4. (Optional) Install the CLI locally to develop prompts or run workflows outside Actions: `npm install --save-dev activadee/codex-shared-workflows && npx codex-workflows review --dry-run`.

## Development

- Install dependencies: `npm install` (runs `tsup` via `prepare`).
- Lint/tests/type-check: `npm run verify`.
- Watch mode: `npm run dev`.
- Build distributable artifacts: `npm run build` (generates `dist/index.cjs` for the CLI binary and `dist/action.cjs` for GitHub Actions).

## Secrets recap

| Command | Required secrets |
| --- | --- |
| `review`, `auto-label`, `release`, `doc-sync` | `CODEX_AUTH_JSON_B64`, `GITHUB_TOKEN` (actions runtime) |
| `go-tests` | none (unless your tests hit private resources). |
| `doc-sync` | needs permission to push + comment, so configure the job with `permissions: { contents: write, pull-requests: write }` and ensure forks are disallowed (the command enforces same-repo branches by default). |

The repo keeps the existing prompt files under `prompts/*`; update those to change Codex behavior globally.
