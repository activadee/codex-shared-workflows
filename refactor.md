# Migration Plan: Codex → OpenCode

## Overview

| Item | Value |
|------|-------|
| **Repository Rename** | `codex-shared-workflows` → `opencode-shared-workflows` |
| **Primary Model** | `zai-coding-plan/glm-4.7` |
| **Fallback Model** | `opencode/big-pickle` |
| **Auth Secret** | `ZHIPU_API_KEY` |
| **Workflow Style** | Reusable (`workflow_call`) + Slash-command support |

---

## New Repository Structure

```
opencode-shared-workflows/
├── .github/
│   └── workflows/
│       ├── opencode-review.yml         # Reusable: Auto PR review
│       ├── opencode-label.yml          # Reusable: Auto issue labeling
│       ├── opencode-doc-sync.yml       # Reusable: Auto doc updates
│       └── opencode-interactive.yml    # Reusable: Slash-command handler
│
├── opencode.json                        # OpenCode config with agents
│
├── prompts/
│   ├── review.md                        # PR review instructions
│   ├── label.md                         # Issue labeling instructions
│   └── doc-sync.md                      # Documentation sync instructions
│
├── docs/
│   ├── setup.md                         # Installation guide
│   └── workflows/
│       ├── review.md
│       ├── label.md
│       └── doc-sync.md
│
└── README.md                            # Repository overview
```

**Files to DELETE:**
- `actions/` (entire directory)
- `prompts/codex-*.md` and `prompts/codex-*-schema.json`
- `.github/workflows/codex-review.yml`
- `.github/workflows/auto-label.yml`
- `.github/workflows/doc-sync.yml`
- `.github/workflows/issue-plan.yml`
- `.github/workflows/release.yml`
- `.github/workflows/go-tests.yml`
- `docs/workflows/auto-label.md`, `issue-plan.md`, `release.md`, `go-tests.md`
- `cli/`, `scripts/`, `tests/`, `workflow-templates/` (empty directories)
- `plan.md`

---

## Configuration Files

### `opencode.json` (Repository Root)

This config defines agents with prompts from external files. OpenCode reads this when running in the repo.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "zai-coding-plan": {
      "models": {
        "glm-4.7": {}
      }
    }
  },
  "agent": {
    "review": {
      "description": "Reviews pull requests for correctness, security, and maintainability",
      "mode": "primary",
      "model": "zai-coding-plan/glm-4.7",
      "prompt": "{file:./prompts/review.md}",
      "tools": {
        "write": false,
        "edit": false,
        "bash": true
      }
    },
    "label": {
      "description": "Suggests and applies labels to GitHub issues",
      "mode": "primary",
      "model": "zai-coding-plan/glm-4.7",
      "prompt": "{file:./prompts/label.md}",
      "tools": {
        "write": false,
        "edit": false,
        "bash": true
      }
    },
    "doc-sync": {
      "description": "Updates documentation to match code changes",
      "mode": "primary",
      "model": "zai-coding-plan/glm-4.7",
      "prompt": "{file:./prompts/doc-sync.md}",
      "tools": {
        "write": true,
        "edit": true,
        "bash": true
      },
      "permission": {
        "bash": {
          "git commit*": "allow",
          "git push*": "allow",
          "*": "ask"
        }
      }
    }
  }
}
```

---

## Prompt Files

### `prompts/review.md`

```markdown
# Pull Request Review

You are an automated code reviewer. Your task is to review the pull request and provide actionable feedback.

## Guidelines

1. **Scope**: Review only the changes introduced in this PR, not the entire codebase.
2. **Focus Areas**: Prioritize correctness, security, stability, and maintainability.
3. **Style**: Only mention style issues if they hide bugs or cause confusion.
4. **Feedback**: Be specific - reference file names and line numbers when possible.
5. **Approval**: If the PR looks good, approve it with a brief explanation.

## What to Look For

- Logic errors and edge cases
- Security vulnerabilities (injection, auth bypass, data exposure)
- Performance issues (N+1 queries, memory leaks, inefficient algorithms)
- Error handling and edge cases
- Test coverage for new functionality
- Breaking changes to public APIs

## Output

Provide your review as a comment on the PR. If you find issues:
- Clearly explain each issue
- Suggest how to fix it
- Rate severity (critical/high/medium/low)

If no significant issues are found, approve the PR with a summary of what was reviewed.
```

### `prompts/label.md`

```markdown
# Issue Labeling

You are responsible for applying appropriate labels to GitHub issues.

## Guidelines

1. Read the issue title and body carefully
2. Apply **up to 3 labels** that best categorize the issue
3. Prefer existing repository labels over creating new ones
4. Only create new labels if no existing label fits

