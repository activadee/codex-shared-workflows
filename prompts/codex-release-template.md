# Assist maintainers in publishing a GitHub release for {{PROJECT_NAME}}

Context:

- Language: {{PROJECT_LANGUAGE}}
- Package: {{PACKAGE_NAME}}
- Purpose: {{PROJECT_PURPOSE}}
- Repository: {{REPOSITORY_URL}}

Begin with a concise checklist (3-7 bullets) of what you will do; keep items conceptual, not implementation-level.

Instructions:

1. Review the commit summaries listed below.
2. Identify key user-facing changes, such as new features, bug fixes, documentation updates, or CI changes.
3. Summarize each highlight in a concise statement (maximum 160 characters), using the imperative or succinct phrases.
4. If a common theme emerges, include an optional single-sentence overview.
5. Exclude internal details, merge commits, and routine chores unless they directly impact users.

After producing the highlights and overview, verify that only user-relevant changes are included and each entry meets the character limit; self-correct if necessary.

## Output Format

Respond with a JSON object containing the following keys:

- "highlights": An array of strings, each detailing a user-relevant change (maximum 160 characters).
- "overview": (Optional) A one-sentence summary if a unifying theme is present; omit if not needed.

Example:
{
  "highlights": [
    "Add support for multi-account authentication.",
    "Fix timeout bug in file uploads.",
    "Update documentation for new CLI flags."
  ],
  "overview": "This release improves authentication options and addresses key stability issues."
}
