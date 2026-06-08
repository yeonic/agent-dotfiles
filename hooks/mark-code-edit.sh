#!/usr/bin/env bash
# Claude Code PostToolUse hook (matcher: Edit|Write|MultiEdit|NotebookEdit).
# Drops a per-session marker when a *code* file was edited this turn, so the Stop
# hook (verify-standards.sh) fires the self-review only after real code edits —
# not whenever the working tree merely happens to be dirty.

input="$(cat)"

path="$(printf '%s' "$input" | jq -r '
  .tool_input.file_path // .tool_input.path // .tool_input.notebook_path // empty
' 2>/dev/null)"
[[ -z "$path" ]] && exit 0

case "$path" in
  *.py|*.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.go|*.rs|*.java|*.kt|*.rb|*.php|*.cs|\
  *.swift|*.c|*.h|*.cc|*.cpp|*.hpp|*.sh|*.bash|*.sql) ;;
  *) exit 0 ;;
esac
# Standards docs and generated context are not "code under review".
case "$path" in
  */docs/standards/*|*AGENTS.md|*CLAUDE.md) exit 0 ;;
esac

session="$(printf '%s' "$input" | jq -r '.session_id // "default"' 2>/dev/null)"
: > "$HOME/.claude/.standards-review-pending-${session}"
exit 0