## Label Conventions

- Use lowercase with hyphens (e.g., `bug-fix`, `feature-request`)
- Keep labels concise (1-3 words, under 30 characters)
- Common categories: bug, feature, enhancement, documentation, question, good-first-issue

## Actions

Use the GitHub CLI (`gh`) to:
1. List existing labels: `gh label list`
2. Apply labels: `gh issue edit <number> --add-label "label1,label2"`
3. Create new labels if needed: `gh label create "name" --color "hex" --description "desc"`

After applying labels, briefly explain your choices.
```

### `prompts/doc-sync.md`

```markdown
# Documentation Sync

You are responsible for keeping documentation in sync with code changes.

## Guidelines

1. Review the code changes in this PR
2. Identify documentation that needs updating
3. Edit documentation files to reflect the changes
4. Commit and push updates to this PR branch

## Documentation Files to Consider

- `README.md` (root level)
- `docs/**/*.md`
- Any `*.md` files at root level
- API documentation if applicable

## What to Update

- New features → Add documentation
- Changed behavior → Update existing docs
- Removed features → Remove or mark as deprecated
- New configuration options → Document them
- Changed APIs → Update examples

## Commit Convention

When committing documentation updates:
```
git add <files>
git commit -m "[skip ci] docs: sync documentation with code changes"
git push
```

## If No Updates Needed

If the code changes don't require documentation updates, do nothing and explain why.
```

---

## Workflow Files

### `.github/workflows/opencode-review.yml`

```yaml
name: OpenCode Review

on:
  workflow_call:
    inputs:
      model:
        description: Model to use for review
        required: false
        type: string
        default: zai-coding-plan/glm-4.7
      fallback_model:
        description: Fallback model if primary fails
        required: false
        type: string
        default: opencode/big-pickle
      share:
        description: Share the OpenCode session
        required: false
        type: boolean
        default: true
    secrets:
      ZHIPU_API_KEY:
        description: Z.AI API key for GLM models
        required: false

permissions:
  contents: read
  pull-requests: write
  id-token: write

concurrency:
  group: opencode-review-${{ github.event.pull_request.number || github.run_id }}
  cancel-in-progress: true

jobs:
  review:
    name: Review PR with OpenCode
    if: github.event.pull_request != null && github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: ${{ github.event.pull_request.head.sha }}

      - name: Checkout shared workflows
        uses: actions/checkout@v4
        with:
          repository: activadee/opencode-shared-workflows
          path: .opencode-shared
          sparse-checkout: |
            prompts/review.md
            opencode.json

      - name: Load review prompt
        id: prompt
        run: |
          PROMPT=$(cat .opencode-shared/prompts/review.md)
          echo "prompt<<EOF" >> $GITHUB_OUTPUT
          echo "$PROMPT" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Run OpenCode review
        uses: sst/opencode/github@latest
        env:
          ZHIPU_API_KEY: ${{ secrets.ZHIPU_API_KEY }}
        with:
          model: ${{ inputs.model }}
          prompt: ${{ steps.prompt.outputs.prompt }}
          share: ${{ inputs.share }}
```

### `.github/workflows/opencode-label.yml`

```yaml
name: OpenCode Label

on:
  workflow_call:
    inputs:
      model:
        description: Model to use for labeling
        required: false
        type: string
        default: zai-coding-plan/glm-4.7
      fallback_model:
        description: Fallback model if primary fails
        required: false
        type: string
        default: opencode/big-pickle
    secrets:
      ZHIPU_API_KEY:
        description: Z.AI API key for GLM models
        required: false

permissions:
  contents: read
  issues: write
  id-token: write

jobs:
  label:
    name: Label issue with OpenCode
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Checkout shared workflows
        uses: actions/checkout@v4
        with:
          repository: activadee/opencode-shared-workflows
          path: .opencode-shared
          sparse-checkout: prompts/label.md

      - name: Load label prompt
        id: prompt
        run: |
          PROMPT=$(cat .opencode-shared/prompts/label.md)
          echo "prompt<<EOF" >> $GITHUB_OUTPUT
          echo "$PROMPT" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Run OpenCode labeling
        uses: sst/opencode/github@latest
        env:
          ZHIPU_API_KEY: ${{ secrets.ZHIPU_API_KEY }}
        with:
          model: ${{ inputs.model }}
          prompt: |
            ${{ steps.prompt.outputs.prompt }}
            
            Apply appropriate labels to issue #${{ github.event.issue.number }}.
          share: false
```

### `.github/workflows/opencode-doc-sync.yml`

```yaml
name: OpenCode Doc Sync

