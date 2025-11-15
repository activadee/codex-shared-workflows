# Go Tests Workflow

Reusable workflow path: `workflows/go-tests.yml`

## Summary
- Installs Go using `actions/go/setup` composite (wraps `actions/setup-go@v5`).
- Runs an optional repo-provided `pre_test` script via `actions/go/pre-test`.
- Executes `go test` through `actions/go/test`, with support for coverage profiles, `-race`, and artifact uploads.

## Inputs
| Name | Default | Description |
| --- | --- | --- |
| `go_version` | _(empty)_ | Explicit Go version override. Use with `@vX` release tags. |
| `go_version_file` | `go.mod` | Path passed to `actions/setup-go` for version discovery. |
| `working_directory` | `.` | Directory where tests run. |
| `test_flags` | `./...` | Additional flags appended to `go test`. |
| `enable_cache` | `true` | Enables Go module cache restoration. |
| `cache_dependency_path` | _(empty)_ | Newline-delimited glob list hashed for cache keys. |
| `pre_test` | _(empty)_ | Shell snippet executed before `go test` (runs in `working_directory`). |
| `coverage_profile` | _(empty)_ | When set, `-coverprofile` is added and the file path is emitted in outputs. |
| `upload_coverage_artifact` | `false` | Upload the coverage profile artifact after tests pass. |
| `coverage_artifact_name` | `go-coverage` | Artifact name when `upload_coverage_artifact` is `true`. |
| `race` | `false` | Adds `-race` to the `go test` invocation. |

## Outputs
The workflow itself does not define outputs yet, but the `actions/go/test` composite surfaces:
- `steps.run_tests.outputs.coverage_profile` – relative path to the generated coverprofile.
- `steps.run_tests.outputs.coverage_profile_abs` – absolute path (used for artifact uploads).

## Example Usage
```yaml
go-tests:
  uses: activadee/codex-shared-workflows/workflows/go-tests.yml@v1
  with:
    go_version_file: go.mod
    test_flags: ./... -count=1
    pre_test: |
      go install github.com/jstemmer/go-junit-report@latest
    coverage_profile: coverage.out
    upload_coverage_artifact: true
    race: true
```
