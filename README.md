# Codex Shared Workflows

Reusable GitHub Actions workflows for Codex-enabled repositories. These workflows live in their own repository so multiple projects can invoke them via `workflow_call` while centralizing prompts, scripts, and configuration.

## Workflows

- `workflows/codex-review.yml`  
  Runs a Codex-powered pull request review. It collects PR context, executes `activadee/codex-action`, normalizes the output, and posts inline review comments plus a summary.

- `workflows/go-tests.yml`  
  Installs Go, caches dependencies, and executes `go test` with configurable flags.

- `workflows/release.yml`  
  Generates release notes with Codex and publishes a GitHub release, optionally running `go test` first.

- `workflows/auto-label.yml`  
  Calls Codex to suggest up to three labels for new or updated issues, creating labels when needed.

- `workflows/codex-doc-sync.yml`  
  Runs Codex in a dedicated job to edit and commit documentation changes, then hands off to a follow-up job that applies the generated bundle and pushes it to the PR branch while posting the doc summary.

## Using the workflows

Create a workflow in another repository and reference the desired file via `uses`. Pin to a tag or commit once published.

```yaml
# .github/workflows/pr-review.yml
name: PR Review

on:
  pull_request:
    types: [opened, reopened, synchronize, ready_for_review]

jobs:
  codex-review:
    uses: activadee/codex-shared-workflows/workflows/codex-review.yml@v1
    secrets: inherit
    with:
      prompt_extra: |
        Prioritize security regressions and user-facing bugs.

  auto-label:
    uses: activadee/codex-shared-workflows/workflows/auto-label.yml@v1
    secrets: inherit
    with:
      max_labels: 3
```

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  go-tests:
    uses: activadee/codex-shared-workflows/workflows/go-tests.yml@v1
    with:
      go_version_file: go.mod
      test_flags: ./... -race -count=1

  release:
    uses: activadee/codex-shared-workflows/workflows/release.yml@v1
    secrets: inherit
    with:
      tag_name: v0.2.0
      target: main
      release_title: Codex SDK v0.2.0
      draft: false
