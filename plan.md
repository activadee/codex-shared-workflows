# Codex Automation Hub Refactor Plan

## Objectives
- Replace this monolithic "shared workflows" repository with a modular automation hub that exposes:
  - Versioned composite/container actions for small reusable units.
  - Thin reusable workflows that orchestrate those actions.
  - Workflow templates for repos that need to vendor YAML instead of using `workflow_call`.
  - A Codex CLI / `gh codex` extension that mirrors automation behavior locally and can trigger the workflows.
- Preserve feature parity for every existing workflow while setting up a foundation for future tasks (new jobs, prompts, Codex features).
- Reduce duplicated checkout/prompt/script logic by moving it into common actions/libraries.
- Provide auditability (tests, docs) so downstream teams can trust tagged releases.

## Repository-level Architecture After Refactor
```
codex-automation-hub/
  actions/
    common/
      checkout-target/
      checkout-shared-assets/
      build-prompt/
    codex-review/
      collect-context/
      prepare-prompt/
      run-review/
      submit-review/
    go/
      setup/
      test/
    release/
      discover-tags/
      build-release-prompt/
      render-notes/
      upload-assets/
    auto-label/
      prepare/
      run/
      apply/
    doc-sync/
      context/
      prepare/
      build-prompt/
      edit/
      push/
  workflows/
    codex-review.yml
    go-tests.yml
    release.yml
    auto-label.yml
    codex-doc-sync.yml
  workflow-templates/
    pr-review-template.yml
    ci-template.yml
    release-template.yml
  cli/
    cmd/codex-review
    cmd/codex-doc-sync
    cmd/codex-release
  docs/
    workflows/
    actions/
    cli/
  tests/
    actions/*
    cli/*
  scripts/
    validate-workflow.sh
    sync-templates.sh
  plan.md
```

## Cross-cutting Refactor Tasks
1. **Common utilities.** Extract repeated checkout/prompt/artifact logic into `actions/common/*` composites so each workflow can reference `uses: ./actions/common/...`. Provide Node helpers under `pkg/` (or `cli/internal/`) and share them between actions and the CLI.
2. **CLI + shared prompts.** Move prompts/schemas from `.github/prompts/*` to `prompts/` at the repo root. Wrap them in the CLI so developers can run `codex review --local` before pushing. Ensure CLI reuses the same actions package via a shared `pkg/codex` module.
3. **Testing + linting.** Add `tests/actions/<workflow>.yml` to run `actionlint`, smoke-run composites via `act`, and unit-test CLI commands. Hook these tests into `.github/workflows/test-actions.yml` and `lint-cli.yml`.
4. **Versioning + releases.** Define semantic tags for actions (`v1`, `v1.1.0`), workflows, and CLI releases. Document promotion steps in `docs/releasing.md`.
5. **Migration guides.** For every workflow, ship a doc with: feature parity matrix, migration instructions (replace `activadee/codex-shared-workflows/.github/workflows/foo.yml@main` with `org/codex-automation-hub/.github/workflows/foo.yml@v1`), and CLI equivalents.

---

## Workflow-specific Plans

### 1. `codex-review.yml`
**Current state.** Single workflow job orchestrates checkout, custom composite (`codex-collect`), prompt concatenation, schema loading, Codex run, JS normalization, and submission. Shared scripts live under `.github/scripts/codex/*` but require checking out this repository inside the consumer repo.

**Target architecture.**
- Composite action stack under `actions/codex-review`:
  1. `collect-context` – wraps `codex-collect` logic without requiring callers to clone this repo. Publishes diff metadata, changed files, and caches JSON artifacts to `$RUNNER_TEMP`.
  2. `prepare-prompt` – copies prompt template, appends `prompt_extra`, resolves schema, and outputs pointer paths.
  3. `run-review` – thin wrapper around `activadee/codex-action` with strongly typed inputs (safety, model, effort, args) and built-in retry/backoff for transient Codex issues.
  4. `submit-review` – replaces the `actions/github-script`/Node script combo with either a compiled CLI subcommand or a TypeScript action that posts inline review comments and summary.
- Reusable workflow becomes a one-job orchestrator that just calls the new composites plus uploads failure artifacts.
- CLI command `codex review` mirrors the same pipeline: collects context locally, generates prompt, runs Codex via CLI, and displays/opens a diff.

