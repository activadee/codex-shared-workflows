# Codex Docs Sync Task

You are operating inside a GitHub Actions runner with full access to the pull request workspace. Use the provided GitHub CLI (`gh`) and git to keep documentation accurate and ensure changes are committed automatically.

## Context
- Repository: `{{REPOSITORY}}`
- Base branch for comparison: `{{BASE_REF}}`
- Head branch for updates: `{{HEAD_REF}}`
- Pull request number: `{{PR_NUMBER}}`
- Documentation scope includes **only** files matching these globs:
{{DOC_SCOPE}}
- Commits included in this review:
{{COMMIT_SUMMARY}}
- Write your outcome summary to `{{REPORT_PATH}}` (overwrite the file every run).

## Required Workflow
1. Fetch any missing refs (`git fetch --all --quiet`) and inspect `git diff origin/{{BASE_REF}}...HEAD` to understand behavior changes.
2. Decide whether scoped docs need edits. Update only files covered by the provided globs (`docs/**`, Markdown files, README, etc.).
3. Keep the working tree clean:
   - Use `git status --short` to verify only documentation files changed.
   - If non-doc files changed, revert them before continuing.
4. Commit and push using the GitHub CLI:
   - Export the token for the CLI (`export GH_TOKEN="$GITHUB_TOKEN"`) because GitHub CLI reads credentials from `GH_TOKEN` in Actions runners.
   - Run `gh auth status` to verify authentication before pushing.
   - Configure git identity if needed: `git config user.name "github-actions[bot]"` and `git config user.email "github-actions[bot]@users.noreply.github.com"`.
   - Stage **only** documentation files (`git add <files>` or `git add -p`). Never stage or commit `doc-sync-report.md`; if it appears staged, run `git reset doc-sync-report.md` before continuing.
   - Review the staged diff to confirm that only documentation content changed.
   - Commit with the message `[skip ci][doc-sync] Auto-update docs for PR #{{PR_NUMBER}}`.
   - Push via `gh` by running `gh api repos/{{REPOSITORY}}/git/refs/heads/{{HEAD_REF}} -X PATCH -f sha=$(git rev-parse HEAD)`.
   - If no documentation changes were needed, ensure the working tree remains clean and skip committing.
5. Produce `{{REPORT_PATH}}` in Markdown with:
   - `## Outcome` — short sentence summarizing whether docs changed.
   - `## Files` — bullet list of touched docs with one-line reasons, or `- (none)`.
   - `## Notes` — extra context, or `- (none)`.
6. End with a clean working tree (no pending changes or untracked files outside `.gitignore`).

## Definition of Done
- Documentation is updated (or confirmed current) with commits already pushed to `{{HEAD_REF}}` using the GitHub CLI.
- `{{REPORT_PATH}}` explains what happened.
- The git working tree is clean so downstream workflow checks can rely on the state you left behind.
