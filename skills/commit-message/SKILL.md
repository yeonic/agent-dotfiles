---
name: commit-message
description: Write a git commit message in the user's house style. Trigger when the user asks to commit, says "커밋 메시지 써줘", asks for a commit message draft, or when about to invoke `git commit` after permission has been granted.
---

# commit-message

Write commit messages in the user's house style. Short, typed, no ceremony.

## Format

```
{TYPE}: {one-line body}
```

- `{TYPE}` and `{body}` are separated by `: ` (colon + single space).
- No scope, no footer, no body paragraphs. Single line, period.

## Type (uppercase, pick exactly one)

- `FEATURE` — user-visible new capability
- `FIX` — bug fix
- `CHORE` — tooling, config, deps, build, non-code housekeeping
- `REFACTOR` — internal restructure without behavior change
- `DOCS` — documentation only

If the change spans types, pick the dominant one. Don't invent new types.

## Body

- **One line. Concise.** Don't try to explain everything in the commit message itself — the diff, PR description, and code review carry the detail.
- Imperative mood (`add`, `fix`, `remove`), not past tense.
- No trailing period.
- Lowercase first letter unless it's a proper noun / identifier.
- Reference specific symbols/files only when it materially helps recall.

## Hard prohibitions

- **No `Co-authored-by: Claude …` trailer.** Do not add it under any circumstance.
- No `🤖 Generated with …` line, no tool attribution, no emoji.
- No `Signed-off-by` unless the user asks.
- No `Fixes #123` / `Closes #123` footer unless the user asks (PR description handles linkage).

## Examples

Good:
```
FIX: map snake_case DB source to API enum in dedup ItemBase
FEATURE: add ThirdBridge connector pagination
REFACTOR: extract document_sort_key from _deduplicate_documents
CHORE: bump pydantic to 2.10
DOCS: clarify SourceType vs SourceTypeAPI usage
```

Bad:
```
fix: dedup error                          # type must be uppercase
FIX(dedup): map source enum               # no scope
FIX - map source enum                     # separator is ": "
FIX: map snake_case DB source to API enum in dedup ItemBase

The deduplication path was passing the raw DB value...    # no body paragraph

Co-authored-by: Claude <noreply@anthropic.com>            # forbidden
```

## When asked to draft only (no commit yet)

Print the single-line message in a code block and stop. Do not run `git commit` — that needs separate explicit permission per the Git Operations policy.
