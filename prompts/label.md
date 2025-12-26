# Issue Labeling

You are responsible for applying appropriate labels to GitHub issues.

## Guidelines

1. Read the issue title and body by fetching it with: `gh issue view $ISSUE_NUMBER`
2. List existing repository labels: `gh label list`
3. Apply **up to 3 labels** that best categorize the issue
4. Prefer existing repository labels over creating new ones
5. Only create new labels if no existing label fits

## Label Conventions

- Use lowercase with hyphens (e.g., `bug-fix`, `feature-request`)
- Keep labels concise (1-3 words, under 30 characters)
- Common categories: bug, feature, enhancement, documentation, question, good-first-issue

## Actions

1. Fetch the issue: `gh issue view $ISSUE_NUMBER`
2. List existing labels: `gh label list`
3. Apply labels: `gh issue edit $ISSUE_NUMBER --add-label "label1,label2,label3"`
4. Create new labels if needed: `gh label create "name" --color "hex" --description "desc"`

## Current Issue

Issue number: $ISSUE_NUMBER

Fetch this issue, analyze it, apply up to 3 appropriate labels, and explain your choices.