on:
  workflow_call:
    inputs:
      model:
        description: Model to use for doc sync
        required: false
        type: string
        default: zai-coding-plan/glm-4.7
      fallback_model:
        description: Fallback model if primary fails
        required: false
        type: string
        default: opencode/big-pickle
    secrets:
      ZHIPU_API_KEY:
        description: Z.AI API key for GLM models
        required: false

permissions:
  contents: write
  pull-requests: read
  id-token: write

concurrency:
  group: opencode-doc-sync-${{ github.event.pull_request.number || github.run_id }}
  cancel-in-progress: true

jobs:
  doc-sync:
    name: Sync documentation with OpenCode
    if: github.event.pull_request != null && github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: ${{ github.event.pull_request.head.ref }}
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Configure git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

      - name: Checkout shared workflows
        uses: actions/checkout@v4
        with:
          repository: activadee/opencode-shared-workflows
          path: .opencode-shared
          sparse-checkout: prompts/doc-sync.md

      - name: Load doc-sync prompt
        id: prompt
        run: |
          PROMPT=$(cat .opencode-shared/prompts/doc-sync.md)
          echo "prompt<<EOF" >> $GITHUB_OUTPUT
          echo "$PROMPT" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Run OpenCode doc sync
        uses: sst/opencode/github@latest
        env:
          ZHIPU_API_KEY: ${{ secrets.ZHIPU_API_KEY }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          model: ${{ inputs.model }}
          prompt: ${{ steps.prompt.outputs.prompt }}
          share: false
```

### `.github/workflows/opencode-interactive.yml`

```yaml
name: OpenCode Interactive

on:
  workflow_call:
    inputs:
      model:
        description: Model to use
        required: false
        type: string
        default: zai-coding-plan/glm-4.7
      fallback_model:
        description: Fallback model if primary fails
        required: false
        type: string
        default: opencode/big-pickle
      mentions:
        description: Comma-separated trigger phrases
        required: false
        type: string
        default: "/opencode,/oc"
    secrets:
      ZHIPU_API_KEY:
        description: Z.AI API key for GLM models
        required: false

permissions:
  contents: write
  pull-requests: write
  issues: write
  id-token: write

jobs:
  interactive:
    name: Handle OpenCode mention
    if: |
      contains(github.event.comment.body, '/oc') ||
      contains(github.event.comment.body, '/opencode')
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Configure git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

      - name: Run OpenCode
        uses: sst/opencode/github@latest
        env:
          ZHIPU_API_KEY: ${{ secrets.ZHIPU_API_KEY }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          model: ${{ inputs.model }}
          mentions: ${{ inputs.mentions }}
          share: true
```

---

## Updated README.md

```markdown
# OpenCode Shared Workflows

Reusable GitHub Actions workflows powered by [OpenCode](https://opencode.ai) for automated code review, issue labeling, and documentation sync.

## Workflows

| Workflow | Purpose | Trigger |
|----------|---------|---------|
| `opencode-review.yml` | AI-powered PR code review | `pull_request` events |
| `opencode-label.yml` | Automatic issue labeling | `issues` events |
| `opencode-doc-sync.yml` | Sync documentation with code changes | `pull_request` events |
| `opencode-interactive.yml` | Slash-command handler (`/oc`, `/opencode`) | `issue_comment`, `pull_request_review_comment` |

## Quick Start

### 1. Install OpenCode GitHub App

Visit https://github.com/apps/opencode-agent and install it on your repository.

### 2. Add API Key Secret

Add `ZHIPU_API_KEY` to your repository secrets (Settings → Secrets → Actions).

Get your API key from [Z.AI Coding Plan](https://z.ai/subscribe).

### 3. Create Workflows

#### PR Review (Auto-triggered)

```yaml
# .github/workflows/pr-review.yml
name: PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

jobs:
  review:
    uses: activadee/opencode-shared-workflows/.github/workflows/opencode-review.yml@main
    secrets: inherit
```

#### Issue Labeling (Auto-triggered)

```yaml
# .github/workflows/issue-label.yml
name: Issue Label

on:
  issues:
    types: [opened, edited]

jobs:
  label:
    uses: activadee/opencode-shared-workflows/.github/workflows/opencode-label.yml@main
    secrets: inherit
```

#### Doc Sync (Auto-triggered)

```yaml
# .github/workflows/doc-sync.yml
name: Doc Sync

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  sync:
    uses: activadee/opencode-shared-workflows/.github/workflows/opencode-doc-sync.yml@main
    secrets: inherit
```

#### Interactive (Slash Commands)

```yaml
# .github/workflows/opencode.yml
name: OpenCode

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

jobs:
  opencode:
    uses: activadee/opencode-shared-workflows/.github/workflows/opencode-interactive.yml@main
    secrets: inherit
```

## Configuration

### Inputs

All workflows accept these optional inputs:

| Input | Default | Description |
|-------|---------|-------------|
| `model` | `zai-coding-plan/glm-4.7` | Primary AI model |
| `fallback_model` | `opencode/big-pickle` | Fallback if primary fails |

### Secrets

| Secret | Required | Description |
|--------|----------|-------------|
| `ZHIPU_API_KEY` | Yes | Z.AI API key for GLM models |

### Model Options

- **`zai-coding-plan/glm-4.7`** - Z.AI's latest model (200K context, free with Coding Plan)
- **`opencode/big-pickle`** - OpenCode's free model (200K context, no API key needed)

## Slash Commands

When using `opencode-interactive.yml`, users can trigger OpenCode by commenting:

```
/oc explain this issue
/opencode fix this bug
/oc review this PR
```

## License

MIT
```

---

## Migration Checklist

### Phase 1: Preparation
- [ ] Create `ZHIPU_API_KEY` secret in repository
- [ ] Install OpenCode GitHub App: https://github.com/apps/opencode-agent
- [ ] Fork/clone repo for testing

### Phase 2: Create New Files
- [ ] Create `opencode.json` in root
- [ ] Create `prompts/review.md`
- [ ] Create `prompts/label.md`
- [ ] Create `prompts/doc-sync.md`
- [ ] Create `.github/workflows/opencode-review.yml`
- [ ] Create `.github/workflows/opencode-label.yml`
- [ ] Create `.github/workflows/opencode-doc-sync.yml`
- [ ] Create `.github/workflows/opencode-interactive.yml`

### Phase 3: Delete Old Files
- [ ] Delete `actions/` directory
- [ ] Delete `prompts/codex-*.md` and `prompts/codex-*-schema.json`
- [ ] Delete `.github/workflows/codex-review.yml`
- [ ] Delete `.github/workflows/auto-label.yml`
- [ ] Delete `.github/workflows/doc-sync.yml`
- [ ] Delete `.github/workflows/issue-plan.yml`
- [ ] Delete `.github/workflows/release.yml`
- [ ] Delete `.github/workflows/go-tests.yml`
- [ ] Delete old docs in `docs/workflows/`
- [ ] Delete empty directories (`cli/`, `scripts/`, `tests/`, `workflow-templates/`)
- [ ] Delete `plan.md`

### Phase 4: Update Documentation
- [ ] Rewrite `README.md` with new content
- [ ] Update `docs/setup.md` with installation instructions
- [ ] Create workflow-specific docs

### Phase 5: Rename Repository
- [ ] Rename `codex-shared-workflows` → `opencode-shared-workflows`
- [ ] Update all internal references to new name

---

## Technical Details

### Model Configuration

**Primary Model**: `zai-coding-plan/glm-4.7`
- Provider: Z.AI Coding Plan
- Context: 204,800 tokens
- Output: 131,072 tokens
- Cost: Free with Coding Plan subscription
- Environment Variable: `ZHIPU_API_KEY`
- API Endpoint: `https://api.z.ai/api/coding/paas/v4`

**Fallback Model**: `opencode/big-pickle`
- Provider: OpenCode
- Context: 200,000 tokens
- Output: 128,000 tokens
- Cost: Free (no API key needed)

### Key Differences from Codex

| Aspect | Codex (Old) | OpenCode (New) |
|--------|-------------|----------------|
| **Auth** | `CODEX_AUTH_JSON_B64` (Base64 ChatGPT auth) | `ZHIPU_API_KEY` (simple API key) |
| **Actions** | Complex composite actions in `actions/` | Single `sst/opencode/github@latest` |
| **Prompts** | Templated with JSON schemas | Simple markdown instructions |
| **Output** | Structured JSON, parsed by workflows | OpenCode handles output directly |
| **Complexity** | High (many files, multi-step) | Low (single action per workflow) |
| **Model** | GPT-5.1-codex variants | GLM-4.7 via Z.AI Coding Plan |

### OpenCode GitHub Action Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `model` | Yes | - | Model to use (format: `provider/model`) |
| `agent` | No | - | Agent to use (must be primary agent) |
| `share` | No | `true` (public repos) | Share OpenCode session |
| `prompt` | No | - | Custom prompt override |
| `use_github_token` | No | `false` | Use GITHUB_TOKEN instead of OpenCode App |
| `mentions` | No | `/opencode,/oc` | Trigger phrases for interactive mode |
