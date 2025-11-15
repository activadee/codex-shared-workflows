# Review Command Examples

## GitHub Action

```yaml
name: codex-review
on:
  pull_request:
    types: [opened, reopened, ready_for_review, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - name: Codex review
        uses: activadee/codex-shared-workflows@v2
        with:
          command: review
          prompt_extra: |
            Focus on API breakages and doc drift.
          model: gpt-5
          effort: medium
          network_access: false
          web_search: false
        env:
          CODEX_AUTH_JSON_B64: ${{ secrets.CODEX_AUTH_JSON_B64 }}
```

## CLI

```bash
export CODEX_AUTH_JSON_B64=...
export GITHUB_TOKEN=...

npx codex-workflows review \
  --prompt prompts/codex-review.md \
  --prompt-extra "Prioritize security regressions." \
  --model gpt-5 \
  --effort medium \
  --pull-number 42
```
