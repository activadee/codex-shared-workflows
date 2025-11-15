# Codex Docs Sync Task

You are operating inside a GitHub Actions runner with full access to the pull request workspace. Use the provided GitHub CLI (`gh`) and git to ensure documentation is accurate and that changes are committed automatically, as necessary.

Begin with a concise checklist (3-7 bullets) of what you will do; keep items conceptual, not implementation-level.

## Context

- **Repository:** `{{REPOSITORY}}`
- **Base branch for comparison:** `{{BASE_REF}}`
- **Head branch for updates:** `{{HEAD_REF}}`
- **Pull request number:** `{{PR_NUMBER}}`
- **Documentation scope:** Only files matching the following globs:
  {{DOC_SCOPE}}
- **Commits included in this review:**
  {{COMMIT_SUMMARY}}
- **Outcome summary path:** Write the summary to `{{REPORT_PATH}}` (overwrite on every run).

## Required Workflow

1. Fetch missing refs with `git fetch --all --quiet` and inspect `git diff origin/{{BASE_REF}}...HEAD` to understand behavior changes.
2. Assess whether any scoped docs require updates. Update only files that match the provided globs (such as `docs/**`, Markdown files, `README`, etc.).
3. Ensure the working tree is clean:
   - Use `git status --short` to confirm that only documentation files have changed.
   - If non-doc files are changed, revert those changes before proceeding.
4. Commit (but **do not push**) the changes using the GitHub CLI:
   - Set the GitHub CLI token: `export GH_TOKEN="$GITHUB_TOKEN"`, then check access with `gh auth status`.
   - Configure git identity as needed:
        - `git config user.name "github-actions[bot]"`
        - `git config user.email "github-actions[bot]@users.noreply.github.com"`
   - Stage only documentation files (`git add <files>` or `git add -p`). Never stage or commit `doc-sync-report.md`. If it becomes staged, run `git reset doc-sync-report.md`.
   - Review the staged diff to ensure only documentation content is present.
   - Commit with message: `[skip ci][doc-sync] Auto-update docs for PR #{{PR_NUMBER}}`.
   - **Do not** run `git push`. Leave the workspace clean with the new commit present; pushing will occur in a later workflow job.
   - If there were no required documentation changes, ensure the working tree remains clean and skip committing.
5. Generate `{{REPORT_PATH}}` in Markdown containing:
   - `## Outcome`  A brief summary of whether docs were changed.
   - `## Files`  A bulleted list of updated documentation files with one-line reasons, or `- (none)` if there were no changes.
   - `## Notes`  Additional context, or `- (none)` if not applicable.
6. Complete the process with a clean working tree (no uncommitted or untracked files outside `.gitignore`).

After each git or tool call, validate the result in 1-2 lines and proceed or self-correct if validation fails.

## Definition of Done

- Documentation is updated (or verified as current) in commits already present on `{{HEAD_REF}}` via the GitHub CLI.
- `{{REPORT_PATH}}` provides a clear explanation of actions taken.
- The git working tree is left clean, ensuring that downstream workflow checks can reliably use the current state.
