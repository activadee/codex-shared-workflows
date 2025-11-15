# Doc Sync Command Examples

## GitHub Action

```yaml
name: docs
on:
  pull_request:
    paths:
      - docs/**
      - README.md

jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: activadee/codex-shared-workflows@v2
        with:
          command: doc-sync
          doc_globs: |
            docs/**
            README.md
          comment: true
          auto_commit: true
          auto_push: true
          network_access: false
        env:
          CODEX_AUTH_JSON_B64: ${{ secrets.CODEX_AUTH_JSON_B64 }}
```

## CLI

```bash
export CODEX_AUTH_JSON_B64=...
export GITHUB_TOKEN=...

npx codex-workflows doc-sync \
  --doc-globs "docs/**\nREADME.md" \
  --prompt-template prompts/codex-doc-sync.md \
  --pull-number 128 \
  --enable-network \
  --dry-run
```
