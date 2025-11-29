# Codex Auto Label Workflow

Reusable workflow path: `.github/workflows/auto-label.yml`

## Summary
- Fetches issue metadata + repository labels, builds a prompt from `prompts/codex-auto-label.md`, and runs Codex to suggest up to three labels.
- Applies the selected labels via the GitHub CLI, creating missing labels only when allowed.
- Exposes workflow outputs (`applied_labels`, `applied_labels_json`) for downstream reporting or analytics.

## Inputs
| Name | Default | Description |
| --- | --- | --- |
| `max_labels` | `3` | Upper bound on labels applied per issue (clamped between 1 and 3). |
| `model` | `gpt-5.1-mini` | Codex model used during auto-labeling. |
| `effort` | `medium` | Codex reasoning effort. |
| `safety_strategy` | `drop-sudo` | Codex sandbox mode. |
| `codex_args` | _(empty)_ | Additional CLI arguments forwarded to `codex exec`. |
| `create_missing_labels` | `true` | Allow creating labels that don’t already exist in the repository. |

## Outputs
| Name | Description |
| --- | --- |
| `applied_labels` | Comma-separated list of labels applied by the workflow. |
| `applied_labels_json` | JSON array version of the applied labels. |

## Example Usage
```yaml
auto-label:
  uses: activadee/codex-shared-workflows/.github/workflows/auto-label.yml@v1
  secrets: inherit
  with:
    max_labels: 3
    model: gpt-5.1-mini
    create_missing_labels: true
```

## Notes / TODOs
- Future enhancements: label allowlist/blocklist filtering and dry-run previews.
