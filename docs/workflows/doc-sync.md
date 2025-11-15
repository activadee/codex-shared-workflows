# Codex Doc Sync Workflow

The `codex-doc-sync` reusable workflow reviews a pull request’s diff, inspects the surrounding documentation, and lets Codex regenerate entire markdown files when edits are required. If Codex produces updated files, the workflow commits them back to the pull request branch with `[skip ci][skip github-actions]` in the subject so CI is not retriggered.

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
| `pass_through_env` | `GH_TOKEN,GITHUB_TOKEN` | Env vars forwarded to Codex so it can run `git`/`gh` commands with proper auth. |

By default the workflow appends `--config sandbox_workspace_write.network_access=true` to Codex’s arguments, which keeps sandboxing at `workspace-write` while allowing outbound network requests (needed for web search, `gh`, etc.). Override `codex_args` if you need a different policy.

## Outputs

| Name | Description |
| --- | --- |
| `summary` | Codex’s short explanation of what changed (or why nothing changed). |
| `updated_files` | JSON array of doc paths Codex touched. |
| `changes_committed` | `"true"` when Codex committed and pushed documentation updates. |
| `follow_ups` | JSON array describing remaining doc work that still needs a human. |

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

1. Configure git author info for the eventual commit.
2. `actions/doc-sync/context` captures the PR diff against the base branch and trims it to `max_diff_bytes`.
3. `actions/doc-sync/prepare` enumerates docs that match `doc_globs`, scores them against the changed files, and builds markdown excerpts plus an allowlist.
4. `actions/doc-sync/build-prompt` stitches together the shared prompt template, changed file list, diff, docs, and optional instructions.
5. `actions/doc-sync/edit` invokes `activadee/codex-action` with the doc-sync prompt (and `--config sandbox_workspace_write.network_access=true`). Codex edits the allowed docs directly, stages only those files, commits with `[skip ci][skip github-actions]`, pushes the branch, and returns a JSON summary of what happened.

If Codex cannot confidently update a file, it leaves the working tree untouched, sets `changes_committed` to `false`, and may populate `follow_ups` to describe what still needs to happen.

## Requirements & limitations

- The workflow only pushes updates if the provided `GITHUB_TOKEN` (or whatever token you grant via `actions/checkout`) has write access to the pull request branch. For PRs originating from forks, grant permissions explicitly or disable the auto-commit step.
- Codex edits are restricted to files that match `doc_globs`, preventing accidental code changes.
- `pass_through_env` forwards `GH_TOKEN`/`GITHUB_TOKEN` into the Codex subprocess. Treat those credentials with the same care you would in a regular workflow step.
- Need different sandbox behavior? Override the `codex_args` input to add or remove `--config` entries (for example, set `[]` to disable the default network flag).
