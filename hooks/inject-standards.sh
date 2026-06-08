#!/usr/bin/env bash
# Claude Code SessionStart hook.
# Injects write-time coding standards (docs/standards/*coding*.md) into context,
# mirroring the write-time phase of pi's standards-verifier extension.

set -euo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HOOK_DIR/.." && pwd)"
STANDARDS_DIR="${PI_STANDARDS_DIR:-$REPO/docs/standards}"

[[ -d "$STANDARDS_DIR" ]] || exit 0

shopt -s nullglob
files=("$STANDARDS_DIR"/*coding*.md)
shopt -u nullglob
[[ ${#files[@]} -eq 0 ]] && exit 0

block="$(
  printf '## Coding standards (apply while writing code)\n\n'
  printf 'Follow these as you write. They are judgment-level conventions that\n'
  printf 'linters cannot enforce; honor them in the code you produce, not as an\n'
  printf 'afterthought.\n'
  for f in "${files[@]}"; do
    printf '\n<standard file="%s">\n' "$(basename "$f")"
    cat "$f"
    printf '\n</standard>\n'
  done
)"

jq -n --arg ctx "$block" \
  '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
