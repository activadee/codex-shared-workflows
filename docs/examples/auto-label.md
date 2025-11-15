# Auto-Label Command Examples

## GitHub Action

```yaml
name: issue-labeler
on:
  issues:
    types: [opened, edited]
  pull_request:
    types: [opened, synchronize]

jobs:
  label:
    runs-on: ubuntu-latest
    permissions:
      issues: write
      pull-requests: write
    steps:
      - uses: activadee/codex-shared-workflows@v2
        with:
          command: auto-label
          max_labels: 2
          network_access: false
        env:
          CODEX_AUTH_JSON_B64: ${{ secrets.CODEX_AUTH_JSON_B64 }}
```

## CLI

```bash
export CODEX_AUTH_JSON_B64=...
export GITHUB_TOKEN=...

npx codex-workflows auto-label \
  --prompt prompts/codex-auto-label.md \
  --max-labels 3 \
  --event-path ./fixtures/issue.json \
  --dry-run
```