**Implementation steps.**
1. Port `.github/actions/codex-collect`, `scripts/codex/*.js`, and prompt logic into `actions/codex-review/*`. Replace Node scripts with TypeScript packaged via `@actions/core` (transpiled to `dist/`).
2. Introduce `actions/common/checkout-target` (takes ref/SHA, fetch-depth, optional sparse) and `actions/common/checkout-shared-assets` (clones this repo only when necessary). Update the workflow to depend on these composites.
3. Update `codex-review.yml` to call composites sequentially. Remove inline shell prompt concatenation; rely on outputs from `prepare-prompt`.
4. Add `workflows/codex-review.yml` tests using `act` to simulate PR inputs; ensure failure artifacts upload path matches new names.
5. Document CLI equivalence and fallback instructions in `docs/workflows/codex-review.md`.
6. Release `v1.0.0` tag that includes the modularized workflow + composites.

### 2. `go-tests.yml`
**Current state.** Minimal workflow: checkout, `setup-go`, optional pre-test script, `go test`. No caching beyond `setup-go` built-in; no CLI equivalent.

**Target architecture.**
- Composite actions under `actions/go/*`:
  1. `setup` – reads Go version from `go.mod` or Asdf file, configures caching, optionally installs private module auth.
  2. `prepare-workspace` – runs `pre_test` script, handles `working_directory`, installs tools (race detector dependencies, etc.).
  3. `test` – executes `go test` with templated flags, collects coverage, and emits JUnit if needed.
- Reusable workflow wires these composites; exposes extra inputs (coverage profile path, concurrency, caching toggles).
- CLI command `codex go test` allows developers to reproduce the same command locally (matching env vars, coverage flags).

**Implementation steps.**
1. Move Go-specific logic into `actions/go/setup` (shell + `setup-go`). Support `go.sum` hashing for cache keys and additional proxies (GOPRIVATE env input).
2. Add optional coverage/JUnit support by integrating `gotestsum` inside `actions/go/test`. Provide new workflow inputs (`coverage`, `go_test_args`, `fail_fast`).
3. Update `workflows/go-tests.yml` to use new composites; ensure `pre_test` becomes an actual script input to `prepare-workspace` rather than inline `run`.
4. Extend docs `docs/workflows/go-tests.md` with matrix examples (multi-version testing) and CLI parity instructions.
5. Provide workflow template `workflow-templates/ci-go.yml` referencing this reusable workflow.

### 3. `release.yml`
**Current state.** Runs tests, fetches tags, builds prompt via bash, calls Codex, renders Markdown, optionally downloads artifacts, and publishes release via `softprops/action-gh-release`. Requires cloning this repo mid-workflow to access prompts/scripts.

**Target architecture.**
- Composite action suite under `actions/release/*`:
  1. `checkout-target` (reuse from common) and `determine-range` (find last tag, commit range, changelog list).
  2. `build-codex-prompt` – templated action that renders `codex-release-template.md`, supports custom `prompt_extra` and component release sections.
  3. `generate-notes` – wraps `activadee/codex-action` invocation, logs sanitized prompt, outputs JSON.
  4. `render-notes` – converts JSON to Markdown, optionally merges manual sections or changelog fragments.
  5. `publish-release` – orchestrates `gh release create` or `softprops` with artifact globbing, release assets, release branches.
- Workflow extends inputs (e.g., `should_tag`, `tag_exists_strategy`, `artifact_matrix`). Adds output artifacts: `release-notes.md`, `codex-release.json`.
- CLI command `codex release` replicates this pipeline locally, optionally in "dry run" mode that just prints release notes.

**Implementation steps.**
1. Extract the bash prompt builder into `actions/release/build-prompt` (node/shell). Accept optional `changelog_path` input for manual sections.
2. Create `actions/release/determine-range` to compute previous tag; share with CLI library.
3. Replace inline `jq` rendering with `actions/release/render-notes` (Node script). Add tests verifying JSON to Markdown conversion.
4. Update workflow to reference new composites, allow injecting CLI-generated prompt (input `prompt_artifact`). Remove the manual checkout of this repo by bundling prompts inside the composite action package.
5. Expand documentation for release flow, include state diagram for `download_artifacts` and `artifact_glob`.
6. Provide release template workflow for standard Go repos referencing this workflow and optional CLI run.

### 4. `auto-label.yml`
**Current state.** Already depends on local composites `auto-label-prepare` and `auto-label-apply`, but they require checking out the shared repo. Codex invocation is hard-coded for `gpt-5`/`medium` and lacks retry or deduplication support.

