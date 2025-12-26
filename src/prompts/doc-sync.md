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
