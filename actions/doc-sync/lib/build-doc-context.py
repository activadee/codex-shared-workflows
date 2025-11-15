import fnmatch
import json
import os
import re
import subprocess
from pathlib import Path
from typing import Dict, List

def main() -> None:
    doc_globs_raw = os.environ.get('DOC_GLOBS', '')
    doc_globs = [line.strip() for line in doc_globs_raw.splitlines() if line.strip() and not line.strip().startswith('#')]
    if not doc_globs:
        doc_globs = [
            'docs/**/*.md',
            'docs/**/*.mdx',
            'docs/**/*.rst',
            'docs/**/*.adoc',
            'README.md',
            '*.md',
            '*.mdx',
            '*.rst',
        ]

    changed_files_path = Path(os.environ['CHANGED_FILES_PATH'])
    if not changed_files_path.exists():
        raise SystemExit(f"Changed files list not found at {changed_files_path}")

    changed_files = [line.strip() for line in changed_files_path.read_text().splitlines() if line.strip()]

    max_doc_files = max(1, int(os.environ.get('MAX_DOC_FILES', '12') or '12'))
    max_doc_chars = max(200, int(os.environ.get('MAX_DOC_CHARS', '6000') or '6000'))
    max_total_chars = max_doc_chars
    try:
        max_total_chars = max(max_doc_chars, int(os.environ.get('MAX_TOTAL_CHARS', '60000') or '60000'))
    except ValueError:
        max_total_chars = 60000

    context_path = Path(os.environ.get('CONTEXT_PATH', 'doc-context.md'))
    allowlist_path = Path(os.environ.get('ALLOWLIST_PATH', 'doc-allowlist.json'))

    result = subprocess.run(['git', 'ls-files', '-z'], check=True, capture_output=True, text=True)
    git_files = [p for p in result.stdout.split('\0') if p]

    def is_doc(file_path: str) -> bool:
        return any(fnmatch.fnmatch(file_path, pattern) for pattern in doc_globs)

    doc_files = [path for path in git_files if is_doc(path)]
    allowlist_path.write_text(json.dumps(sorted(doc_files), indent=2))

    if not doc_files:
        context_path.write_text('# Documentation Context\n\n_No documentation files matched the provided globs._\n')
        print(f"::warning::No documentation files matched the configured globs {doc_globs}")
        print(f"doc_context_path={context_path}")
        print(f"doc_allowlist_path={allowlist_path}")
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as fh:
            fh.write(f"doc_context_path={context_path}\n")
            fh.write(f"doc_allowlist_path={allowlist_path}\n")
        return

    token_re = re.compile(r'[^A-Za-z0-9]+')

    def tokenize(value: str) -> List[str]:
        return [chunk.lower() for chunk in token_re.split(value) if len(chunk) >= 3]

    keyword_counts: Dict[str, int] = {}
    for changed in changed_files:
        for token in tokenize(changed):
            keyword_counts[token] = keyword_counts.get(token, 0) + 1

    scores = []
    for path_str in doc_files:
        file_path = Path(path_str)
        try:
            content = file_path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            content = file_path.read_text(encoding='utf-8', errors='ignore')
        snippet = content[:max_doc_chars]
        lowered = snippet.lower()
        score = 0
        if path_str in changed_files:
            score += 5
        if path_str.lower().endswith('readme.md'):
            score += 4
        if path_str.startswith('docs/'):
            score += 1
        path_lower = path_str.lower()
        for token, weight in keyword_counts.items():
            if token in path_lower:
                score += 3 * weight
            elif token in lowered:
                score += 2 * weight
        scores.append({'path': path_str, 'score': score, 'snippet': snippet})

    scores.sort(key=lambda item: (-item['score'], item['path']))

    selected = []
    total_chars = 0
    for item in scores:
        if len(selected) >= max_doc_files:
            break
        snippet = item['snippet']
        if total_chars >= max_total_chars:
            break
        if not snippet.strip():
            continue
        length = len(snippet)
        if total_chars + length > max_total_chars and selected:
            break
        selected.append(item)
        total_chars += length

    if not selected and scores:
        selected.append(scores[0])

    lines = ['# Documentation Context', '']
    for item in selected:
        lines.append(f"## {item['path']} (score {item['score']})")
        lines.append('```markdown')
        lines.append(item['snippet'])
        lines.append('```')
        lines.append('')

    context_path.write_text('\n'.join(lines))

    with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as fh:
        fh.write(f"doc_context_path={context_path}\n")
        fh.write(f"doc_allowlist_path={allowlist_path}\n")

if __name__ == '__main__':
    main()
