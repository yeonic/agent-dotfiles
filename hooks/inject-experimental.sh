#!/usr/bin/env bash
# Claude Code SessionStart hook.
# Injects docs/experimental/*.md as additional context, mirroring the pi
# experimental-injector extension. Once per session (startup/resume/clear/compact)
# instead of pi's per-turn injection — leaner for Claude's accumulating transcript.

set -euo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HOOK_DIR/.." && pwd)"
EXP_DIR="${PI_EXPERIMENTAL_DIR:-$REPO/docs/experimental}"

[[ -d "$EXP_DIR" ]] || exit 0

shopt -s nullglob
files=("$EXP_DIR"/*.md)
shopt -u nullglob
[[ ${#files[@]} -eq 0 ]] && exit 0

block="$(
  printf '## Experimental Rules (under evaluation)\n\n'
  printf 'The following rules are being tested. Apply them like permanent rules,\n'
  printf 'but treat them as not yet finalized — feedback in actual use will\n'
  printf 'decide whether they graduate to integrated rules.\n'
  for f in "${files[@]}"; do
    printf '\n<!-- experimental: %s -->\n' "$(basename "$f")"
    cat "$f"
  done
)"

jq -n --arg ctx "$block" \
  '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
