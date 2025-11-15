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
**Current state.** (pre-refactor) Single job: checkout, `actions/setup-go`, optional inline pre-test script, and `go test`. No structured caching toggles, coverage upload, or composable actions.

**Refactor status.** Completed in branch `feature/phase0-bootstrap`:
- Added Go-specific composites (`actions/go/setup`, `actions/go/pre-test`, `actions/go/test`) that install Go, run optional setup scripts, and execute `go test` with race + coverage support.
- Updated `go-tests.yml` to consume those composites, expose new inputs (`cache_dependency_path`, `coverage_profile`, `upload_coverage_artifact`, `race`), and optionally upload coverage artifacts via `actions/upload-artifact`.
  - Coverage details bubble up through outputs (`steps.run_tests.outputs.coverage_profile*`) for downstream jobs.
- Workflow now checks out the shared automation repo (temporary until the hub is standalone) to access the new actions.

**Follow-ups (Phase 1 Step 3).**
1. Document the new inputs/composites in README + dedicated `docs/workflows/go-tests.md`. ✅
2. Track next tasks: add `docs/actions/go.md` (still todo) and create `tests/actions/go-tests.yml` for actionlint/`act` coverage (todo).

### 3. `release.yml`
**Status.** Refactor merged on `feature/phase0-bootstrap`:
- Added `actions/release/{determine-range,prepare-prompt,generate-highlights,render-notes}` to encapsulate tag discovery, prompt generation, Codex invocation, and Markdown rendering.
- Workflow now reuses Go composites for pre-release tests (coverage, race, artifacts) and exposes Codex overrides (`prompt_extra`, `codex_model`, etc.).
- Release notes are surfaced via the composite outputs (`steps.render_notes.outputs.notes`) and written to `release-notes.md`.

**Follow-ups.**
1. Document composites in `docs/actions/release.md` (todo) and keep `docs/workflows/release.md` updated (initial version added in Phase 2, Step 3).
2. Add `tests/actions/release.yml` (future Phase 3) that runs `actionlint` + an `act` dry run with synthetic tags/commits.
3. Explore providing a workflow template (`workflow-templates/release-template.yml`) once CLI integration is ready.

### 4. `auto-label.yml`
**Status.** Refactor complete:
- Introduced `actions/auto-label/{prepare,run,apply}` composites (legacy `.github/actions/*` now delegate to them).
- Workflow exposes configurable Codex parameters and an option to disable creation of new labels; it also publishes outputs listing the applied labels.

**Follow-ups.**
1. Add advanced filtering (`allowlist`/`blocklist`) and dry-run previews to the apply step before rolling out CLI parity.
2. Create `tests/actions/auto-label.yml` to smoke-test the workflow via `act`.

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

## Phase Tracking

- [x] **Phase 0 – Bootstrap:** scaffolding directories created, prompts relocated, roadmap captured (commit `feature/phase0-bootstrap`).
- [ ] **Phase 1 – Common foundation:**
  - [x] Create `actions/common/*` and `actions/codex-review/*` scaffolding; migrate review scripts into `actions/codex-review/lib/`.
  - [x] Update `codex-review.yml` to consume the new composites (still using local checkout until remote pinning strategy is finalized).
  - [ ] Publish guidance/tests ensuring the new composites work under `workflow_call` consumers.
- [ ] **Phase 2 – Rework remaining workflows**
  - [x] Modularize `go-tests.yml` (actions/go, docs/workflows/go-tests.md, README/plan updates); tests pending.
  - [x] Modularize `release.yml` (actions/release, docs/workflows/release.md, README/plan updates); tests pending.
  - [x] Refactor `auto-label.yml` (actions/auto-label, docs/workflows/auto-label.md); additional filtering/tests pending.
  - [ ] Refactor `codex-doc-sync.yml` (planned).
- [ ] **Phase 3 – CLI + templates**
- [ ] **Phase 4 – Adoption / deprecation**

---

## Acceptance Criteria
- Every existing workflow has a modular counterpart using composite actions without needing to checkout this repo.
- CLI reproduces (or triggers) each workflow end-to-end.
- Tests cover both actions and CLI for each workflow.
- Documentation exists per workflow (inputs, outputs, failure handling) plus migration guides.
- Tagged release `v1.0.0` of `codex-automation-hub` published with change log referencing this plan.
