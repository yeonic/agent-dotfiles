#!/usr/bin/env bash
# Remove symlinks (and merged Claude hooks) that point into this repo.
# Mirrors install-agents.sh targets. Does NOT restore backups — those remain as
# <path>.backup.<timestamp> and can be restored manually.
#
# Usage:
#   ./uninstall.sh                 # all targets (pi, claude, codex)
#   ./uninstall.sh claude codex    # selected targets
#   DRY_RUN=1 ./uninstall.sh       # show actions only

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN="${DRY_RUN:-0}"

PI_DIR="${PI_AGENT_DIR:-$HOME/.pi/agent}"
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
CODEX_DIR="${CODEX_DIR:-$HOME/.codex}"

SKILLS=(commit-message evolve-harness grill-me harness-ledger)

log()  { printf '\033[1;34m[uninstall]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }

# Remove dest only if it is a symlink pointing back into this repo.
unlink_if_ours() {
  local dest="$1"
  if [[ -L "$dest" ]]; then
    local target; target="$(readlink "$dest")"
    if [[ "$target" == "$ROOT/"* ]]; then
      log "rm    $dest"
      [[ "$DRY_RUN" == "1" ]] || rm "$dest"
      return
    fi
    warn "skip  $dest (links elsewhere: $target)"
  elif [[ -e "$dest" ]]; then
    warn "skip  $dest (not a symlink)"
  fi
}

uninstall_pi() {
  log "target: pi ($PI_DIR)"
  unlink_if_ours "$PI_DIR/AGENTS.md"
  unlink_if_ours "$PI_DIR/settings.json"
  unlink_if_ours "$PI_DIR/extensions/guardrails.json"
  unlink_if_ours "$PI_DIR/skills"
  unlink_if_ours "$PI_DIR/experimental"
  for dir in "$ROOT"/extensions/*/; do
    unlink_if_ours "$PI_DIR/extensions/$(basename "$dir")"
  done
}

uninstall_codex() {
  log "target: codex ($CODEX_DIR)"
  unlink_if_ours "$CODEX_DIR/AGENTS.md"
  for s in "${SKILLS[@]}"; do unlink_if_ours "$CODEX_DIR/skills/$s"; done
}

# Strip the harness hooks back out of ~/.claude/settings.json without touching
# anything else, then drop now-empty hook arrays/keys.
unmerge_claude_settings() {
  local settings="$CLAUDE_DIR/settings.json"
  local hooks="$ROOT/hooks"
  [[ -f "$settings" ]] || return 0
  local cleaned
  cleaned="$(jq --arg h "$hooks" '
    def strip: map(select((.hooks // []) | any(.command | contains($h)) | not));
    if .hooks then
      .hooks.SessionStart = ((.hooks.SessionStart // []) | strip)
      | .hooks.Stop        = ((.hooks.Stop // []) | strip)
      | .hooks |= with_entries(select(.value | length > 0))
      | if (.hooks | length) == 0 then del(.hooks) else . end
    else . end
  ' "$settings")"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "  DRY: strip harness hooks from $settings"
  else
    printf '%s\n' "$cleaned" > "$settings"
    log "stripped harness hooks from $settings"
  fi
}

uninstall_claude() {
  log "target: claude ($CLAUDE_DIR)"
  unlink_if_ours "$CLAUDE_DIR/CLAUDE.md"
  for s in "${SKILLS[@]}"; do unlink_if_ours "$CLAUDE_DIR/skills/$s"; done
  unmerge_claude_settings
}

targets=("$@")
[[ ${#targets[@]} -eq 0 ]] && targets=(pi claude codex)

[[ "$DRY_RUN" == "1" ]] && warn "dry-run mode (no changes)"
for t in "${targets[@]}"; do
  case "$t" in
    pi)     uninstall_pi ;;
    claude) uninstall_claude ;;
    codex)  uninstall_codex ;;
    *) warn "unknown target: $t (expected pi|claude|codex)"; exit 1 ;;
  esac
done

log "done. backups (if any) remain at *.backup.<timestamp>."
