# Codex Shared Workflows

Reusable GitHub Actions workflows for Codex-enabled repositories. These workflows live in their own repository so multiple projects can invoke them via `workflow_call` while centralizing prompts, scripts, and configuration.

## Workflows

- `.github/workflows/codex-review.yml`  
  Runs a Codex-powered pull request review. It collects PR context, executes `activadee/codex-action`, normalizes the output, and posts inline review comments plus a summary.

- `.github/workflows/go-tests.yml`  
  Installs Go, caches dependencies, and executes `go test` with configurable flags.

- `.github/workflows/release.yml`  
  Generates release notes with Codex and publishes a GitHub release, optionally running `go test` first.

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
    uses: activadee/codex-shared-workflows/.github/workflows/codex-review.yml@v1
    secrets: inherit
    with:
      prompt_extra: |
        Prioritize security regressions and user-facing bugs.
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
    uses: activadee/codex-shared-workflows/.github/workflows/go-tests.yml@v1
    with:
      go_version_file: go.mod
      test_flags: ./... -race -count=1

  release:
    uses: activadee/codex-shared-workflows/.github/workflows/release.yml@v1
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
| `enable_cache` | `true` | Toggle `actions/setup-go` module cache. |
| `pre_test` | _empty_ | Optional shell snippet executed before `go test`. |

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
| `download_artifacts` | `false` | Download workflow artifacts before publishing the release. |
| `artifacts_path` | `release-artifacts` | Directory for downloaded artifacts. |
| `artifact_glob` | _empty_ | Newline-delimited glob(s) (relative to the workspace after download) uploaded with the release. |

Outputs:

- `release_notes` – Markdown generated for the release.

## Repository layout

```
.github/
  actions/
    codex-collect/      # Local composite action for gathering PR metadata.
  prompts/
    codex-review.md     # Shared prompt used by Codex review workflow.
    codex-review-schema.json
  scripts/
    codex/
      normalize-review.cjs
      submit-review.js
  workflows/
    codex-review.yml
    go-tests.yml
```

## Development

1. Duplicate the workflows into a feature branch and modify as needed.
2. Use a sandbox repository to consume the branch ref (`@feature-branch`) and verify behavior.
3. Once validated, tag a release (e.g., `v1.0.0`) so downstream repos can pin to an immutable reference.

## Limitations

- GitHub does not allow reusable workflows to access secrets or protected variables defined in this repository. Consumers must define required secrets themselves or inherit them from an organization/environment.
- The review workflow assumes a pull request event; if invoked from other events, required context such as `github.event.pull_request` is missing and the workflow will exit early.
