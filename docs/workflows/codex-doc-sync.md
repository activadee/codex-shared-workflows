# Codex Doc Sync Workflow

Reusable workflow path: `workflows/codex-doc-sync.yml`

## Summary
- Validates the PR context to ensure the head branch lives inside the same repository (so pushes are allowed).
- Prepares documentation scope + commit context (doc globs manifest, commit summary, prompt template).
- Runs Codex in a dedicated edit job to modify docs, verifies only documentation files changed, captures a binary patch/report/file list, and uploads artifacts.
- Applies/pushes the patch in a follow-up job and comments on the PR with the generated report once changes exist.

## Inputs
| Name | Default | Description |
| --- | --- | --- |
| `doc_globs` | `docs/**`, `**/*.md`, `README*` | Glob patterns that define documentation files. |
| `safety_strategy` | `drop-sudo` | Safety mode for the Codex run. |
| `model` | _(empty)_ | Optional Codex model override. |
| `effort` | _(empty)_ | Optional reasoning effort override. |
| `codex_args` | _(empty)_ | Extra CLI arguments forwarded to Codex. |

## Job Flow
1. **prepare_inputs**
   - Uses `actions/doc-sync/context` to validate PR + capture refs.
   - Runs `actions/doc-sync/prepare` (ignore helper files, fetch commits, persist globs) and `actions/doc-sync/build-prompt` (render prompt from template + commit summary).
   - Uploads prompt/glob/commit artifacts for later jobs.
2. **edit_docs**
   - Restores artifacts, ignores helper files, and calls `actions/doc-sync/edit` to run Codex + verify doc-only diffs. When changes exist, uploads report/patch/file-list artifacts.
3. **push_docs**
   - Downloads artifacts, applies patch via `actions/doc-sync/push`, pushes the branch, and posts the summary comment.

## Outputs
The workflow exposes these job-level outputs (via `edit_docs`/`push_docs`):
- `needs.edit_docs.outputs.changed` drives whether the push job runs.
- `push_docs`'s internal action (`actions/doc-sync/push`) exposes `commit_sha` via step outputs if downstream jobs need it.

## Example Usage
```yaml
codex-doc-sync:
  uses: activadee/codex-shared-workflows/workflows/codex-doc-sync.yml@v1
  secrets: inherit
  with:
    doc_globs: |
      docs/**
      README*
    safety_strategy: drop-sudo
    model: gpt-5
```

## TODO / Follow-ups
- Add dry-run mode (skip push job) and manifest outputs for CI bots to preview doc changes without pushing.
- Provide tests under `tests/actions/doc-sync.yml` once `act` fixtures are ready.
