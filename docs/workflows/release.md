# Codex Release Workflow

Reusable workflow path: `.github/workflows/release.yml`

## Summary
- Checks out the target ref, optionally installs Go, and runs pre-release tests via the shared `actions/go/*` composites (setup, pre-test script, and `go test` with race/coverage support).
- Determines the previous release tag + commit list using `actions/release/determine-range`, renders the Codex prompt via `actions/release/prepare-prompt`, and generates highlights with `actions/release/generate-highlights`.
- Converts Codex JSON into Markdown using `actions/release/render-notes`, then publishes the GitHub release (with optional artifact downloads/uploads).

## Inputs
| Name | Default | Description |
| --- | --- | --- |
| `tag_name` | _(required)_ | Tag to create or update. |
| `release_title` | _(empty)_ | Display name for the GitHub release (falls back to `tag_name`). |
| `target` | `main` | Commit/branch to release (also used when computing commit ranges). |
| `draft` | `false` | Publish as draft instead of final release. |
| `go_version` | _(empty)_ | Explicit Go version for pre-release tests (ignored if `go_version_file` present). |
| `go_version_file` | `go.mod` | File used by `actions/go/setup` to discover the Go version. |
| `run_tests` | `true` | Toggle pre-release `go test`. |
| `test_flags` | `./...` | Arguments appended to `go test`. |
| `enable_cache` | `true` | Enable Go module cache restoration. |
| `cache_dependency_path` | _(empty)_ | Newline-delimited glob(s) hashed for cache keys. |
| `test_working_directory` | `.` | Directory for pre-release tests. |
| `pre_test` | _(empty)_ | Shell snippet executed before `go test`. |
| `coverage_profile` | _(empty)_ | Adds `-coverprofile` and records file path via action outputs. |
| `upload_coverage_artifact` | `false` | Upload coverage artifact via `actions/upload-artifact`. |
| `coverage_artifact_name` | `release-coverage` | Name for the uploaded coverage artifact. |
| `race` | `false` | Run tests with `-race`. |
| `download_artifacts` | `false` | Fetch prior workflow artifacts before publishing. |
| `artifacts_path` | `release-artifacts` | Folder for downloaded artifacts. |
| `artifact_glob` | _(empty)_ | Glob (relative to `artifacts_path`) passed to `softprops/action-gh-release`. |
| `tag_pattern` | `v*` | Pattern used when locating the previous release tag. |
| `prompt_extra` | _(empty)_ | Markdown appended to the Codex release prompt. |
| `codex_model` | _(empty)_ | Optional Codex model override. |
| `codex_effort` | _(empty)_ | Optional reasoning effort override. |
| `codex_args` | _(empty)_ | Additional CLI flags forwarded to Codex. |
| `codex_safety_strategy` | `drop-sudo` | Codex sandbox mode (`drop-sudo`, `read-only`, etc.). |

## Outputs
| Name | Description |
| --- | --- |
| `release_notes` | Markdown generated from Codex JSON (also written to `release-notes.md`). |

## Example Usage
```yaml
release:
  needs: go-tests
  uses: activadee/codex-shared-workflows/.github/workflows/release.yml@v1
  secrets: inherit
  with:
    tag_name: v1.2.3
    target: main
    run_tests: true
    test_flags: ./... -count=1
    coverage_profile: coverage.out
    upload_coverage_artifact: true
    prompt_extra: |
      Please highlight any CLI changes and notable bug fixes.
```

## TODO / Follow-ups
- Publish `docs/actions/release.md` describing each composite and their shared schema inputs.
- Add `tests/actions/release.yml` to run `actionlint` and an `act` smoke test that exercises the workflow with synthetic commit history.
