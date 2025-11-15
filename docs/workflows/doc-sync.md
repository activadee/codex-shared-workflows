# Codex Doc Sync Workflow

The `codex-doc-sync` reusable workflow reviews a pull request’s diff, inspects the surrounding documentation, and lets Codex generate safe markdown patches. If Codex produces edits, the workflow commits them back to the pull request branch with `[skip ci][skip github-actions]` in the subject so CI is not retriggered.

## When to use it

- Ensure CLI/reference docs evolve alongside code changes.
- Catch missing updates to `README.md`, `docs/`, or other markdown guides during a PR.
- Triage doc follow-ups: Codex can log `follow_ups` for bigger tasks even when it can’t edit safely.

## Required secrets

- `CODEX_AUTH_JSON_B64` – standard Codex auth bundle shared with the other workflows.

## Permissions

The workflow requests `contents: write` to push commits and `pull-requests: read` to download the diff. The calling workflow must run on a pull request event.

## Inputs

| Name | Default | Purpose |
| --- | --- | --- |
| `doc_globs` | `docs/**/*.md`, `README.md`, `*.md`, ... | Newline-delimited globs that define which files count as documentation. |
| `max_doc_files` | `12` | Max number of doc files to embed into the prompt. |
| `max_doc_chars` | `6000` | Snippet length per doc file. |
| `max_total_chars` | `60000` | Combined length of all excerpts. |
| `max_diff_bytes` | `600000` | Size guardrail for the diff appended to the prompt. |
| `prompt_extra` | _empty_ | Extra markdown appended at the end of the shared prompt. |
| `safety_strategy` | `drop-sudo` | Passed to `activadee/codex-action`. |
| `model` | _empty_ | Optional Codex model override. |
| `effort` | _empty_ | Optional reasoning effort override. |
| `codex_args` | _empty_ | Extra CLI switches forwarded to `codex exec`. |
| `commit_message` | `docs: sync documentation [skip ci] [skip github-actions]` | Subject for the GitHub bot commit. Includes skip tokens so CI stays quiet. |

## Outputs

| Name | Description |
| --- | --- |
| `applied_files` | JSON array of doc paths Codex edited. Useful for logging/metrics. |
| `commit_pushed` | `"true"` when the workflow staged a commit. |

## Usage example

```yaml
name: Doc Sync

on:
  pull_request:
    types: [opened, synchronize, ready_for_review]

jobs:
  doc-sync:
    uses: activadee/codex-shared-workflows/.github/workflows/doc-sync.yml@v1
    secrets: inherit
    with:
      doc_globs: |
        README.md
        docs/**/*.md
      prompt_extra: |
        Focus on CLI usage guides first.
```

## How it works

1. `actions/doc-sync/context` captures the PR diff against the base branch and trims it to `max_diff_bytes`.
2. `actions/doc-sync/prepare` enumerates docs that match `doc_globs`, scores them against the changed files, and builds markdown excerpts plus an allowlist.
3. `actions/doc-sync/build-prompt` stitches together the shared prompt template, changed file list, diff, docs, and optional instructions.
4. `actions/doc-sync/edit` invokes `activadee/codex-action` with the doc-sync schema. The response includes unified diff patches plus follow-up notes; a Node helper validates and applies only the allowed doc edits.
5. `actions/doc-sync/push` commits the changes as `github-actions[bot]` using a `[skip ci][skip github-actions]` subject so other workflows do not rerun, then pushes to the PR branch.

If Codex cannot confidently update a file, it simply returns an empty `edits` array (and may populate `follow_ups`). In that case the workflow exits without committing anything.

## Requirements & limitations

- The workflow only pushes updates if the provided `GITHUB_TOKEN` (or whatever token you grant via `actions/checkout`) has write access to the pull request branch. For PRs originating from forks, grant permissions explicitly or disable the auto-commit step.
- Codex edits are restricted to files that match `doc_globs`, preventing accidental code changes.