```

### Secrets

Reusable workflows cannot access secrets from the workflow repository. Define required secrets in each calling repository (or at the organization/environment level) and forward them with `secrets: inherit` or explicit mappings.

Required secrets for `codex-review.yml`:

- `CODEX_AUTH_JSON_B64` – Base64-encoded Codex `auth.json` (from ChatGPT subscription auth). The default `GITHUB_TOKEN` is available automatically.

Required secrets for `release.yml`:

- `CODEX_AUTH_JSON_B64` – Shared Codex credentials for generating release notes.

Required secrets for `auto-label.yml`:

- `CODEX_AUTH_JSON_B64` – Codex credentials for label generation.

Required secrets for `codex-doc-sync.yml`:

- `CODEX_AUTH_JSON_B64` – Codex credentials for analyzing diffs and editing documentation.

### Optional inputs

`codex-review.yml` accepts the following inputs:

| Input | Default | Notes |
| --- | --- | --- |
| `safety_strategy` | `drop-sudo` | Passed through to the action. |
| `prompt_extra` | _empty_ | Additional markdown appended to the shared prompt. |
| `model` / `effort` | _empty_ | Optional overrides for Codex model and reasoning effort. |
| `codex_args` | _empty_ | Extra flags forwarded to `codex exec`. |

`go-tests.yml` inputs:

| Input | Default | Notes |
| --- | --- | --- |
| `go_version` | _empty_ | Direct Go version; ignored if `go_version_file` is present. |
| `go_version_file` | `go.mod` | File that specifies the Go version. |
| `working_directory` | `.` | Directory where `go test` runs. |
| `test_flags` | `./...` | Flags appended to `go test`. |
| `enable_cache` | `true` | Toggle Go module cache restoration. |
| `cache_dependency_path` | _empty_ | Newline-delimited glob(s) hashed for cache keys. |
| `pre_test` | _empty_ | Optional shell snippet executed before `go test`. |
| `coverage_profile` | _empty_ | Relative path passed to `-coverprofile`. Enables coverage mode when set. |
| `upload_coverage_artifact` | `false` | Upload the generated coverprofile via `actions/upload-artifact`. |
| `coverage_artifact_name` | `go-coverage` | Name for the uploaded coverage artifact. |
| `race` | `false` | Run `go test` with `-race`. |

`release.yml` inputs:

| Input | Default | Notes |
| --- | --- | --- |
| `tag_name` | _(required)_ | Tag to publish (e.g. `v1.2.3`). |
| `release_title` | _empty_ | Optional display name (falls back to tag). |
| `target` | `main` | Commit/branch to release. |
| `draft` | `false` | Whether to create the release as a draft. |
| `go_version` | _empty_ | Explicit Go version; ignored if `go_version_file` is provided. |
| `go_version_file` | `go.mod` | File declaring Go version. |
| `run_tests` | `true` | Run `go test` before release. |
| `test_flags` | `./...` | Flags passed to `go test`. |
| `enable_cache` | `true` | Enable Go module cache for pre-release tests. |
| `cache_dependency_path` | _empty_ | Newline-delimited glob list hashed for cache keys. |
| `test_working_directory` | `.` | Directory where `go test` runs. |
| `pre_test` | _empty_ | Shell snippet executed before `go test`. |
| `coverage_profile` | _empty_ | Adds `-coverprofile` and stores the file at this path. |
| `upload_coverage_artifact` | `false` | Upload the generated coverprofile artifact. |
| `coverage_artifact_name` | `release-coverage` | Artifact name when uploading coverage. |
| `race` | `false` | Run `go test` with `-race`. |
| `download_artifacts` | `false` | Download workflow artifacts before publishing the release. |
| `artifacts_path` | `release-artifacts` | Directory for downloaded artifacts. |
| `artifact_glob` | _empty_ | Newline-delimited glob(s) (relative to the workspace after download) uploaded with the release. |
| `tag_pattern` | `v*` | Pattern used to find the previous release tag. |
| `prompt_extra` | _empty_ | Markdown appended to the Codex prompt. |
| `codex_model` | _empty_ | Optional Codex model override. |
| `codex_effort` | _empty_ | Optional reasoning effort override. |
| `codex_args` | _empty_ | Extra flags forwarded to `codex exec`. |
| `codex_safety_strategy` | `drop-sudo` | Safety strategy for Codex (drop-sudo/read-only/etc.). |

Outputs:

- `release_notes` – Markdown generated for the release.

`auto-label.yml` inputs:

| Input | Default | Notes |
| --- | --- | --- |
| `max_labels` | `3` | Upper bound (1–3) on labels applied to each issue. |
| `model` | `gpt-5` | Codex model used for label generation. |
| `effort` | `medium` | Codex reasoning effort. |
| `safety_strategy` | `drop-sudo` | Sandbox mode for Codex. |
| `codex_args` | _empty_ | Extra CLI arguments forwarded to `codex exec`. |
| `create_missing_labels` | `true` | Allow creating labels that don’t exist yet. |

`codex-doc-sync.yml` inputs:

| Input | Default | Notes |
| --- | --- | --- |
| `doc_globs` | `docs/**`, `**/*.md`, `README*` | Newline-separated glob list that defines which files count as documentation. |
| `safety_strategy` | `drop-sudo` | Passed directly to `activadee/codex-action` (the workflow always runs with `sandbox-mode: danger-full-access`). |
| `model` / `effort` | _empty_ | Optional overrides for Codex model and reasoning effort. |
| `codex_args` | _empty_ | Additional CLI arguments forwarded to `codex exec`. |

## Repository layout

```
prompts/
  codex-review.md
  codex-review-schema.json
  codex-release-template.md
  codex-release-schema.json
  codex-auto-label.md
  codex-auto-label-schema.json
  codex-doc-sync.md
actions/
  common/
    checkout-target/
    checkout-shared/
  codex-review/
    collect-context/
    prepare-prompt/
    run-review/
    normalize-output/
    submit-review/
    lib/
      normalize-review.cjs
      submit-review.js
  auto-label/
    prepare/
    run/
    apply/
  release/
    determine-range/
    prepare-prompt/
    generate-highlights/
    render-notes/
  doc-sync/
    context/
    prepare/
    build-prompt/
    edit/
    push/
workflows/
workflow-templates/
cli/
docs/
  workflows/
tests/
scripts/
.github/
  workflows/
    codex-review.yml
    go-tests.yml
    release.yml
    auto-label.yml
    codex-doc-sync.yml
plan.md
```

## Refactor roadmap

- **Phase 0 (current):** establish automation-hub scaffolding directories and centralize prompts under `prompts/` so downstream assets can consume them without cloning `.github/prompts`. Track work in `plan.md`.
- **Upcoming phases:** migrate each workflow into modular composites, add workflow templates + CLI surface, expand docs/tests, and cut a `v1.0.0` release once all assets live in the new layout.

## Development

1. Duplicate the workflows into a feature branch and modify as needed.
2. Use a sandbox repository to consume the branch ref (`@feature-branch`) and verify behavior.
3. Once validated, tag a release (e.g., `v1.0.0`) so downstream repos can pin to an immutable reference.

## Limitations

- GitHub does not allow reusable workflows to access secrets or protected variables defined in this repository. Consumers must define required secrets themselves or inherit them from an organization/environment.
- The review workflow assumes a pull request event; if invoked from other events, required context such as `github.event.pull_request` is missing and the workflow will exit early.