**Target architecture.**
- Migrate existing composite actions into `actions/auto-label/*` packaged with dependencies so consumers don’t need to checkout the repo.
- Add `actions/auto-label/run` wrapper around `activadee/codex-action` with configurable parameters (`model`, `effort`, `confidence_threshold`, `max_new_labels`). Include logic to reuse existing labels, avoid duplicates, and optionally create missing labels when allowed.
- Reusable workflow exposes advanced inputs (issue types, label allowlist/blocklist, min token threshold) and outputs (applied labels, reason summary).
- CLI command `codex label` lets maintainers preview label suggestions before enabling the workflow.

**Implementation steps.**
1. Move `auto-label-prepare` script (which currently writes prompt/schema) into `actions/auto-label/prepare` using Node for easier schema generation.
2. Add `auto-label/run` composite for Codex invocation with exponential backoff + error surfaces.
3. Expand `auto-label/apply` to support `dry_run` mode (for CLI) and to report metrics via step summary.
4. Update workflow to call these composites and to emit JSON artifact of Codex output for debugging.
5. Document configuration recipes (triage/backlog) and CLI preview instructions.

### 5. `codex-doc-sync.yml`
**Current state.** Three-job workflow (`prepare_inputs`, `edit_docs`, `push_docs`) relying heavily on bespoke composite actions (`doc-sync-*`). Requires repeated checkouts and manual artifact juggling; logs are complex and failures are hard to debug.

**Target architecture.**
- Promote the existing `doc-sync-*` composites into a structured suite under `actions/doc-sync/*`, each with clear inputs/outputs and shared utility library (Node package) to parse diffs, format prompts, and apply patches.
- Introduce state machine orchestration: `prepare` job produces a signed manifest (JSON) describing doc globs, prompt path, and diff metadata. `edit` job consumes manifest, runs Codex edits using CLI action, and emits patch/report artifacts. `push` job verifies patch cleanly applies, pushes branch, and posts summary.
- Reusable workflow adds resiliency features (max retries, fallback to summary-only mode) plus outputs (changed files list, doc report path). Provide toggles to skip push phase for dry runs.
- CLI command `codex doc-sync` shares manifest format, enabling local testing (apply patch locally, review doc summary).

**Implementation steps.**
1. Consolidate doc-sync actions into `actions/doc-sync` directory, adding a shared Node helper package for git/diff operations. Publish it so both actions and CLI reuse logic.
2. Standardize artifact naming with manifest file (e.g., `doc-sync-manifest.json`). `prepare` job writes manifest + prompt to artifact; `edit` job produces `doc-sync-result.json` with summary + patch metadata.
3. Replace shell-based ignore logic with composite action that updates `.git/info/exclude` deterministically.
4. Enhance `doc-sync-edit` composite to output structured telemetry (tokens, elapsed time) and optionally chunk doc edits by glob groups.
5. Update workflow YAML to call new composites, support concurrency key per PR, and integrate with CLI-based manual approval (optional `requires_approval` input that halts before push).
6. Write doc/diagram describing doc-sync state machine and failure-handling (skip, retry, manual patch). Add tests with synthetic repos to ensure patch application works.

---

## Migration Strategy & Timeline
1. **Phase 0 – Bootstrap (Weeks 1-2).**
   - Clone existing repo into `codex-automation-hub` inside org.
   - Set up scaffolding directories (`actions`, `workflows`, `workflow-templates`, `cli`, `docs`).
   - Copy prompts/schemas into `prompts/`; update references.
2. **Phase 1 – Common foundation (Weeks 2-3).**
   - Implement `actions/common/*` and update `codex-review` workflow as pilot.
   - Release `codex-review` v0 beta tag and validate with internal repo.
3. **Phase 2 – Rework remaining workflows (Weeks 3-5).**
   - Tackle `go-tests` and `release` (simpler) first.
   - Follow with `auto-label` and `codex-doc-sync` once shared libraries are stable.
4. **Phase 3 – CLI + templates (Weeks 5-6).**
   - Implement CLI commands using shared libraries.
   - Publish workflow templates + migration docs.
5. **Phase 4 – Adoption (Weeks 6+).**
   - Open PRs in consuming repos switching to new tags.
   - Deprecate `activadee/codex-shared-workflows` once adoption >90%.

---

## Acceptance Criteria
- Every existing workflow has a modular counterpart using composite actions without needing to checkout this repo.
- CLI reproduces (or triggers) each workflow end-to-end.
- Tests cover both actions and CLI for each workflow.
- Documentation exists per workflow (inputs, outputs, failure handling) plus migration guides.
- Tagged release `v1.0.0` of `codex-automation-hub` published with change log referencing this plan.
