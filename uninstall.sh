#!/usr/bin/env bash
# Remove symlinks that point into this repo from ~/.pi/agent.
# Does NOT restore backups (those remain as <path>.backup.<timestamp>).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PI="${PI_AGENT_DIR:-$HOME/.pi/agent}"

log()  { printf '\033[1;34m[uninstall]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }

unlink_if_ours() {
  local dest="$1"
  if [[ -L "$dest" ]]; then
    local target
    target="$(readlink "$dest")"
    if [[ "$target" == "$ROOT/"* ]]; then
      log "rm    $dest"
      rm "$dest"
      return
    fi
    warn "skip  $dest (links elsewhere: $target)"
  elif [[ -e "$dest" ]]; then
    warn "skip  $dest (not a symlink)"
  fi
}

unlink_if_ours "$PI/AGENTS.md"
unlink_if_ours "$PI/settings.json"
unlink_if_ours "$PI/extensions/guardrails.json"
unlink_if_ours "$PI/skills"
unlink_if_ours "$PI/experimental"
for dir in "$ROOT"/extensions/*/; do
  name="$(basename "$dir")"
  unlink_if_ours "$PI/extensions/$name"
done

log "done. backups (if any) remain at *.backup.<timestamp>."
